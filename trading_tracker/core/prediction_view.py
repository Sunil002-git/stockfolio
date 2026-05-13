"""
Stockfolio — Enhanced Stock Prediction View
============================================
5-model adaptive ensemble + real-time news sentiment analysis.

Models:
  1. Linear Regression       — baseline trend (sklearn)
  2. Random Forest           — non-linear patterns, resistant to outliers (sklearn)
  3. XGBoost                 — gradient boosting, best on structured data (xgboost)
  4. ARIMA                   — classical time-series autocorrelation (statsmodels)
  5. EMA drift               — momentum extrapolation

Ensemble:
  Weights are NOT hardcoded — each model is backtested on the last 30 days
  and gets a weight proportional to 1/RMSE (better accuracy = higher weight).

News Sentiment:
  Fetches last 10 news headlines from Google News RSS for the ticker
  and its sector. VADER sentiment scorer adjusts the final signal
  and nudges the forecast slightly in the direction of market mood.
  No API key required.

Requirements:
    pip install yfinance scikit-learn xgboost statsmodels vaderSentiment pandas numpy
"""

import re
import time
import urllib.request
import xml.etree.ElementTree as ET
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

# ── Optional deps ─────────────────────────────────────────────────────────────
try:
    import yfinance as yf
    YFINANCE_OK = True
except ImportError:
    YFINANCE_OK = False

try:
    from sklearn.linear_model import LinearRegression
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.preprocessing import MinMaxScaler
    from sklearn.metrics import mean_squared_error, r2_score
    SKLEARN_OK = True
except ImportError:
    SKLEARN_OK = False

try:
    import xgboost as xgb
    XGB_OK = True
except ImportError:
    XGB_OK = False

try:
    from statsmodels.tsa.arima.model import ARIMA
    import warnings
    warnings.filterwarnings("ignore")
    ARIMA_OK = True
except ImportError:
    ARIMA_OK = False

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    VADER_OK = True
except ImportError:
    VADER_OK = False

PREDICTION_AVAILABLE = YFINANCE_OK and SKLEARN_OK


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE ENGINEERING
# ══════════════════════════════════════════════════════════════════════════════

def _make_features(close, window=60):
    """
    Build a supervised learning feature matrix from a price series.
    Each row = one trading day.
    Features: lagged prices (t-1..t-5), rolling mean/std, RSI, momentum.
    Target: next day close.
    """
    s = pd.Series(close)
    df = pd.DataFrame()

    # Lagged prices
    for lag in range(1, 6):
        df[f'lag_{lag}'] = s.shift(lag)

    # Rolling statistics
    for w in [5, 10, 20]:
        df[f'rolling_mean_{w}'] = s.rolling(w).mean()
        df[f'rolling_std_{w}']  = s.rolling(w).std()

    # RSI-like momentum
    delta = s.diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    rs    = gain / loss.replace(0, np.nan)
    df['rsi'] = (100 - 100 / (1 + rs))

    # Price momentum
    df['mom_5']  = s.pct_change(5)
    df['mom_20'] = s.pct_change(20)

    # EMA ratio (short/long crossover signal)
    ema12 = s.ewm(span=12, adjust=False).mean()
    ema26 = s.ewm(span=26, adjust=False).mean()
    df['ema_ratio'] = ema12 / ema26

    df['target'] = s.shift(-1)  # next day close
    df = df.dropna()

    X = df.drop('target', axis=1).values
    y = df['target'].values
    return X, y, df.drop('target', axis=1).columns.tolist()


# ══════════════════════════════════════════════════════════════════════════════
# INDIVIDUAL MODELS
# ══════════════════════════════════════════════════════════════════════════════

def _train_lr(X_train, y_train):
    m = LinearRegression()
    m.fit(X_train, y_train)
    return m

def _train_rf(X_train, y_train):
    m = RandomForestRegressor(n_estimators=200, max_depth=8, random_state=42, n_jobs=-1)
    m.fit(X_train, y_train)
    return m

def _train_xgb(X_train, y_train):
    if not XGB_OK:
        return None
    m = xgb.XGBRegressor(
        n_estimators=300, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        random_state=42, verbosity=0
    )
    m.fit(X_train, y_train, verbose=False)
    return m

def _arima_forecast(close, steps):
    """
    ARIMA(2,1,2) forecast. Returns list of length `steps`.
    Falls back to last price if ARIMA fails.
    """
    if not ARIMA_OK or len(close) < 50:
        return [float(close[-1])] * steps
    try:
        model  = ARIMA(close[-200:], order=(2, 1, 2))
        fitted = model.fit(method_kwargs={"warn_convergence": False})
        fc     = fitted.forecast(steps=steps)
        return [round(float(v), 2) for v in fc]
    except Exception:
        # Fallback: simple random-walk with last known drift
        drift  = float(np.mean(np.diff(close[-20:])))
        result = []
        last   = float(close[-1])
        for i in range(steps):
            last += drift
            result.append(round(last, 2))
        return result

def _ema_forecast(close, steps):
    """EMA-drift extrapolation (existing model B, kept for ensemble)."""
    s     = pd.Series(close)
    cur   = float(close[-1])
    ema12 = float(s.ewm(span=12, adjust=False).mean().iloc[-1])
    ema26 = float(s.ewm(span=26, adjust=False).mean().iloc[-1])
    drift = np.clip((ema12 - ema26) / (cur * 26), -0.005, 0.005)
    return [round(cur * (1 + drift * (i + 1)), 2) for i in range(steps)]


# ══════════════════════════════════════════════════════════════════════════════
# ADAPTIVE BACKTEST — weights each model by recent accuracy
# ══════════════════════════════════════════════════════════════════════════════

def _backtest_models(close):
    """
    Walk-forward validation on last 30 days.
    Each model predicts one day at a time using data up to that point.
    Returns per-model RMSE used to compute adaptive weights.
    """
    test_window = 30
    if len(close) < test_window + 100:
        # Not enough data — use equal weights
        n = 4 if XGB_OK else 3
        return None, {'lr': 1/n, 'rf': 1/n, 'xgb': 1/n if XGB_OK else 0, 'arima': 1/n, 'ema': 0}

    results = {'lr': [], 'rf': [], 'xgb': [], 'arima': [], 'ema': []}
    actuals = []

    for step in range(test_window, 0, -1):
        train_close = close[:-(step)]
        true_next   = float(close[-step])
        actuals.append(true_next)

        X, y, _ = _make_features(train_close)
        if len(X) < 20:
            continue
        split    = int(len(X) * 0.85)
        X_tr, y_tr = X[:split], y[:split]

        # Current feature row (last row of feature matrix)
        x_cur = X[-1].reshape(1, -1)

        try:
            lr_pred = float(_train_lr(X_tr, y_tr).predict(x_cur)[0])
            results['lr'].append((lr_pred, true_next))
        except Exception:
            pass

        try:
            rf_pred = float(_train_rf(X_tr, y_tr).predict(x_cur)[0])
            results['rf'].append((rf_pred, true_next))
        except Exception:
            pass

        if XGB_OK:
            try:
                xgb_pred = float(_train_xgb(X_tr, y_tr).predict(x_cur)[0])
                results['xgb'].append((xgb_pred, true_next))
            except Exception:
                pass

        try:
            arima_fc = _arima_forecast(train_close, 1)
            results['arima'].append((arima_fc[0], true_next))
        except Exception:
            pass

        try:
            ema_fc = _ema_forecast(train_close, 1)
            results['ema'].append((ema_fc[0], true_next))
        except Exception:
            pass

    # Compute RMSE per model
    rmse_map = {}
    for name, pairs in results.items():
        if len(pairs) < 5:
            rmse_map[name] = float('inf')
        else:
            preds   = np.array([p for p, _ in pairs])
            acts    = np.array([a for _, a in pairs])
            rmse_map[name] = float(np.sqrt(mean_squared_error(acts, preds)))

    # Accuracy metrics for display (use best model's numbers)
    best_name = min(rmse_map, key=lambda k: rmse_map[k] if rmse_map[k] != float('inf') else 99999)
    best_pairs = results.get(best_name, [])
    accuracy = None
    if best_pairs:
        preds  = np.array([p for p, _ in best_pairs])
        acts   = np.array([a for _, a in best_pairs])
        mse    = float(mean_squared_error(acts, preds))
        r2     = float(r2_score(acts, preds))
        accuracy = {
            'mse':    round(mse, 4),
            'rmse':   round(mse ** 0.5, 4),
            'r2':     round(r2, 4),
            'r2_pct': round(r2 * 100, 1),
            'best_model': best_name.upper(),
        }

    # Compute inverse-RMSE weights (lower error = higher weight)
    inv = {k: (1.0 / v if v not in (0, float('inf')) else 0) for k, v in rmse_map.items()}
    total = sum(inv.values()) or 1
    weights = {k: inv[k] / total for k in inv}

    return accuracy, weights


# ══════════════════════════════════════════════════════════════════════════════
# ADAPTIVE ENSEMBLE FORECAST
# ══════════════════════════════════════════════════════════════════════════════

def _ensemble_forecast(close, forecast_days):
    """
    Train all models on full history, generate `forecast_days` predictions,
    blend by adaptive weights from backtest, return (prices, upper, lower).
    """
    accuracy, weights = _backtest_models(close)

    # Train on full data
    X, y, _ = _make_features(close)
    split    = int(len(X) * 0.9)
    X_tr, y_tr = X[:split], y[:split]

    lr_model   = _train_lr(X_tr, y_tr)
    rf_model   = _train_rf(X_tr, y_tr)
    xgb_model  = _train_xgb(X_tr, y_tr) if XGB_OK else None

    arima_fc   = _arima_forecast(close, forecast_days)
    ema_fc     = _ema_forecast(close, forecast_days)

    # Iterative multi-step forecast for ML models
    # (each step appends the predicted price and recalculates features)
    def _iter_forecast(model, horizon):
        preds     = []
        sim_close = close.copy().tolist()
        for _ in range(horizon):
            Xf, _, _ = _make_features(np.array(sim_close))
            if len(Xf) == 0:
                preds.append(sim_close[-1])
                continue
            p = float(model.predict(Xf[-1].reshape(1, -1))[0])
            preds.append(round(p, 2))
            sim_close.append(p)
        return preds

    lr_fc  = _iter_forecast(lr_model, forecast_days)
    rf_fc  = _iter_forecast(rf_model, forecast_days)
    xgb_fc = _iter_forecast(xgb_model, forecast_days) if xgb_model else lr_fc

    # Daily volatility for confidence bands
    vol = float(pd.Series(close).pct_change().tail(60).std())
    cur = float(close[-1])

    prices, upper, lower = [], [], []
    for i in range(forecast_days):
        p = (
            weights.get('lr',    0) * lr_fc[i]   +
            weights.get('rf',    0) * rf_fc[i]   +
            weights.get('xgb',   0) * xgb_fc[i]  +
            weights.get('arima', 0) * arima_fc[i] +
            weights.get('ema',   0) * ema_fc[i]
        )
        p = round(p, 2)
        spread = cur * vol * ((i + 1) ** 0.5) * 1.5
        prices.append(p)
        upper.append(round(p + spread, 2))
        lower.append(round(p - spread, 2))

    return prices, upper, lower, accuracy, weights


# ══════════════════════════════════════════════════════════════════════════════
# NEWS SENTIMENT
# ══════════════════════════════════════════════════════════════════════════════

def _fetch_news_sentiment(ticker, sector=None):
    """
    Fetch headlines from Google News RSS for the ticker (and sector if given).
    Score with VADER. Return structured sentiment result with headlines.
    No API key needed.
    """
    if not VADER_OK:
        return None

    analyzer  = SentimentIntensityAnalyzer()
    headlines = []

    def _rss_headlines(query, max_items=8):
        q   = urllib.parse.quote(query)
        url = f"https://news.google.com/rss/search?q={q}+stock&hl=en-IN&gl=IN&ceid=IN:en"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=5) as resp:
                xml   = resp.read().decode('utf-8', errors='ignore')
                root  = ET.fromstring(xml)
                items = root.findall('.//item')[:max_items]
                result = []
                for item in items:
                    title = item.findtext('title', '').strip()
                    # Strip source from title "Headline - Source Name"
                    title = re.sub(r'\s*-\s*[^-]+$', '', title).strip()
                    pub   = item.findtext('pubDate', '')
                    if title:
                        result.append({'title': title, 'published': pub[:16]})
                return result
        except Exception:
            return []

    # Fetch ticker-specific news
    ticker_news = _rss_headlines(ticker.replace('.NS', '').replace('.BO', ''))
    headlines.extend(ticker_news)

    # Fetch sector news if available
    if sector:
        sector_news = _rss_headlines(f"{sector} India")
        headlines.extend(sector_news[:4])

    if not headlines:
        return None

    # Score each headline
    scored = []
    for h in headlines:
        vs = analyzer.polarity_scores(h['title'])
        scored.append({
            'headline':  h['title'],
            'published': h['published'],
            'score':     round(vs['compound'], 3),
            'sentiment': 'positive' if vs['compound'] >= 0.05
                         else 'negative' if vs['compound'] <= -0.05
                         else 'neutral',
        })

    # Aggregate
    scores = [s['score'] for s in scored]
    avg    = float(np.mean(scores))

    pos_count = sum(1 for s in scored if s['sentiment'] == 'positive')
    neg_count = sum(1 for s in scored if s['sentiment'] == 'negative')
    neu_count = sum(1 for s in scored if s['sentiment'] == 'neutral')

    overall = ('positive' if avg >= 0.05
               else 'negative' if avg <= -0.05
               else 'neutral')

    return {
        'overall':       overall,
        'score':         round(avg, 3),
        'pos_count':     pos_count,
        'neg_count':     neg_count,
        'neu_count':     neu_count,
        'total':         len(scored),
        'headlines':     scored[:8],    # return top 8 to frontend
        'sector':        sector or '',
    }

import urllib.parse


def _apply_sentiment_adjustment(prices, sentiment_result, cur_price):
    """
    Nudge forecast prices slightly in the direction of news sentiment.
    Max adjustment: ±1.5% of current price over the full forecast horizon.
    This is a small signal — the ML models carry the main weight.
    """
    if not sentiment_result:
        return prices
    score = sentiment_result['score']   # -1 to +1
    max_nudge = cur_price * 0.015       # 1.5% max
    adjusted = []
    n = len(prices)
    for i, p in enumerate(prices):
        # Nudge grows linearly over the forecast period
        nudge = score * max_nudge * ((i + 1) / n)
        adjusted.append(round(p + nudge, 2))
    return adjusted


# ══════════════════════════════════════════════════════════════════════════════
# TECHNICAL INDICATORS
# ══════════════════════════════════════════════════════════════════════════════

def _rsi(close, period=14):
    delta = pd.Series(close).diff()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    rs    = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).round(2).tolist()

def _macd(close):
    s      = pd.Series(close)
    line   = s.ewm(span=12, adjust=False).mean() - s.ewm(span=26, adjust=False).mean()
    signal = line.ewm(span=9, adjust=False).mean()
    return line.round(2).tolist(), signal.round(2).tolist(), (line - signal).round(2).tolist()

def _bollinger(close, period=20, mult=2.0):
    s   = pd.Series(close)
    ma  = s.rolling(period).mean()
    std = s.rolling(period).std()
    return (ma + mult * std).round(2).tolist(), ma.round(2).tolist(), (ma - mult * std).round(2).tolist()

def _support_resistance(close, window=20):
    s       = pd.Series(close).tail(120)
    cur     = float(close[-1])
    sup, res = [], []
    for i in range(window, len(s) - window):
        v = s.iloc[i]
        if v == s.iloc[i - window:i + window + 1].min(): sup.append(round(float(v), 2))
        if v == s.iloc[i - window:i + window + 1].max(): res.append(round(float(v), 2))
    sup = sorted(set(sup), key=lambda x: abs(x - cur))[:3]
    res = sorted(set(res), key=lambda x: abs(x - cur))[:3]
    return sorted(sup), sorted(res)


# ══════════════════════════════════════════════════════════════════════════════
# SIGNAL — now also considers sentiment
# ══════════════════════════════════════════════════════════════════════════════

def _signal(future_prices, cur, rsi_val, macd_val, macd_sig_val, sentiment=None):
    if not future_prices or cur <= 0:
        return 'HOLD', 0.0

    chg       = (future_prices[-1] - cur) / cur * 100
    macd_bull = macd_val > macd_sig_val

    # Sentiment modifier: strong sentiment overrides borderline signals
    sent_score  = sentiment['score'] if sentiment else 0
    sent_boost  = abs(sent_score) > 0.2     # meaningful sentiment signal

    if chg > 3 and (macd_bull or rsi_val <= 35):
        # Negative news can downgrade BUY → HOLD
        if sent_score < -0.3 and not sent_boost:
            return 'HOLD', round(chg, 2)
        return 'BUY', round(chg, 2)

    if chg < -3 and (not macd_bull or rsi_val >= 65):
        # Positive news can upgrade SELL → HOLD
        if sent_score > 0.3 and not sent_boost:
            return 'HOLD', round(chg, 2)
        return 'SELL', round(chg, 2)

    # HOLD with sentiment tilt
    if sent_score >= 0.2 and chg > 1:
        return 'BUY',  round(chg, 2)
    if sent_score <= -0.2 and chg < -1:
        return 'SELL', round(chg, 2)

    return 'HOLD', round(chg, 2)


# ══════════════════════════════════════════════════════════════════════════════
# DATA FETCHER
# ══════════════════════════════════════════════════════════════════════════════

def _fetch(ticker, from_date=None, to_date=None):
    now   = datetime.now()
    start = from_date if from_date else datetime(now.year - 10, now.month, now.day)
    end   = to_date   if to_date   else now
    try:
        df = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=True)
    except Exception as e:
        return None, None, str(e)

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] if c[0] else c[1] for c in df.columns]

    if df.empty:
        return None, None, (
            f"No data for '{ticker}'. "
            "NSE stocks: add .NS (e.g. RELIANCE.NS). US stocks: plain ticker (e.g. AAPL)."
        )

    df = df.reset_index()
    df.columns = [str(c).strip() for c in df.columns]

    if 'Close' not in df.columns:
        col = next((c for c in df.columns if c.lower() == 'close'), None)
        if not col: return None, None, f"No Close column. Got: {list(df.columns)}"
        df.rename(columns={col: 'Close'}, inplace=True)

    if 'Date' not in df.columns:
        col = next((c for c in df.columns if c.lower() in ('date', 'datetime', 'index')), None)
        df.rename(columns={col: 'Date'}, inplace=True) if col else df.insert(0, 'Date', df.index)

    # Fetch sector info (best-effort, don't fail if unavailable)
    sector = None
    try:
        info   = yf.Ticker(ticker).info
        sector = info.get('sector') or info.get('industryDisp') or None
    except Exception:
        pass

    return df, sector, None


# ══════════════════════════════════════════════════════════════════════════════
# VIEW
# ══════════════════════════════════════════════════════════════════════════════

class StockPredictionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        models_available = ['LinearRegression', 'RandomForest']
        if XGB_OK:   models_available.append('XGBoost')
        if ARIMA_OK: models_available.append('ARIMA')
        models_available.append('EMA')

        return Response({
            'ready':            PREDICTION_AVAILABLE,
            'models':           models_available,
            'sentiment':        VADER_OK,
            'method':           'Adaptive Ensemble (weights by backtest RMSE)',
            'model_file':       'None required',
            'missing':          [d for d, ok in [
                                    ('yfinance',     YFINANCE_OK),
                                    ('scikit-learn', SKLEARN_OK),
                                    ('xgboost',      XGB_OK),
                                    ('statsmodels',  ARIMA_OK),
                                    ('vaderSentiment', VADER_OK),
                                ] if not ok],
        })

    def post(self, request):
        if not PREDICTION_AVAILABLE:
            miss = [d for d, ok in [('yfinance', YFINANCE_OK), ('scikit-learn', SKLEARN_OK)] if not ok]
            return Response({"error": f"Missing packages: {', '.join(miss)}"}, status=503)

        ticker        = request.data.get('ticker', '').strip().upper()
        forecast_days = max(7, min(int(request.data.get('forecast_days', 30)), 90))

        if not ticker:
            return Response({"error": "Ticker is required."}, status=400)

        # User settings date range
        from_date = to_date = None
        try:
            from .models import UserSettings
            us, _ = UserSettings.objects.get_or_create(user=request.user)
            from_date = us.predict_from_date
            to_date   = us.predict_to_date
        except Exception:
            pass

        # Fetch OHLCV + sector
        df, sector, err = _fetch(ticker, from_date=from_date, to_date=to_date)
        if err:
            return Response({"error": err}, status=404 if 'No data' in err else 400)

        close = df['Close'].values.astype(float)
        dates = pd.to_datetime(df['Date']).dt.strftime('%Y-%m-%d').tolist()

        if len(close) < 120:
            return Response({"error": f"Only {len(close)} data points. Need 120+."}, status=400)

        # ── Technical indicators ──────────────────────────────────────────────
        ma100                   = pd.Series(close).rolling(100).mean().round(2).tolist()
        ma200                   = pd.Series(close).rolling(200).mean().round(2).tolist()
        rsi                     = _rsi(close)
        macd_l, macd_s, macd_h = _macd(close)
        bb_u,   bb_m,   bb_l   = _bollinger(close)
        supports, resistances   = _support_resistance(close)

        # ── Ensemble forecast (the heavy ML work) ────────────────────────────
        prices, b_upper, b_lower, accuracy, weights = _ensemble_forecast(close, forecast_days)

        # ── News sentiment ────────────────────────────────────────────────────
        sentiment = _fetch_news_sentiment(ticker, sector)

        # Apply sentiment nudge to forecast
        cur_price = round(float(close[-1]), 2)
        prices    = _apply_sentiment_adjustment(prices, sentiment, cur_price)

        # ── Signal (now sentiment-aware) ──────────────────────────────────────
        def _last(lst): return float(lst[-1]) if lst and lst[-1] is not None else 0.0
        sig, chg = _signal(
            prices, cur_price,
            _last(rsi), _last(macd_l), _last(macd_s),
            sentiment
        )

        # ── Future weekday dates ──────────────────────────────────────────────
        future_dates, day = [], datetime.now()
        while len(future_dates) < forecast_days:
            day += timedelta(days=1)
            if day.weekday() < 5:
                future_dates.append(day.strftime('%Y-%m-%d'))

        # ── Slice historical to last 500 for chart ────────────────────────────
        W = -500
        def _safe(lst):
            return [None if (v is None or (isinstance(v, float) and np.isnan(v)))
                    else round(float(v), 2) for v in lst[W:]]

        accuracy = accuracy or {'mse': 0, 'rmse': 0, 'r2': 0, 'r2_pct': 0, 'best_model': 'LR'}

        # Model weight summary for frontend display
        weight_display = {
            k.upper(): round(v * 100, 1)
            for k, v in weights.items()
            if v > 0.01
        }

        return Response({
            'ticker':        ticker,
            'status':        'success',
            'method':        'Adaptive Ensemble (5 models, weighted by backtest RMSE)',
            'models_used':   weight_display,
            'sector':        sector or '',

            'historical': {
                'dates':        dates[W:],
                'close':        [round(float(v), 2) for v in close[W:]],
                'ma100':        _safe(ma100),
                'ma200':        _safe(ma200),
                'rsi':          _safe(rsi),
                'macd':         _safe(macd_l),
                'macd_signal':  _safe(macd_s),
                'macd_hist':    _safe(macd_h),
                'bb_upper':     _safe(bb_u),
                'bb_lower':     _safe(bb_l),
            },

            'forecast': {
                'dates':        future_dates,
                'prices':       prices,
                'bands_upper':  b_upper,
                'bands_lower':  b_lower,
                'from_price':   cur_price,
            },

            'technicals': {
                'rsi':          round(_last(rsi), 2),
                'macd':         round(_last(macd_l), 2),
                'macd_signal':  round(_last(macd_s), 2),
                'supports':     supports,
                'resistances':  resistances,
                'bb_upper':     round(float(bb_u[-1]), 2) if bb_u[-1] else None,
                'bb_lower':     round(float(bb_l[-1]), 2) if bb_l[-1] else None,
            },

            'sentiment':     sentiment,   # full sentiment block for frontend
            'signal':        sig,
            'change_pct':    chg,
            'accuracy':      accuracy,
            'current_price': cur_price,
            'forecast_days': forecast_days,
            'data_points':   len(close),
        })
