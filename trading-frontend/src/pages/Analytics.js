import React, { useEffect, useState, useRef, useCallback } from "react";
import Navbar from "../components/Navbar";
import API from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { useBroker, BrokerSelector } from "../context/BrokerContext";

const PERIODS = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "custom", label: "Custom Range" },
];

const fmt = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const Analytics = () => {
  const { theme } = useTheme();
  const { brokerParam } = useBroker();
  const [period, setPeriod] = useState("month");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const plChartRef = useRef(null);
  const monthChartRef = useRef(null);
  const plChartInst = useRef(null);
  const monthChartInst = useRef(null);

  const fetchAnalytics = useCallback(() => {
    setLoading(true);
    const params = { period };
    if (period === "custom" && fromDate && toDate) {
      params.from_date = fromDate;
      params.to_date = toDate;
    }
    if (brokerParam) params.broker = brokerParam;
    API.get("analytics/", { params })
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period, fromDate, toDate, brokerParam]);

  useEffect(() => {
    if (period !== "custom" || (fromDate && toDate)) {
      fetchAnalytics();
    }
  }, [fetchAnalytics, period, fromDate, toDate]);

  const gridColor = theme === "dark" ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
  const textColor = theme === "dark" ? "#7d8590" : "#57606a";

  useEffect(() => {
    if (!data || !window.Chart) return;

    // Destroy old charts
    if (plChartInst.current) plChartInst.current.destroy();
    if (monthChartInst.current) monthChartInst.current.destroy();

    const daily = data.daily_pl || [];
    const monthly = data.monthly_pl || [];

    // Cumulative P&L line chart
    if (plChartRef.current && daily.length > 0) {
      plChartInst.current = new window.Chart(plChartRef.current, {
        type: "line",
        data: {
          labels: daily.map((d) => d.date),
          datasets: [
            {
              label: "Cumulative P&L",
              data: daily.map((d) => d.cumulative_pl),
              borderColor: "#00d4aa",
              backgroundColor: "rgba(0,212,170,0.08)",
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointRadius: daily.length > 30 ? 0 : 4,
              pointHoverRadius: 6,
            },
            {
              label: "Daily P&L",
              data: daily.map((d) => d.profit_loss),
              borderColor: "rgba(255,209,102,0.8)",
              backgroundColor: "transparent",
              borderWidth: 1.5,
              borderDash: [4, 4],
              tension: 0.2,
              pointRadius: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: textColor, font: { size: 12 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ₹${Number(ctx.parsed.y).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
              },
            },
          },
          scales: {
            x: { ticks: { color: textColor, maxTicksLimit: 10 }, grid: { color: gridColor } },
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
    }

    // Monthly bar chart
    if (monthChartRef.current && monthly.length > 0) {
      monthChartInst.current = new window.Chart(monthChartRef.current, {
        type: "bar",
        data: {
          labels: monthly.map((m) => m.month),
          datasets: [
            {
              label: "Monthly P&L",
              data: monthly.map((m) => m.profit_loss),
              backgroundColor: monthly.map((m) =>
                m.profit_loss >= 0 ? "rgba(0,212,170,0.7)" : "rgba(255,107,107,0.7)"
              ),
              borderColor: monthly.map((m) =>
                m.profit_loss >= 0 ? "#00d4aa" : "#ff6b6b"
              ),
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `P&L: ₹${Number(ctx.parsed.y).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
              },
            },
          },
          scales: {
            x: { ticks: { color: textColor }, grid: { color: gridColor } },
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
    }

    return () => {
      if (plChartInst.current) plChartInst.current.destroy();
      if (monthChartInst.current) monthChartInst.current.destroy();
    };
  }, [data, theme]);

  const s = data?.summary || {};

  return (
    <>
      {/* Load Chart.js */}
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
      <Navbar />
      <div className="container-fluid px-4 py-4 sf-page">
        <div className="sf-page-header mb-4">
          <h2 className="sf-page-title">Analytics</h2>
          <p className="sf-page-subtitle">P&L trends, monthly summaries, and performance stats</p>
        </div>

        {/* Broker selector */}
        <BrokerSelector className="mb-4" />

        {/* Period selector */}
        <div className="sf-filter-bar mb-4">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <div className="d-flex gap-2">
              {PERIODS.map((p) => (
                <button key={p.key}
                  className={`btn btn-sm ${period === p.key ? "sf-btn-primary" : "sf-btn-ghost"}`}
                  onClick={() => setPeriod(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
            {period === "custom" && (
              <div className="d-flex gap-2 align-items-center flex-wrap">
                <input type="date" className="form-control sf-input" style={{ width: "160px" }}
                  value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                <span className="text-muted small">to</span>
                <input type="date" className="form-control sf-input" style={{ width: "160px" }}
                  value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        {loading && (
          <div className="text-center py-5">
            <div className="spinner-border sf-spinner"></div>
            <p className="mt-3 sf-loading-text">Loading analytics...</p>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Summary stat cards */}
            <div className="row g-3 mb-4">
              <div className="col-sm-6 col-xl-3">
                <div className={`sf-stat-card ${s.total_pl >= 0 ? "sf-stat-success" : "sf-stat-danger"}`}>
                  <div className="sf-stat-icon">{s.total_pl >= 0 ? "📈" : "📉"}</div>
                  <div className="sf-stat-body">
                    <div className="sf-stat-label">Total P&L</div>
                    <div className={`sf-stat-value ${s.total_pl >= 0 ? "text-success" : "text-danger"}`}>
                      {s.total_pl >= 0 ? "+" : ""}{fmt(s.total_pl)}
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-sm-6 col-xl-3">
                <div className="sf-stat-card sf-stat-primary">
                  <div className="sf-stat-icon">🔄</div>
                  <div className="sf-stat-body">
                    <div className="sf-stat-label">Trades Closed</div>
                    <div className="sf-stat-value">{s.total_trades || 0}</div>
                  </div>
                </div>
              </div>
              <div className="col-sm-6 col-xl-3">
                <div className="sf-stat-card sf-stat-success">
                  <div className="sf-stat-icon">✅</div>
                  <div className="sf-stat-body">
                    <div className="sf-stat-label">Winning Days</div>
                    <div className="sf-stat-value text-success">{s.winning_days || 0}</div>
                  </div>
                </div>
              </div>
              <div className="col-sm-6 col-xl-3">
                <div className="sf-stat-card sf-stat-danger">
                  <div className="sf-stat-icon">❌</div>
                  <div className="sf-stat-body">
                    <div className="sf-stat-label">Losing Days</div>
                    <div className="sf-stat-value text-danger">{s.losing_days || 0}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Best/Worst day */}
            {(s.best_day || s.worst_day) && (
              <div className="row g-3 mb-4">
                {s.best_day && (
                  <div className="col-md-6">
                    <div className="sf-section-card">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <div className="sf-stat-label mb-1">🏆 Best Day</div>
                          <div className="sf-date-cell">{s.best_day.date}</div>
                        </div>
                        <div className="sf-profit" style={{ fontSize: "1.3rem", fontFamily: "var(--sf-mono)" }}>
                          +{fmt(s.best_day.profit_loss)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {s.worst_day && (
                  <div className="col-md-6">
                    <div className="sf-section-card">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <div className="sf-stat-label mb-1">📉 Worst Day</div>
                          <div className="sf-date-cell">{s.worst_day.date}</div>
                        </div>
                        <div className="sf-loss" style={{ fontSize: "1.3rem", fontFamily: "var(--sf-mono)" }}>
                          {fmt(s.worst_day.profit_loss)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cumulative P&L Chart */}
            {data.daily_pl.length > 0 ? (
              <div className="sf-section-card mb-4">
                <h5 className="sf-section-title mb-3">
                  <i className="bi bi-graph-up me-2"></i>Cumulative P&L
                  <span className="ms-2 text-muted small fw-normal">
                    {data.from_date} → {data.to_date}
                  </span>
                </h5>
                <div style={{ height: "300px" }}>
                  <canvas ref={plChartRef}></canvas>
                </div>
              </div>
            ) : (
              <div className="sf-section-card mb-4">
                <div className="sf-empty-state py-4">
                  <div className="sf-empty-icon">📊</div>
                  <h6>No closed trades in this period</h6>
                  <p className="text-muted small">Sell some positions to see P&L charts.</p>
                </div>
              </div>
            )}

            {/* Monthly bar chart */}
            {data.monthly_pl.length > 0 && (
              <div className="sf-section-card mb-4">
                <h5 className="sf-section-title mb-3">
                  <i className="bi bi-bar-chart me-2"></i>Monthly P&L Breakdown
                </h5>
                <div style={{ height: "260px" }}>
                  <canvas ref={monthChartRef}></canvas>
                </div>
              </div>
            )}

            {/* Monthly table */}
            {data.monthly_pl.length > 0 && (
              <div className="sf-section-card">
                <h5 className="sf-section-title mb-3">
                  <i className="bi bi-table me-2"></i>Month-wise Summary
                </h5>
                <div className="sf-table-wrap">
                  <table className="table sf-table mb-0">
                    <thead>
                      <tr><th>Month</th><th>Trades</th><th>P&L</th></tr>
                    </thead>
                    <tbody>
                      {data.monthly_pl.map((m) => (
                        <tr key={m.month} className="sf-table-row">
                          <td className="sf-symbol">{m.month}</td>
                          <td>{m.trades}</td>
                          <td>
                            <span className={m.profit_loss >= 0 ? "sf-profit" : "sf-loss"}>
                              {m.profit_loss >= 0 ? "+" : ""}{fmt(m.profit_loss)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default Analytics;
