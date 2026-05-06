"""
Stockfolio — Stock Prediction View
====================================
Works with TensorFlow 2.10–2.16+ by rebuilding the LSTM architecture
and loading weights directly from the .h5 file, bypassing Keras version
incompatibilities.

Place the model file next to manage.py:
  trading_tracker/
  ├── manage.py
  └── stock_prediction_model_v2.h5   (or stock_prediction_model_fixed.keras)
"""

import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

try:
    import yfinance as yf
    YFINANCE_OK = True
except ImportError:
    YFINANCE_OK = False

try:
    from sklearn.preprocessing import MinMaxScaler
    from sklearn.metrics import mean_squared_error, r2_score
    SKLEARN_OK = True
except ImportError:
    SKLEARN_OK = False

try:
    import tensorflow as tf
    KERAS_OK = True
except ImportError:
    KERAS_OK = False

PREDICTION_AVAILABLE = YFINANCE_OK and SKLEARN_OK and KERAS_OK


def _find_model():
    base = getattr(settings, 'BASE_DIR', os.getcwd())
    candidates = [
        os.path.join(base, 'stock_prediction_model_fixed.keras'),
        os.path.join(base, 'stock_prediction_model_v2.h5'),
        os.path.join(base, 'stock_prediction_model.h5'),
        os.path.join(base, 'stock_prediction_model.keras'),
        os.path.join(base, 'core', 'stock_prediction_model_v2.h5'),
        os.path.join(os.getcwd(), 'stock_prediction_model_fixed.keras'),
        os.path.join(os.getcwd(), 'stock_prediction_model_v2.h5'),
    ]
    for path in candidates:
        if os.path.exists(path):
            print(f"[Predict] Model found: {path}")
            return path
    print(f"[Predict] Model NOT found. Searched:")
    for p in candidates: print(f"  {p}")
    return None


def _build_model():
    """Rebuild the LSTM architecture. Must match the trained model exactly."""
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(100, 1)),
        tf.keras.layers.LSTM(128, return_sequences=True),
        tf.keras.layers.LSTM(64, return_sequences=False),
        tf.keras.layers.Dense(25),
        tf.keras.layers.Dense(1),
    ])
    model.build((None, 100, 1))
    return model


def _load_weights_from_h5(model, path):
    """
    Load weights from a Keras-3-style .h5 file by reading datasets directly.
    This bypasses load_model() which fails across Keras versions.
    """
    import h5py
    with h5py.File(path, 'r') as f:
        if 'model_weights' not in f:
            raise ValueError("No 'model_weights' group found in h5 file.")
        wg = f['model_weights']

        def get(key_path):
            return np.array(wg[key_path])

        # TF2 LSTM weight order: [kernel, recurrent_kernel, bias]
        model.get_layer('lstm').set_weights([
            get('lstm/lstm/lstm_cell/kernel'),
            get('lstm/lstm/lstm_cell/recurrent_kernel'),
            get('lstm/lstm/lstm_cell/bias'),
        ])
        model.get_layer('lstm_1').set_weights([
            get('lstm_1/lstm_1/lstm_cell/kernel'),
            get('lstm_1/lstm_1/lstm_cell/recurrent_kernel'),
            get('lstm_1/lstm_1/lstm_cell/bias'),
        ])
        # TF2 Dense weight order: [kernel, bias]
        model.get_layer('dense').set_weights([
            get('dense/dense/kernel'),
            get('dense/dense/bias'),
        ])
        model.get_layer('dense_1').set_weights([
            get('dense_1/dense_1/kernel'),
            get('dense_1/dense_1/bias'),
        ])
    return model


def _load_model_safe(path):
    """
    Load strategy:
      1. If .keras native format → tf.keras.models.load_model (always works)
      2. If .h5 → try load_model first, fall back to manual weight loading
    """
    errors = []

    # Native Keras format — straightforward load
    if path.endswith('.keras'):
        try:
            model = tf.keras.models.load_model(path, compile=False)
            print(f"[Predict] Loaded .keras OK")
            return model, None
        except Exception as e:
            errors.append(f".keras load_model: {e}")

    # .h5 — first try standard load, then manual weight injection
    if path.endswith('.h5'):
        for compile_flag in [False, True]:
            try:
                model = tf.keras.models.load_model(path, compile=compile_flag)
                print(f"[Predict] Loaded .h5 OK (compile={compile_flag})")
                return model, None
            except Exception as e:
                errors.append(f"load_model compile={compile_flag}: {e}")

        # Fallback: rebuild architecture + load weights manually from h5
        try:
            model = _build_model()
            model = _load_weights_from_h5(model, path)
            # Verify inference works
            test = np.zeros((1, 100, 1), dtype=np.float32)
            model.predict(test, verbose=0)
            print(f"[Predict] Loaded .h5 via manual weight injection OK")
            return model, None
        except Exception as e:
            errors.append(f"manual weight injection: {e}")

    return None, errors


def _generate_signal(future_prices, current_price):
    if not future_prices or current_price <= 0:
        return 'HOLD', 0
    change_pct = ((future_prices[-1] - current_price) / current_price) * 100
    if change_pct > 3:   return 'BUY',  round(change_pct, 2)
    if change_pct < -3:  return 'SELL', round(change_pct, 2)
    return 'HOLD', round(change_pct, 2)


class StockPredictionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        model_path = _find_model()
        missing = []
        if not YFINANCE_OK: missing.append("yfinance")
        if not SKLEARN_OK:  missing.append("scikit-learn")
        if not KERAS_OK:    missing.append("tensorflow")
        try:
            import tensorflow as _tf
            tf_ver = _tf.__version__
        except Exception:
            tf_ver = "not installed"
        try:
            import keras as _k
            k_ver = _k.__version__
        except Exception:
            k_ver = tf_ver  # keras is bundled inside tf
        return Response({
            'ready':         PREDICTION_AVAILABLE and model_path is not None,
            'model_found':   model_path is not None,
            'model_path':    model_path or 'NOT FOUND — run run_in_conda.py first',
            'base_dir':      str(getattr(settings, 'BASE_DIR', os.getcwd())),
            'keras_version': k_ver,
            'tf_version':    tf_ver,
            'missing_deps':  missing,
            'next_step':     'Copy stock_prediction_model_v2.h5 next to manage.py' if not model_path else 'Ready!',
        })

    def post(self, request):
        if not PREDICTION_AVAILABLE:
            missing = [d for d, ok in [("yfinance", YFINANCE_OK), ("scikit-learn", SKLEARN_OK), ("tensorflow", KERAS_OK)] if not ok]
            return Response({"error": f"Missing deps: {', '.join(missing)}"}, status=503)

        ticker        = request.data.get('ticker', '').strip().upper()
        forecast_days = int(request.data.get('forecast_days', 30))

        if not ticker:
            return Response({"error": "Ticker is required."}, status=400)

        model_path = _find_model()
        if not model_path:
            base = str(getattr(settings, 'BASE_DIR', os.getcwd()))
            return Response({
                "error": f"Model not found. Run run_in_conda.py in conda, then copy stock_prediction_model_v2.h5 to: {base}/"
            }, status=500)

        model, errs = _load_model_safe(model_path)
        if model is None:
            return Response({
                "error": "Failed to load model.",
                "details": errs,
                "fix": "Run run_in_conda.py in your conda env to convert model to .h5 format."
            }, status=500)

        now = datetime.now()
        try:
            df = yf.download(ticker, start=datetime(now.year-10, now.month, now.day),
                             end=now, progress=False, auto_adjust=True)
        except Exception as e:
            return Response({"error": f"Failed to fetch '{ticker}': {e}"}, status=400)

        # yfinance >=0.2 always returns MultiIndex columns like ('Close', 'RELIANCE.NS')
        # Flatten BEFORE .empty check and reset_index so all column access works correctly
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0] if col[0] else col[1] for col in df.columns]

        if df.empty or len(df) == 0:
            return Response({"error": f"No data for '{ticker}'. NSE stocks need .NS suffix (e.g. RELIANCE.NS)."}, status=404)

        df = df.reset_index()

        # Normalize column name casing
        df.columns = [str(c).strip() for c in df.columns]
        # Ensure Close column exists
        if 'Close' not in df.columns:
            col = next((c for c in df.columns if c.lower() == 'close'), None)
            if not col:
                return Response({"error": f"No Close column. Got: {list(df.columns)}"}, status=400)
            df.rename(columns={col: 'Close'}, inplace=True)
        # Ensure Date column exists — after reset_index it may be 'index', 'Datetime', etc.
        if 'Date' not in df.columns:
            date_col = next((c for c in df.columns if c.lower() in ('date', 'datetime', 'index')), None)
            if date_col:
                df.rename(columns={date_col: 'Date'}, inplace=True)
            else:
                df.insert(0, 'Date', df.index)

        close = df['Close'].values.astype(float)
        dates = pd.to_datetime(df['Date']).dt.strftime('%Y-%m-%d').tolist()

        if len(close) < 120:
            return Response({"error": f"Only {len(close)} days of data — need at least 120."}, status=400)

        ma100 = pd.Series(close).rolling(100).mean().round(2).tolist()
        ma200 = pd.Series(close).rolling(200).mean().round(2).tolist()

        scaler = MinMaxScaler(feature_range=(0, 1))
        scaled = scaler.fit_transform(close.reshape(-1, 1))

        split    = int(len(scaled) * 0.7)
        combined = np.concatenate([scaled[max(0, split-100):split], scaled[split:]])
        x_test, y_test = [], []
        for i in range(100, len(combined)):
            x_test.append(combined[i-100:i])
            y_test.append(combined[i, 0])
        x_test   = np.array(x_test)
        y_test_o = scaler.inverse_transform(np.array(y_test).reshape(-1,1)).flatten()

        try:
            y_pred_s = model.predict(x_test, verbose=0)
            y_pred_o = scaler.inverse_transform(y_pred_s.reshape(-1,1)).flatten()
        except Exception as e:
            return Response({"error": f"Inference failed: {e}"}, status=500)

        mse  = float(mean_squared_error(y_test_o, y_pred_o))
        rmse = float(np.sqrt(mse))
        r2   = float(r2_score(y_test_o, y_pred_o))

        window = scaled[-100:].copy().reshape(1, 100, 1)
        future_scaled = []
        for _ in range(forecast_days):
            nxt = float(model.predict(window, verbose=0)[0, 0])
            future_scaled.append(nxt)
            window = np.roll(window, -1, axis=1)
            window[0, -1, 0] = nxt

        future_prices = scaler.inverse_transform(
            np.array(future_scaled).reshape(-1,1)).flatten().tolist()
        future_prices = [round(float(p), 2) for p in future_prices]

        future_dates = []
        day = datetime.now()
        while len(future_dates) < forecast_days:
            day += timedelta(days=1)
            if day.weekday() < 5:
                future_dates.append(day.strftime('%Y-%m-%d'))

        current_price      = float(close[-1])
        signal, change_pct = _generate_signal(future_prices, current_price)

        w = -500
        return Response({
            'ticker':        ticker,
            'status':        'success',
            'historical': {
                'dates': dates[w:],
                'close': [round(float(v), 2) for v in close[w:]],
                'ma100': [round(float(v), 2) if not np.isnan(v) else None for v in ma100[w:]],
                'ma200': [round(float(v), 2) if not np.isnan(v) else None for v in ma200[w:]],
            },
            'forecast': {
                'dates':      future_dates,
                'prices':     future_prices,
                'from_price': round(current_price, 2),
            },
            'signal':        signal,
            'change_pct':    change_pct,
            'accuracy': {
                'mse':    round(mse, 4),
                'rmse':   round(rmse, 4),
                'r2':     round(r2, 4),
                'r2_pct': round(r2 * 100, 1),
            },
            'current_price': round(current_price, 2),
            'forecast_days': forecast_days,
            'data_points':   len(close),
        })
