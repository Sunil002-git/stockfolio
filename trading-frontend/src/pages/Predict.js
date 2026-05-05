import React, { useState, useEffect, useRef, useCallback } from "react";
import Navbar from "../components/Navbar";
import API from "../services/api";
import { useTheme } from "../context/ThemeContext";

/* ── helpers ─────────────────────────────────────────────── */
const fmt = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const SIGNAL_CONFIG = {
  BUY:  { color: "#00d4aa", bg: "rgba(0,212,170,0.1)",  border: "rgba(0,212,170,0.3)",  icon: "📈", label: "BUY",  desc: "Model predicts upward trend" },
  SELL: { color: "#ff6b6b", bg: "rgba(255,107,107,0.1)", border: "rgba(255,107,107,0.3)", icon: "📉", label: "SELL", desc: "Model predicts downward trend" },
  HOLD: { color: "#ffd166", bg: "rgba(255,209,102,0.1)", border: "rgba(255,209,102,0.3)", icon: "⏸️", label: "HOLD", desc: "No strong directional signal" },
};

/* ── Chart component ─────────────────────────────────────── */
const PredictionChart = ({ data, theme }) => {
  const ref = useRef(null);
  const inst = useRef(null);

  useEffect(() => {
    if (!data || !window.Chart || !ref.current) return;
    if (inst.current) inst.current.destroy();

    const gridColor  = theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
    const textColor  = theme === "dark" ? "#7d8590" : "#57606a";

    const hist   = data.historical;
    const fore   = data.forecast;

    // Combine dates: last 60 historical + all forecast
    const histDates  = hist.dates.slice(-60);
    const histClose  = hist.close.slice(-60);
    const histMA100  = hist.ma100.slice(-60);
    const histMA200  = hist.ma200.slice(-60);

    const allDates = [...histDates, ...fore.dates];

    // Forecast dataset: null for historical portion, values for future
    const forecastData = [
      ...new Array(histDates.length - 1).fill(null),
      histClose[histClose.length - 1], // connect from last known price
      ...fore.prices,
    ];

    inst.current = new window.Chart(ref.current, {
      type: "line",
      data: {
        labels: allDates,
        datasets: [
          {
            label: "Close Price",
            data: [...histClose, ...new Array(fore.dates.length).fill(null)],
            borderColor: "#4d9fff",
            backgroundColor: "rgba(77,159,255,0.06)",
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
          },
          {
            label: "100 DMA",
            data: [...histMA100, ...new Array(fore.dates.length).fill(null)],
            borderColor: "#ff9f43",
            borderWidth: 1.5,
            borderDash: [4, 3],
            tension: 0.3,
            pointRadius: 0,
            fill: false,
          },
          {
            label: "200 DMA",
            data: [...histMA200, ...new Array(fore.dates.length).fill(null)],
            borderColor: "#a29bfe",
            borderWidth: 1.5,
            borderDash: [4, 3],
            tension: 0.3,
            pointRadius: 0,
            fill: false,
          },
          {
            label: `${data.forecast_days}-Day Forecast`,
            data: forecastData,
            borderColor: "#00d4aa",
            backgroundColor: "rgba(0,212,170,0.08)",
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
            pointRadius: (ctx) => ctx.dataIndex >= histDates.length ? 2 : 0,
            pointBackgroundColor: "#00d4aa",
            borderDash: [],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: textColor, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ctx.parsed.y != null
                  ? `${ctx.dataset.label}: ₹${Number(ctx.parsed.y).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                  : null,
            },
          },
          // Vertical line at forecast start
          annotation: {},
        },
        scales: {
          x: {
            ticks: { color: textColor, maxTicksLimit: 12, maxRotation: 0 },
            grid: { color: gridColor },
          },
          y: {
            ticks: {
              color: textColor,
              callback: (v) => `₹${Number(v).toLocaleString("en-IN")}`,
            },
            grid: { color: gridColor },
          },
        },
      },
    });

    return () => { if (inst.current) inst.current.destroy(); };
  }, [data, theme]);

  return (
    <div style={{ height: "360px" }}>
      <canvas ref={ref}></canvas>
    </div>
  );
};

/* ── Main component ──────────────────────────────────────── */
const Predict = () => {
  const { theme } = useTheme();
  const [ticker, setTicker] = useState("");
  const [forecastDays, setForecastDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [openPositions, setOpenPositions] = useState([]);
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sf_recent_pred") || "[]"); }
    catch { return []; }
  });

  // Load open positions for quick-fill
  useEffect(() => {
    API.get("positions/", { params: { is_closed: false } })
      .then((r) => setOpenPositions(r.data))
      .catch(() => {});
  }, []);

  const saveRecent = (sym) => {
    const updated = [sym, ...recentSearches.filter((s) => s !== sym)].slice(0, 6);
    setRecentSearches(updated);
    localStorage.setItem("sf_recent_pred", JSON.stringify(updated));
  };

  const handleSubmit = async (sym = ticker) => {
    const t = sym.trim().toUpperCase();
    if (!t) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await API.post("predict/", { ticker: t, forecast_days: forecastDays });
      setResult(res.data);
      saveRecent(t);
    } catch (err) {
      setError(err.response?.data?.error || "Prediction failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const sig = result ? SIGNAL_CONFIG[result.signal] || SIGNAL_CONFIG.HOLD : null;

  return (
    <>
      <Navbar />
      <div className="container-fluid px-4 py-4 sf-page">

        {/* Header */}
        <div className="sf-page-header mb-4">
          <h2 className="sf-page-title">Stock Prediction</h2>
          <p className="sf-page-subtitle">
            LSTM model • Future {forecastDays}-day forecast • Powered by Yahoo Finance
          </p>
        </div>

        {/* Search card */}
        <div className="sf-form-card mb-4">
          <div className="row g-3 align-items-end">
            <div className="col-md-5">
              <label className="form-label sf-label">
                Stock Ticker <span className="text-danger">*</span>
              </label>
              <div className="input-group sf-input-group">
                <span className="input-group-text sf-input-icon">
                  <i className="bi bi-search"></i>
                </span>
                <input
                  type="text"
                  className="form-control sf-input"
                  placeholder="e.g. RELIANCE.NS, TCS.NS, AAPL, TSLA"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  style={{ textTransform: "uppercase" }}
                />
              </div>
              <div className="text-muted small mt-1">
                NSE stocks: add <code>.NS</code> suffix (e.g. <code>RELIANCE.NS</code>)
              </div>
            </div>

            <div className="col-md-2">
              <label className="form-label sf-label">Forecast Days</label>
              <select
                className="form-select sf-input"
                value={forecastDays}
                onChange={(e) => setForecastDays(parseInt(e.target.value))}
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
              </select>
            </div>

            <div className="col-md-2">
              <button
                className="btn sf-btn-primary w-100"
                onClick={() => handleSubmit()}
                disabled={loading || !ticker.trim()}
              >
                {loading
                  ? <><span className="spinner-border spinner-border-sm me-2"></span>Predicting...</>
                  : <><i className="bi bi-cpu me-2"></i>Predict</>}
              </button>
            </div>
          </div>

          {/* Quick fill from open positions */}
          {openPositions.length > 0 && (
            <div className="mt-3">
              <div className="sf-label mb-2">Your Open Positions</div>
              <div className="d-flex flex-wrap gap-2">
                {openPositions.map((pos) => (
                  <button
                    key={pos.id}
                    className="btn btn-sm sf-quick-pred-btn"
                    onClick={() => {
                      // NSE stocks need .NS suffix — add if no dot present
                      const sym = pos.exchange === "NSE" || pos.exchange === "BSE"
                        ? `${pos.symbol}.NS`
                        : pos.symbol;
                      setTicker(sym);
                      handleSubmit(sym);
                    }}
                  >
                    {pos.symbol}
                    <span className="ms-1 text-muted" style={{ fontSize: "0.7rem" }}>
                      {pos.exchange}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent searches */}
          {recentSearches.length > 0 && (
            <div className="mt-3">
              <div className="sf-label mb-2">Recent</div>
              <div className="d-flex flex-wrap gap-2">
                {recentSearches.map((sym) => (
                  <button
                    key={sym}
                    className="btn btn-sm sf-recent-btn"
                    onClick={() => { setTicker(sym); handleSubmit(sym); }}
                  >
                    <i className="bi bi-clock-history me-1"></i>{sym}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-danger mb-4">
            <i className="bi bi-exclamation-triangle me-2"></i>{error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="text-center py-5">
            <div className="sf-pred-loading">
              <div className="spinner-border sf-spinner mb-3" style={{ width: "3rem", height: "3rem" }}></div>
              <h5 className="text-muted">Running LSTM model...</h5>
              <p className="text-muted small">Fetching 10 years of data and generating {forecastDays}-day forecast</p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <>
            {/* Signal + current price header */}
            <div className="row g-3 mb-4">
              {/* Signal card */}
              <div className="col-md-4">
                <div className="sf-signal-card" style={{
                  background: sig.bg,
                  border: `1px solid ${sig.border}`,
                }}>
                  <div className="sf-signal-icon">{sig.icon}</div>
                  <div>
                    <div className="sf-signal-label" style={{ color: sig.color }}>
                      {sig.label}
                    </div>
                    <div className="sf-signal-desc">{sig.desc}</div>
                    <div className="sf-signal-pct" style={{ color: sig.color }}>
                      {result.change_pct >= 0 ? "+" : ""}{result.change_pct}% predicted over {result.forecast_days} days
                    </div>
                  </div>
                </div>
              </div>

              {/* Current price */}
              <div className="col-md-2">
                <div className="sf-stat-card sf-stat-primary">
                  <div className="sf-stat-icon">💹</div>
                  <div className="sf-stat-body">
                    <div className="sf-stat-label">Current Price</div>
                    <div className="sf-stat-value">{fmt(result.current_price)}</div>
                  </div>
                </div>
              </div>

              {/* Forecast end price */}
              <div className="col-md-2">
                <div className={`sf-stat-card ${result.change_pct >= 0 ? "sf-stat-success" : "sf-stat-danger"}`}>
                  <div className="sf-stat-icon">{result.change_pct >= 0 ? "🎯" : "⚠️"}</div>
                  <div className="sf-stat-body">
                    <div className="sf-stat-label">Predicted ({result.forecast_days}d)</div>
                    <div className={`sf-stat-value ${result.change_pct >= 0 ? "text-success" : "text-danger"}`}>
                      {fmt(result.forecast.prices[result.forecast.prices.length - 1])}
                    </div>
                  </div>
                </div>
              </div>

              {/* Model accuracy */}
              <div className="col-md-2">
                <div className="sf-stat-card sf-stat-warning">
                  <div className="sf-stat-icon">🎓</div>
                  <div className="sf-stat-body">
                    <div className="sf-stat-label">Model Accuracy</div>
                    <div className="sf-stat-value">{result.accuracy.r2_pct}%</div>
                  </div>
                </div>
              </div>

              {/* RMSE */}
              <div className="col-md-2">
                <div className="sf-stat-card sf-stat-secondary">
                  <div className="sf-stat-icon">📐</div>
                  <div className="sf-stat-body">
                    <div className="sf-stat-label">RMSE</div>
                    <div className="sf-stat-value">{fmt(result.accuracy.rmse)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Main chart */}
            <div className="sf-section-card mb-4">
              <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                <h5 className="sf-section-title mb-0">
                  <i className="bi bi-graph-up me-2"></i>
                  {result.ticker} — Price History + {result.forecast_days}-Day Forecast
                </h5>
                <div className="d-flex gap-3 align-items-center" style={{ fontSize: "0.78rem" }}>
                  <span><span className="sf-legend-dot" style={{ background: "#4d9fff" }}></span>Close</span>
                  <span><span className="sf-legend-dot" style={{ background: "#ff9f43" }}></span>100 DMA</span>
                  <span><span className="sf-legend-dot" style={{ background: "#a29bfe" }}></span>200 DMA</span>
                  <span><span className="sf-legend-dot" style={{ background: "#00d4aa" }}></span>Forecast</span>
                </div>
              </div>
              <PredictionChart data={result} theme={theme} />
              <div className="mt-2 text-muted small">
                <i className="bi bi-info-circle me-1"></i>
                Teal line shows predicted prices for the next {result.forecast_days} trading days.
                The forecast starts from today's price ({fmt(result.current_price)}).
              </div>
            </div>

            {/* Forecast table + accuracy */}
            <div className="row g-4">
              {/* Forecast price table */}
              <div className="col-lg-7">
                <div className="sf-section-card">
                  <h5 className="sf-section-title mb-3">
                    <i className="bi bi-table me-2"></i>
                    {result.forecast_days}-Day Price Forecast
                  </h5>
                  <div className="sf-table-wrap" style={{ maxHeight: "320px", overflowY: "auto" }}>
                    <table className="table sf-table mb-0">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Date</th>
                          <th>Predicted Price</th>
                          <th>Change from Today</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.forecast.dates.map((d, i) => {
                          const price = result.forecast.prices[i];
                          const chg = ((price - result.current_price) / result.current_price * 100).toFixed(2);
                          const isPos = parseFloat(chg) >= 0;
                          return (
                            <tr key={d} className="sf-table-row">
                              <td className="text-muted small">{i + 1}</td>
                              <td className="sf-date-cell">{d}</td>
                              <td className="sf-symbol">{fmt(price)}</td>
                              <td>
                                <span className={isPos ? "sf-profit" : "sf-loss"}>
                                  {isPos ? "+" : ""}{chg}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Model accuracy + disclaimer */}
              <div className="col-lg-5">
                <div className="sf-section-card mb-3">
                  <h5 className="sf-section-title mb-3">
                    <i className="bi bi-cpu me-2"></i>Model Performance
                  </h5>
                  <div className="sf-accuracy-grid">
                    <div className="sf-accuracy-item">
                      <div className="sf-accuracy-label">R² Score</div>
                      <div className="sf-accuracy-val text-success">{result.accuracy.r2}</div>
                      <div className="sf-accuracy-sub">{result.accuracy.r2_pct}% variance explained</div>
                    </div>
                    <div className="sf-accuracy-item">
                      <div className="sf-accuracy-label">RMSE</div>
                      <div className="sf-accuracy-val">{fmt(result.accuracy.rmse)}</div>
                      <div className="sf-accuracy-sub">Avg prediction error</div>
                    </div>
                    <div className="sf-accuracy-item">
                      <div className="sf-accuracy-label">MSE</div>
                      <div className="sf-accuracy-val">{result.accuracy.mse}</div>
                      <div className="sf-accuracy-sub">Mean squared error</div>
                    </div>
                    <div className="sf-accuracy-item">
                      <div className="sf-accuracy-label">Data Points</div>
                      <div className="sf-accuracy-val">{result.data_points.toLocaleString()}</div>
                      <div className="sf-accuracy-sub">10 years of history</div>
                    </div>
                  </div>
                </div>

                {/* Disclaimer */}
                <div className="sf-disclaimer">
                  <i className="bi bi-shield-exclamation me-2"></i>
                  <strong>Disclaimer:</strong> This prediction is generated by an LSTM machine learning model
                  for educational purposes only. Stock markets are unpredictable.
                  <strong> Do not make investment decisions based solely on this forecast.</strong>
                  Past model accuracy does not guarantee future results.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default Predict;
