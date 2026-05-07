"""
Stockfolio — Stock Prediction View
====================================
Zero ML-framework dependency. Uses a statistical ensemble of:
  1. Linear Regression trend (sklearn)
  2. EMA (Exponential Moving Average) extrapolation
  3. Polynomial curve fitting (degree-2)

Also returns full technical indicators:
  RSI, MACD, Bollinger Bands, Support/Resistance levels,
  and confidence bands around the forecast.

Requirements (no TF/Keras needed):
    pip install yfinance scikit-learn pandas numpy
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

try:
    import yfinance as yf
    YFINANCE_OK = True
except ImportError:
    YFINANCE_OK = False

try:
    from sklearn.linear_model import LinearRegression
    from sklearn.metrics import mean_squared_error, r2_score
    SKLEARN_OK = True
except ImportError:
    SKLEARN_OK = False

PREDICTION_AVAILABLE = YFINANCE_OK and SKLEARN_OK


# ── Technical Indicators ──────────────────────────────────────────────────────

def _rsi(close, period=14):
    delta = pd.Series(close).diff()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    rs    = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).round(2).tolist()


def _macd(close):
    s = pd.Series(close)
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


# ── Ensemble Forecaster ───────────────────────────────────────────────────────

def _ensemble_forecast(close, forecast_days):
    """
    Weighted ensemble of 3 independent models:
      40% Linear Regression (last 60 days)
      35% EMA drift extrapolation (12/26)
      25% Polynomial degree-2 (last 200 days)
    Returns (prices, upper_band, lower_band).
    """
    n   = len(close)
    s   = pd.Series(close)
    cur = float(close[-1])

    # Model A — Linear Regression
    w_lr = min(60, n)
    lr   = LinearRegression().fit(np.arange(w_lr).reshape(-1, 1), close[-w_lr:])

    # Model B — EMA drift
    ema12 = float(s.ewm(span=12, adjust=False).mean().iloc[-1])
    ema26 = float(s.ewm(span=26, adjust=False).mean().iloc[-1])
    drift = np.clip((ema12 - ema26) / (cur * 26), -0.005, 0.005)

    # Model C — Polynomial
    w_poly  = min(200, n)
    poly_fn = np.poly1d(np.polyfit(np.arange(w_poly), close[-w_poly:], 2))

    # Daily volatility for bands
    vol = float(s.pct_change().tail(60).std())

    prices, upper, lower = [], [], []
    for i in range(1, forecast_days + 1):
        p = round(
            0.40 * float(lr.predict([[w_lr + i]])[0])
          + 0.35 * cur * (1 + drift * i)
          + 0.25 * float(poly_fn(w_poly + i)),
            2
        )
        spread = cur * vol * (i ** 0.5) * 1.5
        prices.append(p)
        upper.append(round(p + spread, 2))
        lower.append(round(p - spread, 2))

    return prices, upper, lower


# ── Backtest Accuracy ─────────────────────────────────────────────────────────

def _backtest(close):
    if len(close) < 100:
        return None
    preds, actuals = [], []
    for i in range(30, 0, -1):
        train = close[-(30 + 60 + i):-(30 + i)]
        if len(train) < 10: continue
        lr = LinearRegression().fit(np.arange(len(train)).reshape(-1, 1), train)
        preds.append(float(lr.predict([[len(train)]])[0]))
        actuals.append(float(close[-i]))
    if not preds: return None
    mse = float(mean_squared_error(actuals, preds))
    r2  = float(r2_score(actuals, preds))
    return {'mse': round(mse, 4), 'rmse': round(mse ** 0.5, 4),
            'r2': round(r2, 4), 'r2_pct': round(r2 * 100, 1)}


# ── Signal ────────────────────────────────────────────────────────────────────

def _signal(future_prices, cur, rsi, macd, macd_sig):
    if not future_prices or cur <= 0:
        return 'HOLD', 0.0
    chg = (future_prices[-1] - cur) / cur * 100
    macd_bull = macd > macd_sig
    if chg > 3  and (macd_bull or rsi <= 35): return 'BUY',  round(chg, 2)
    if chg < -3 and (not macd_bull or rsi >= 65): return 'SELL', round(chg, 2)
    return 'HOLD', round(chg, 2)


# ── yfinance fetcher ──────────────────────────────────────────────────────────

def _fetch(ticker, from_date=None, to_date=None):
    now = datetime.now()
    start = from_date if from_date else datetime(now.year - 10, now.month, now.day)
    end   = to_date   if to_date   else now
    try:
        df = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=True)
    except Exception as e:
        return None, str(e)

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] if c[0] else c[1] for c in df.columns]

    if df.empty:
        return None, (f"No data for '{ticker}'. "
                      "NSE stocks: add .NS (e.g. RELIANCE.NS). US stocks: plain ticker (e.g. AAPL).")

    df = df.reset_index()
    df.columns = [str(c).strip() for c in df.columns]

    if 'Close' not in df.columns:
        col = next((c for c in df.columns if c.lower() == 'close'), None)
        if not col: return None, f"No Close column. Got: {list(df.columns)}"
        df.rename(columns={col: 'Close'}, inplace=True)

    if 'Date' not in df.columns:
        col = next((c for c in df.columns if c.lower() in ('date', 'datetime', 'index')), None)
        df.rename(columns={col: 'Date'}, inplace=True) if col else df.insert(0, 'Date', df.index)

    return df, None


# ── View ──────────────────────────────────────────────────────────────────────

class StockPredictionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'ready':      PREDICTION_AVAILABLE,
            'method':     'Ensemble (LinearRegression + EMA + Polynomial)',
            'model_file': 'None required',
            'missing':    [d for d, ok in [('yfinance', YFINANCE_OK), ('scikit-learn', SKLEARN_OK)] if not ok],
        })

    def post(self, request):
        if not PREDICTION_AVAILABLE:
            miss = [d for d, ok in [('yfinance', YFINANCE_OK), ('scikit-learn', SKLEARN_OK)] if not ok]
            return Response({"error": f"Missing packages: {', '.join(miss)}"}, status=503)

        ticker        = request.data.get('ticker', '').strip().upper()
        forecast_days = max(7, min(int(request.data.get('forecast_days', 30)), 90))

        if not ticker:
            return Response({"error": "Ticker is required."}, status=400)

        # Use user settings for date range if set, otherwise default 10 years
        from_date = to_date = None
        try:
            from .models import UserSettings
            user_settings, _ = UserSettings.objects.get_or_create(user=request.user)
            from_date = user_settings.predict_from_date
            to_date   = user_settings.predict_to_date
        except Exception:
            pass

        df, err = _fetch(ticker, from_date=from_date, to_date=to_date)
        if err:
            return Response({"error": err}, status=404 if 'No data' in err else 400)

        close = df['Close'].values.astype(float)
        dates = pd.to_datetime(df['Date']).dt.strftime('%Y-%m-%d').tolist()

        if len(close) < 120:
            return Response({"error": f"Only {len(close)} data points for '{ticker}'. Need 120+."}, status=400)

        # ── Indicators ──
        ma100 = pd.Series(close).rolling(100).mean().round(2).tolist()
        ma200 = pd.Series(close).rolling(200).mean().round(2).tolist()
        rsi              = _rsi(close)
        macd_l, macd_s, macd_h = _macd(close)
        bb_u, bb_m, bb_l = _bollinger(close)
        supports, resistances = _support_resistance(close)

        # ── Forecast ──
        prices, b_upper, b_lower = _ensemble_forecast(close, forecast_days)

        # ── Future weekday dates ──
        future_dates, day = [], datetime.now()
        while len(future_dates) < forecast_days:
            day += timedelta(days=1)
            if day.weekday() < 5:
                future_dates.append(day.strftime('%Y-%m-%d'))

        # ── Signal ──
        cur_price = round(float(close[-1]), 2)
        def _last(lst): return float(lst[-1]) if lst[-1] is not None else 0.0
        sig, chg = _signal(prices, cur_price, _last(rsi), _last(macd_l), _last(macd_s))

        # ── Accuracy ──
        accuracy = _backtest(close) or {'mse': 0, 'rmse': 0, 'r2': 0, 'r2_pct': 0}

        # ── Slice to last 500 for chart ──
        W = -500
        def _safe(lst):
            return [None if (v is None or (isinstance(v, float) and np.isnan(v)))
                    else round(float(v), 2) for v in lst[W:]]

        return Response({
            'ticker':       ticker,
            'status':       'success',
            'method':       'Ensemble (LinearRegression + EMA + Polynomial)',
            'historical': {
                'dates':       dates[W:],
                'close':       [round(float(v), 2) for v in close[W:]],
                'ma100':       _safe(ma100),
                'ma200':       _safe(ma200),
                'rsi':         _safe(rsi),
                'macd':        _safe(macd_l),
                'macd_signal': _safe(macd_s),
                'macd_hist':   _safe(macd_h),
                'bb_upper':    _safe(bb_u),
                'bb_lower':    _safe(bb_l),
            },
            'forecast': {
                'dates':       future_dates,
                'prices':      prices,
                'bands_upper': b_upper,
                'bands_lower': b_lower,
                'from_price':  cur_price,
            },
            'technicals': {
                'rsi':         round(_last(rsi), 2),
                'macd':        round(_last(macd_l), 2),
                'macd_signal': round(_last(macd_s), 2),
                'supports':    supports,
                'resistances': resistances,
                'bb_upper':    round(float(bb_u[-1]), 2) if bb_u[-1] else None,
                'bb_lower':    round(float(bb_l[-1]), 2) if bb_l[-1] else None,
            },
            'signal':       sig,
            'change_pct':   chg,
            'accuracy':     accuracy,
            'current_price': cur_price,
            'forecast_days': forecast_days,
            'data_points':  len(close),
        })
