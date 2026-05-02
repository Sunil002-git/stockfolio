import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import API from "../services/api";

const StatCard = ({ icon, label, value, color, prefix = "₹", isCurrency = true }) => (
  <div className="col-sm-6 col-xl-3">
    <div className={`sf-stat-card sf-stat-${color}`}>
      <div className="sf-stat-icon">{icon}</div>
      <div className="sf-stat-body">
        <div className="sf-stat-label">{label}</div>
        <div className="sf-stat-value">
          {isCurrency ? `${prefix}${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : value}
        </div>
      </div>
    </div>
  </div>
);

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    API.get("dashboard/")
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load dashboard data."))
      .finally(() => setLoading(false));
  }, []);

  const segmentLabels = {
    equity: { label: "Equity", icon: "📊", color: "blue" },
    futures: { label: "Futures", icon: "📉", color: "orange" },
    ce: { label: "Call (CE)", icon: "📈", color: "green" },
    pe: { label: "Put (PE)", icon: "📉", color: "red" },
    mf: { label: "Mutual Funds", icon: "🏦", color: "purple" },
  };

  return (
    <>
      <Navbar />
      <div className="container-fluid px-4 py-4 sf-page">
        <div className="sf-page-header mb-4">
          <h2 className="sf-page-title">Dashboard</h2>
          <p className="sf-page-subtitle">Your trading overview at a glance</p>
        </div>

        {loading && (
          <div className="text-center py-5">
            <div className="spinner-border sf-spinner" role="status"></div>
            <p className="mt-3 sf-loading-text">Loading your data...</p>
          </div>
        )}

        {error && (
          <div className="alert alert-danger">
            <i className="bi bi-exclamation-triangle me-2"></i>{error}
          </div>
        )}

        {data && (
          <>
            {/* Summary Cards */}
            <div className="row g-3 mb-4">
              <StatCard icon="💰" label="Portfolio Balance" value={data.balance} color="primary" />
              <StatCard
                icon={data.total_profit >= 0 ? "📈" : "📉"}
                label="Total P&L"
                value={data.total_profit}
                color={data.total_profit >= 0 ? "success" : "danger"}
              />
              <StatCard icon="💸" label="Total Invested" value={data.total_invested} color="warning" />
              <StatCard icon="🏷️" label="Total Charges" value={data.total_charges} color="secondary" />
            </div>

            {/* Trade Count Cards */}
            <div className="row g-3 mb-4">
              <div className="col-sm-4">
                <div className="sf-count-card">
                  <span className="sf-count-num">{data.total_trades}</span>
                  <span className="sf-count-label">Total Trades</span>
                </div>
              </div>
              <div className="col-sm-4">
                <div className="sf-count-card sf-count-open">
                  <span className="sf-count-num">{data.open_trades}</span>
                  <span className="sf-count-label">Open Positions</span>
                </div>
              </div>
              <div className="col-sm-4">
                <div className="sf-count-card sf-count-closed">
                  <span className="sf-count-num">{data.closed_trades}</span>
                  <span className="sf-count-label">Closed Trades</span>
                </div>
              </div>
            </div>

            {/* Segment Breakdown */}
            <div className="sf-section-card mb-4">
              <h5 className="sf-section-title mb-3">
                <i className="bi bi-pie-chart me-2"></i>Segment Breakdown
              </h5>
              <div className="row g-3">
                {Object.entries(data.segment_stats || {}).map(([key, seg]) => (
                  seg.count > 0 && (
                    <div className="col-sm-6 col-md-4 col-xl-2" key={key}>
                      <div className="sf-segment-card">
                        <div className="sf-segment-icon">{segmentLabels[key]?.icon || "📊"}</div>
                        <div className="sf-segment-label">{seg.label}</div>
                        <div className="sf-segment-count">{seg.count} trades</div>
                        <div className={`sf-segment-pl ${seg.profit_loss >= 0 ? "text-success" : "text-danger"}`}>
                          {seg.profit_loss >= 0 ? "+" : ""}₹{Number(seg.profit_loss).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* Deposits / Withdrawals */}
            <div className="row g-3">
              <div className="col-md-6">
                <div className="sf-section-card">
                  <h5 className="sf-section-title mb-3">
                    <i className="bi bi-bank me-2"></i>Account Activity
                  </h5>
                  <div className="d-flex justify-content-between align-items-center py-2 sf-activity-row">
                    <span><i className="bi bi-arrow-down-circle text-success me-2"></i>Total Deposits</span>
                    <strong className="text-success">₹{Number(data.total_deposit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="d-flex justify-content-between align-items-center py-2 sf-activity-row">
                    <span><i className="bi bi-arrow-up-circle text-danger me-2"></i>Total Withdrawals</span>
                    <strong className="text-danger">₹{Number(data.total_withdraw).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default Dashboard;
