import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import API from "../services/api";

const SEGMENT_LABELS = {
  equity: "Equity",
  futures: "Futures",
  ce: "CE",
  pe: "PE",
  mf: "MF",
};

const SEGMENT_COLORS = {
  equity: "primary",
  futures: "warning",
  ce: "success",
  pe: "danger",
  mf: "info",
};

const Trades = () => {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ segment: "", exchange: "", trade_type: "" });
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState(null);

  const fetchTrades = () => {
    setLoading(true);
    const params = {};
    if (filters.segment) params.segment = filters.segment;
    if (filters.exchange) params.exchange = filters.exchange;
    API.get("trades/", { params })
      .then((res) => setTrades(res.data))
      .catch(() => setError("Failed to load trades."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTrades();
  }, [filters]);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this trade? This cannot be undone.")) return;
    try {
      await API.delete(`trades/${id}/`);
      setTrades((prev) => prev.filter((t) => t.id !== id));
    } catch {
      alert("Failed to delete trade.");
    }
  };

  const filtered = trades.filter((t) => {
    const matchSearch = t.symbol.toLowerCase().includes(search.toLowerCase());
    const matchType = !filters.trade_type || t.trade_type === filters.trade_type;
    return matchSearch && matchType;
  });

  const totalPL = filtered.reduce((sum, t) => sum + (t.profit_loss || 0), 0);

  return (
    <>
      <Navbar />
      <div className="container-fluid px-4 py-4 sf-page">
        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="sf-page-title mb-0">Trade History</h2>
            <p className="sf-page-subtitle mb-0">All your logged trades</p>
          </div>
          <Link to="/add-trade" className="btn sf-btn-primary">
            <i className="bi bi-plus-circle me-2"></i>Add Trade
          </Link>
        </div>

        {/* Filters */}
        <div className="sf-filter-bar mb-4">
          <div className="row g-2 align-items-center">
            <div className="col-md-4">
              <div className="input-group sf-input-group">
                <span className="input-group-text sf-input-icon">
                  <i className="bi bi-search"></i>
                </span>
                <input
                  type="text"
                  className="form-control sf-input"
                  placeholder="Search symbol..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="col-md-2">
              <select
                className="form-select sf-input"
                value={filters.segment}
                onChange={(e) => setFilters((p) => ({ ...p, segment: e.target.value }))}
              >
                <option value="">All Segments</option>
                <option value="equity">Equity</option>
                <option value="futures">Futures</option>
                <option value="ce">Call (CE)</option>
                <option value="pe">Put (PE)</option>
                <option value="mf">Mutual Fund</option>
              </select>
            </div>
            <div className="col-md-2">
              <select
                className="form-select sf-input"
                value={filters.exchange}
                onChange={(e) => setFilters((p) => ({ ...p, exchange: e.target.value }))}
              >
                <option value="">All Exchanges</option>
                {["NSE", "BSE", "MCX", "NFO", "BFO"].map((ex) => (
                  <option key={ex} value={ex}>{ex}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <select
                className="form-select sf-input"
                value={filters.trade_type}
                onChange={(e) => setFilters((p) => ({ ...p, trade_type: e.target.value }))}
              >
                <option value="">Buy & Sell</option>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            <div className="col-md-2">
              <button
                className="btn sf-btn-ghost w-100"
                onClick={() => { setFilters({ segment: "", exchange: "", trade_type: "" }); setSearch(""); }}
              >
                <i className="bi bi-x-circle me-1"></i> Clear
              </button>
            </div>
          </div>
        </div>

        {/* Summary strip */}
        {!loading && filtered.length > 0 && (
          <div className="sf-summary-strip mb-3">
            <span><i className="bi bi-list-ul me-1"></i>{filtered.length} trades</span>
            <span className="sf-strip-divider">|</span>
            <span className={totalPL >= 0 ? "text-success" : "text-danger"}>
              <i className={`bi ${totalPL >= 0 ? "bi-graph-up" : "bi-graph-down"} me-1`}></i>
              Total P&L: ₹{Number(totalPL).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {loading && (
          <div className="text-center py-5">
            <div className="spinner-border sf-spinner" role="status"></div>
            <p className="mt-3 sf-loading-text">Loading trades...</p>
          </div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}

        {!loading && filtered.length === 0 && (
          <div className="sf-empty-state">
            <div className="sf-empty-icon">📭</div>
            <h5>No trades found</h5>
            <p className="text-muted">Try adjusting filters or add your first trade.</p>
            <Link to="/add-trade" className="btn sf-btn-primary mt-2">
              <i className="bi bi-plus-circle me-2"></i>Add First Trade
            </Link>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="sf-table-wrap">
            <table className="table sf-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Segment</th>
                  <th>Exchange</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Buy Price</th>
                  <th>Sell Price</th>
                  <th>Qty</th>
                  <th>Charges</th>
                  <th>P&L</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((trade) => (
                  <tr key={trade.id} className="sf-table-row">
                    <td className="sf-symbol-cell">
                      <span className="sf-symbol">{trade.symbol}</span>
                      {trade.strike_price && (
                        <span className="sf-strike-badge">@{trade.strike_price}</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge bg-${SEGMENT_COLORS[trade.segment] || "secondary"} sf-badge`}>
                        {SEGMENT_LABELS[trade.segment] || trade.segment}
                      </span>
                    </td>
                    <td>
                      <span className="sf-exchange-tag">{trade.exchange}</span>
                    </td>
                    <td>
                      <span className={`sf-type-tag ${trade.trade_type === "buy" ? "sf-type-buy" : "sf-type-sell"}`}>
                        {trade.trade_type === "buy" ? "▲ BUY" : "▼ SELL"}
                      </span>
                    </td>
                    <td className="sf-date-cell">{trade.date}</td>
                    <td>₹{Number(trade.buy_price).toLocaleString("en-IN")}</td>
                    <td>
                      {trade.sell_price
                        ? `₹${Number(trade.sell_price).toLocaleString("en-IN")}`
                        : <span className="sf-open-badge">Open</span>}
                    </td>
                    <td>{trade.quantity}</td>
                    <td>₹{Number(trade.charges || 0).toLocaleString("en-IN")}</td>
                    <td>
                      {trade.profit_loss != null ? (
                        <span className={trade.profit_loss >= 0 ? "sf-profit" : "sf-loss"}>
                          {trade.profit_loss >= 0 ? "+" : ""}
                          ₹{Number(trade.profit_loss).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-muted small">—</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm sf-delete-btn"
                        onClick={() => handleDelete(trade.id)}
                        title="Delete trade"
                      >
                        <i className="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};

export default Trades;
