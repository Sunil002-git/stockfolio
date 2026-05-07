import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import API from "../services/api";
import { useBroker, BrokerSelector } from "../context/BrokerContext";

const fmt = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const StatCard = ({ icon, label, value, color, isCurrency = true, suffix = "" }) => (
  <div className="col-sm-6 col-xl-3">
    <div className={`sf-stat-card sf-stat-${color}`}>
      <div className="sf-stat-icon">{icon}</div>
      <div className="sf-stat-body">
        <div className="sf-stat-label">{label}</div>
        <div className="sf-stat-value">
          {isCurrency ? fmt(value) : `${value}${suffix}`}
        </div>
      </div>
    </div>
  </div>
);

const Dashboard = () => {
  const { brokerParam, activeBroker, brokers } = useBroker();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const fetchDashboard = useCallback(() => {
    setLoading(true);
    const params = {};
    if (brokerParam) params.broker = brokerParam;
    API.get("dashboard/", { params })
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load dashboard data."))
      .finally(() => setLoading(false));
  }, [brokerParam]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const activeBrokerName = activeBroker === "all"
    ? null
    : brokers.find(b => String(b.id) === activeBroker)?.name;

  const segmentLabels = {
    equity:  { label: "Equity",       icon: "📊" },
    futures: { label: "Futures",       icon: "📉" },
    ce:      { label: "Call (CE)",     icon: "📈" },
    pe:      { label: "Put (PE)",      icon: "📉" },
    mf:      { label: "Mutual Funds",  icon: "🏦" },
  };

  return (
    <>
      <Navbar />
      <div className="container-fluid px-4 py-4 sf-page">

        {/* Header + Broker Selector */}
        <div className="sf-page-header mb-3">
          <div>
            <h2 className="sf-page-title mb-0">Dashboard</h2>
            <p className="sf-page-subtitle mb-0">
              Your trading overview
              {activeBrokerName && (
                <span className="ms-2">
                  — <span className="sf-broker-tag-inline">{activeBrokerName}</span>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Broker selector bar */}
        <BrokerSelector className="mb-4" />

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

        {data && !loading && (
          <>
            {/* Main stat cards */}
            <div className="row g-3 mb-4">
              <StatCard icon="💰" label="Available Balance" value={data.balance}
                color={data.balance >= 0 ? "primary" : "danger"} />
              <StatCard icon={data.total_realized_pl >= 0 ? "📈" : "📉"}
                label="Realized P&L"
                value={data.total_realized_pl}
                color={data.total_realized_pl >= 0 ? "success" : "danger"} />
              <StatCard icon="💼" label="Currently Invested" value={data.total_invested} color="warning" />
              <StatCard icon="🏷️" label="Total Charges Paid" value={data.trade_charges} color="secondary" />
            </div>

            {/* Balance breakdown */}
            <div className="sf-section-card mb-4">
              <h5 className="sf-section-title mb-3">
                <i className="bi bi-wallet2 me-2"></i>Balance Breakdown
                {activeBrokerName && (
                  <span className="ms-2 sf-broker-tag">
                    <i className="bi bi-building me-1"></i>{activeBrokerName}
                  </span>
                )}
              </h5>
              <div className="sf-balance-breakdown">
                <div className="sf-bb-row">
                  <span><i className="bi bi-arrow-down-circle text-success me-2"></i>Total Deposits</span>
                  <strong className="text-success">+{fmt(data.total_deposit)}</strong>
                </div>
                <div className="sf-bb-row">
                  <span><i className="bi bi-arrow-up-circle text-danger me-2"></i>Total Withdrawals</span>
                  <strong className="text-danger">−{fmt(data.total_withdraw)}</strong>
                </div>
                <div className="sf-bb-row">
                  <span><i className="bi bi-cart text-warning me-2"></i>Buy Costs (invested + charges)</span>
                  <strong className="text-warning">
                    −{fmt(data.total_invested + data.trade_charges)}
                  </strong>
                </div>
                <div className="sf-bb-row">
                  <span>
                    <i className={`bi ${data.total_realized_pl >= 0 ? "bi-graph-up text-success" : "bi-graph-down text-danger"} me-2`}></i>
                    Realized P&L from Sells
                  </span>
                  <strong className={data.total_realized_pl >= 0 ? "text-success" : "text-danger"}>
                    {data.total_realized_pl >= 0 ? "+" : ""}{fmt(data.total_realized_pl)}
                  </strong>
                </div>
                <div className="sf-bb-total">
                  <span>Available Balance</span>
                  <strong className={data.balance >= 0 ? "text-success" : "text-danger"} style={{ fontSize: "1.1rem" }}>
                    {fmt(data.balance)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Position counts + win rate */}
            <div className="row g-3 mb-4">
              <div className="col-sm-6 col-md-3">
                <div className="sf-count-card">
                  <span className="sf-count-num">{data.total_positions}</span>
                  <span className="sf-count-label">Total Positions</span>
                </div>
              </div>
              <div className="col-sm-6 col-md-3">
                <div className="sf-count-card sf-count-open">
                  <span className="sf-count-num">{data.open_positions}</span>
                  <span className="sf-count-label">Open Positions</span>
                </div>
              </div>
              <div className="col-sm-6 col-md-3">
                <div className="sf-count-card sf-count-closed">
                  <span className="sf-count-num">{data.closed_positions}</span>
                  <span className="sf-count-label">Closed Positions</span>
                </div>
              </div>
              <div className="col-sm-6 col-md-3">
                <div className={`sf-count-card ${data.win_rate >= 50 ? "sf-count-win" : "sf-count-lose"}`}>
                  <span className={`sf-count-num ${data.win_rate >= 50 ? "text-success" : "text-danger"}`}>
                    {data.win_rate}%
                  </span>
                  <span className="sf-count-label">
                    Win Rate ({data.winning_trades}W / {data.losing_trades}L)
                  </span>
                </div>
              </div>
            </div>

            {/* Segment breakdown */}
            <div className="sf-section-card mb-4">
              <h5 className="sf-section-title mb-3">
                <i className="bi bi-pie-chart me-2"></i>Segment Breakdown
              </h5>
              <div className="row g-3">
                {Object.entries(data.segment_stats || {}).map(([key, seg]) =>
                  seg.count > 0 ? (
                    <div className="col-sm-6 col-md-4 col-xl-2" key={key}>
                      <div className="sf-segment-card">
                        <div className="sf-segment-icon">{segmentLabels[key]?.icon || "📊"}</div>
                        <div className="sf-segment-label">{seg.label}</div>
                        <div className="sf-segment-count">{seg.count} positions</div>
                        <div className="sf-segment-count text-muted" style={{ fontSize: "0.7rem" }}>
                          {seg.open} open · {seg.closed} closed
                        </div>
                        <div className={`sf-segment-pl ${seg.profit_loss >= 0 ? "text-success" : "text-danger"}`}>
                          {seg.profit_loss >= 0 ? "+" : ""}{fmt(seg.profit_loss)}
                        </div>
                      </div>
                    </div>
                  ) : null
                )}
              </div>
              {Object.values(data.segment_stats || {}).every((s) => s.count === 0) && (
                <p className="text-muted small mb-0">
                  No trades yet.{" "}
                  <Link to="/add-trade" className="sf-auth-link">Add your first trade</Link>
                </p>
              )}
            </div>

            {/* Quick links */}
            <div className="row g-3">
              <div className="col-md-4">
                <Link to="/add-trade" className="sf-quick-link">
                  <i className="bi bi-plus-circle"></i>
                  <span>Add Buy Trade</span>
                </Link>
              </div>
              <div className="col-md-4">
                <Link to="/transactions" className="sf-quick-link">
                  <i className="bi bi-bank"></i>
                  <span>Add Deposit / Withdraw</span>
                </Link>
              </div>
              <div className="col-md-4">
                <Link to="/history" className="sf-quick-link">
                  <i className="bi bi-clock-history"></i>
                  <span>View Trade History</span>
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default Dashboard;
