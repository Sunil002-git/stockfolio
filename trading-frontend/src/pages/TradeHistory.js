import React, { useEffect, useState, useCallback } from "react";
import Navbar from "../components/Navbar";
import API from "../services/api";

const SEGMENT_COLORS = {
  equity: "primary", futures: "warning", ce: "success", pe: "danger", mf: "info",
};
const SEGMENT_LABELS = {
  equity: "Equity", futures: "Futures", ce: "CE", pe: "PE", mf: "MF",
};

const fmt = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const TradeHistory = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("feed"); // feed | symbols
  const [filters, setFilters] = useState({
    symbol: "",
    trade_type: "",
    segment: "",
    from_date: "",
    to_date: "",
  });
  const [symbolSearch, setSymbolSearch] = useState("");

  const fetchHistory = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filters.symbol)     params.symbol     = filters.symbol;
    if (filters.trade_type) params.trade_type = filters.trade_type;
    if (filters.segment)    params.segment    = filters.segment;
    if (filters.from_date)  params.from_date  = filters.from_date;
    if (filters.to_date)    params.to_date    = filters.to_date;

    API.get("trades/history/", { params })
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleFilterChange = (e) =>
    setFilters((p) => ({ ...p, [e.target.name]: e.target.value }));

  const clearFilters = () =>
    setFilters({ symbol: "", trade_type: "", segment: "", from_date: "", to_date: "" });

  const history = data?.history || [];
  const symbolSummaries = data?.symbol_summaries || [];
  const balance = data?.current_balance ?? null;

  const filteredSymbols = symbolSummaries.filter((s) =>
    s.symbol.toLowerCase().includes(symbolSearch.toLowerCase())
  );

  return (
    <>
      <Navbar />
      <div className="container-fluid px-4 py-4 sf-page">

        {/* Header */}
        <div className="d-flex align-items-start justify-content-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="sf-page-title mb-0">Trade History</h2>
            <p className="sf-page-subtitle mb-0">Full activity feed with balance tracking</p>
          </div>
          {balance !== null && (
            <div className="sf-balance-pill">
              <span className="sf-balance-label">Current Balance</span>
              <span className={`sf-balance-val ${balance >= 0 ? "text-success" : "text-danger"}`}>
                {fmt(balance)}
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="sf-tabs mb-4">
          <button
            className={`sf-tab ${activeTab === "feed" ? "active" : ""}`}
            onClick={() => setActiveTab("feed")}
          >
            <i className="bi bi-activity me-2"></i>Activity Feed
            {history.length > 0 && <span className="sf-tab-count">{history.length}</span>}
          </button>
          <button
            className={`sf-tab ${activeTab === "symbols" ? "active" : ""}`}
            onClick={() => setActiveTab("symbols")}
          >
            <i className="bi bi-grid me-2"></i>By Symbol
            {symbolSummaries.length > 0 && <span className="sf-tab-count">{symbolSummaries.length}</span>}
          </button>
        </div>

        {/* ── ACTIVITY FEED TAB ── */}
        {activeTab === "feed" && (
          <>
            {/* Filters */}
            <div className="sf-filter-bar mb-4">
              <div className="row g-2 align-items-end">
                <div className="col-md-2">
                  <label className="sf-label d-block mb-1">Symbol</label>
                  <input
                    type="text"
                    name="symbol"
                    className="form-control sf-input"
                    placeholder="e.g. RELIANCE"
                    value={filters.symbol}
                    onChange={handleFilterChange}
                    style={{ textTransform: "uppercase" }}
                  />
                </div>
                <div className="col-md-2">
                  <label className="sf-label d-block mb-1">Type</label>
                  <select name="trade_type" className="form-select sf-input"
                    value={filters.trade_type} onChange={handleFilterChange}>
                    <option value="">Buy & Sell</option>
                    <option value="buy">Buy only</option>
                    <option value="sell">Sell only</option>
                  </select>
                </div>
                <div className="col-md-2">
                  <label className="sf-label d-block mb-1">Segment</label>
                  <select name="segment" className="form-select sf-input"
                    value={filters.segment} onChange={handleFilterChange}>
                    <option value="">All</option>
                    <option value="equity">Equity</option>
                    <option value="futures">Futures</option>
                    <option value="ce">CE</option>
                    <option value="pe">PE</option>
                    <option value="mf">MF</option>
                  </select>
                </div>
                <div className="col-md-2">
                  <label className="sf-label d-block mb-1">From</label>
                  <input type="date" name="from_date" className="form-control sf-input"
                    value={filters.from_date} onChange={handleFilterChange} />
                </div>
                <div className="col-md-2">
                  <label className="sf-label d-block mb-1">To</label>
                  <input type="date" name="to_date" className="form-control sf-input"
                    value={filters.to_date} onChange={handleFilterChange} />
                </div>
                <div className="col-md-2">
                  <label className="sf-label d-block mb-1">&nbsp;</label>
                  <button className="btn sf-btn-ghost w-100" onClick={clearFilters}>
                    <i className="bi bi-x-circle me-1"></i>Clear
                  </button>
                </div>
              </div>
            </div>

            {loading && (
              <div className="text-center py-5">
                <div className="spinner-border sf-spinner"></div>
                <p className="mt-3 sf-loading-text">Loading history...</p>
              </div>
            )}

            {!loading && history.length === 0 && (
              <div className="sf-empty-state">
                <div className="sf-empty-icon">📋</div>
                <h5>No trades found</h5>
                <p className="text-muted">Try adjusting filters or add your first trade.</p>
              </div>
            )}

            {/* Activity Feed */}
            {!loading && history.length > 0 && (
              <div className="sf-feed">
                {history.map((item, idx) => (
                  <div key={item.id} className={`sf-feed-item ${item.trade_type === "sell" ? "sf-feed-sell" : "sf-feed-buy"}`}>

                    {/* Timeline dot */}
                    <div className={`sf-feed-dot ${item.trade_type === "sell" ? "sf-dot-sell" : "sf-dot-buy"}`}></div>

                    {/* Card */}
                    <div className="sf-feed-card">
                      <div className="sf-feed-card-header">
                        {/* Left: symbol + badges */}
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className="sf-symbol">{item.symbol}</span>
                          <span className={`badge bg-${SEGMENT_COLORS[item.segment] || "secondary"} sf-badge`}>
                            {SEGMENT_LABELS[item.segment] || item.segment}
                          </span>
                          <span className="sf-exchange-tag">{item.exchange}</span>
                          <span className={`sf-type-tag ${item.trade_type === "buy" ? "sf-type-buy" : "sf-type-sell"}`}>
                            {item.trade_type === "buy" ? "▲ BUY" : "▼ SELL"}
                          </span>
                          {item.strike_price && (
                            <span className="sf-strike-badge">Strike: ₹{item.strike_price}</span>
                          )}
                        </div>

                        {/* Right: date */}
                        <div className="sf-date-cell">{item.date}</div>
                      </div>

                      {/* Stats row */}
                      <div className="sf-feed-stats">
                        <div className="sf-feed-stat">
                          <div className="sf-feed-stat-label">
                            {item.trade_type === "buy" ? "Buy Price" : "Sell Price"}
                          </div>
                          <div className="sf-feed-stat-val">{fmt(item.price)}</div>
                        </div>
                        <div className="sf-feed-stat">
                          <div className="sf-feed-stat-label">Quantity</div>
                          <div className="sf-feed-stat-val">{item.quantity}</div>
                        </div>
                        <div className="sf-feed-stat">
                          <div className="sf-feed-stat-label">
                            {item.trade_type === "buy" ? "Cost" : "Proceeds"}
                          </div>
                          <div className="sf-feed-stat-val">
                            {item.trade_type === "buy"
                              ? fmt(item.price * item.quantity + item.charges)
                              : fmt(item.price * item.quantity - item.charges)}
                          </div>
                        </div>
                        {item.charges > 0 && (
                          <div className="sf-feed-stat">
                            <div className="sf-feed-stat-label">Charges</div>
                            <div className="sf-feed-stat-val text-muted">{fmt(item.charges)}</div>
                          </div>
                        )}
                        {item.avg_cost && (
                          <div className="sf-feed-stat">
                            <div className="sf-feed-stat-label">Avg Cost</div>
                            <div className="sf-feed-stat-val">{fmt(item.avg_cost)}</div>
                          </div>
                        )}
                        {item.trade_type === "sell" && item.profit_loss !== null && (
                          <div className="sf-feed-stat">
                            <div className="sf-feed-stat-label">P&L</div>
                            <div className={`sf-feed-stat-val ${item.profit_loss >= 0 ? "sf-profit" : "sf-loss"}`}>
                              {item.profit_loss >= 0 ? "+" : ""}{fmt(item.profit_loss)}
                            </div>
                          </div>
                        )}
                        {item.balance_after !== undefined && item.balance_after !== null && (
                          <div className="sf-feed-stat sf-feed-stat-balance">
                            <div className="sf-feed-stat-label">Balance After</div>
                            <div className={`sf-feed-stat-val ${item.balance_after >= 0 ? "" : "text-danger"}`}>
                              {fmt(item.balance_after)}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Previous trade context — only for sell trades */}
                      {item.trade_type === "sell" && item.previous_trade_context && (
                        <div className={`sf-prev-trade ${item.previous_trade_context.outcome === "profit" ? "sf-prev-profit" : "sf-prev-loss"}`}>
                          <i className={`bi ${item.previous_trade_context.outcome === "profit" ? "bi-trophy" : "bi-exclamation-triangle"} me-2`}></i>
                          <span>
                            Last time you traded <strong>{item.symbol}</strong>
                            {item.previous_trade_context.date && ` (${item.previous_trade_context.date})`}:{" "}
                            <strong className={item.previous_trade_context.outcome === "profit" ? "sf-profit" : "sf-loss"}>
                              {item.previous_trade_context.outcome === "profit" ? "+" : ""}
                              {fmt(item.previous_trade_context.realized_pl)}
                            </strong>
                            {" "}— {item.previous_trade_context.outcome === "profit" ? "you made a profit 🎉" : "you took a loss. Trade carefully!"}
                          </span>
                        </div>
                      )}

                      {/* Notes */}
                      {item.notes && (
                        <div className="sf-feed-notes">
                          <i className="bi bi-chat-left-text me-1"></i>{item.notes}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── BY SYMBOL TAB ── */}
        {activeTab === "symbols" && (
          <>
            <div className="sf-filter-bar mb-4">
              <div className="input-group sf-input-group" style={{ maxWidth: "320px" }}>
                <span className="input-group-text sf-input-icon">
                  <i className="bi bi-search"></i>
                </span>
                <input
                  type="text"
                  className="form-control sf-input"
                  placeholder="Search symbol..."
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                />
              </div>
            </div>

            {loading && (
              <div className="text-center py-5">
                <div className="spinner-border sf-spinner"></div>
              </div>
            )}

            {!loading && filteredSymbols.length === 0 && (
              <div className="sf-empty-state">
                <div className="sf-empty-icon">📊</div>
                <h5>No symbols found</h5>
              </div>
            )}

            {!loading && filteredSymbols.length > 0 && (
              <div className="row g-3">
                {filteredSymbols.map((sym) => (
                  <div key={sym.symbol} className="col-md-6 col-xl-4">
                    <div
                      className="sf-symbol-card"
                      onClick={() => {
                        setFilters((p) => ({ ...p, symbol: sym.symbol }));
                        setActiveTab("feed");
                      }}
                    >
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <span className="sf-symbol">{sym.symbol}</span>
                        <span className={`sf-outcome-badge ${sym.outcome === "profit" ? "sf-outcome-profit" : "sf-outcome-loss"}`}>
                          {sym.outcome === "profit" ? "📈 Profit" : "📉 Loss"}
                        </span>
                      </div>

                      <div className="sf-symbol-pl">
                        <span className={sym.total_pl >= 0 ? "sf-profit" : "sf-loss"}>
                          {sym.total_pl >= 0 ? "+" : ""}{fmt(sym.total_pl)}
                        </span>
                        <span className="sf-symbol-pl-label">Total P&L</span>
                      </div>

                      <div className="sf-symbol-meta">
                        <span><i className="bi bi-repeat me-1"></i>{sym.trades_count} trades</span>
                        {sym.last_trade_date && (
                          <span>
                            <i className="bi bi-clock me-1"></i>
                            Last: {sym.last_trade_type === "buy" ? "▲" : "▼"} {sym.last_trade_date}
                          </span>
                        )}
                      </div>

                      <div className="sf-symbol-card-hint">
                        <i className="bi bi-arrow-right me-1"></i>Click to view trades
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default TradeHistory;
