import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import SellModal from "../components/SellModal";
import EditTradeModal from "../components/EditTradeModal";
import API from "../services/api";
import { useBroker, BrokerSelector } from "../context/BrokerContext";

const SEGMENT_COLORS = {
  equity: "primary", futures: "warning", ce: "success", pe: "danger", mf: "info",
};
const SEGMENT_LABELS = {
  equity: "Equity", futures: "Futures", ce: "CE", pe: "PE", mf: "MF",
};

const Positions = () => {
  const { brokerParam } = useBroker();
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open"); // open | closed | all
  const [segFilter, setSegFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [groupDetails, setGroupDetails] = useState({});
  const [sellTarget, setSellTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null); // { group, trade }

  const fetchPositions = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filter !== "all") params.is_closed = filter === "closed";
    if (segFilter) params.segment = segFilter;
    if (brokerParam) params.broker = brokerParam;
    API.get("positions/", { params })
      .then((r) => setPositions(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter, segFilter, brokerParam]);

  useEffect(() => { fetchPositions(); }, [fetchPositions]);

  const toggleExpand = async (id) => {
    setExpanded((p) => ({ ...p, [id]: !p[id] }));
    if (!groupDetails[id]) {
      const r = await API.get(`positions/${id}/`);
      setGroupDetails((p) => ({ ...p, [id]: r.data }));
    }
  };

  const refreshGroup = async (id) => {
    const r = await API.get(`positions/${id}/`);
    setGroupDetails((p) => ({ ...p, [id]: r.data }));
    fetchPositions();
  };

  const handleDeleteTrade = async (groupId, tradeId) => {
    if (!window.confirm("Delete this trade entry?")) return;
    await API.delete(`positions/${groupId}/delete_trade/?trade_id=${tradeId}`);
    refreshGroup(groupId);
  };

  const filtered = positions.filter((p) =>
    p.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const totalPL = filtered.reduce((s, p) => s + (p.realized_pl || 0), 0);
  const totalInvested = filtered.reduce((s, p) => s + (p.total_invested || 0), 0);

  return (
    <>
      <Navbar />
      <div className="container-fluid px-4 py-4 sf-page">
        <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="sf-page-title mb-0">Positions</h2>
            <p className="sf-page-subtitle mb-0">All your stock positions grouped by symbol</p>
          </div>
          <Link to="/add-trade" className="btn sf-btn-primary">
            <i className="bi bi-plus-circle me-2"></i>Add Buy
          </Link>
        </div>

        {/* Broker selector */}
        <BrokerSelector className="mb-3" />

        {/* Filters */}
        <div className="sf-filter-bar mb-4">
          <div className="row g-2 align-items-center">
            <div className="col-md-3">
              <div className="input-group sf-input-group">
                <span className="input-group-text sf-input-icon"><i className="bi bi-search"></i></span>
                <input type="text" className="form-control sf-input" placeholder="Search symbol..."
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="col-md-2">
              <select className="form-select sf-input" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="open">Open Positions</option>
                <option value="closed">Closed Positions</option>
                <option value="all">All Positions</option>
              </select>
            </div>
            <div className="col-md-2">
              <select className="form-select sf-input" value={segFilter} onChange={(e) => setSegFilter(e.target.value)}>
                <option value="">All Segments</option>
                <option value="equity">Equity</option>
                <option value="futures">Futures</option>
                <option value="ce">Call (CE)</option>
                <option value="pe">Put (PE)</option>
                <option value="mf">Mutual Fund</option>
              </select>
            </div>
            <div className="col-md-2">
              <button className="btn sf-btn-ghost w-100" onClick={() => { setFilter("open"); setSegFilter(""); setSearch(""); }}>
                <i className="bi bi-x-circle me-1"></i>Clear
              </button>
            </div>
          </div>
        </div>

        {/* Summary strip */}
        {!loading && filtered.length > 0 && (
          <div className="sf-summary-strip mb-3">
            <span><i className="bi bi-layers me-1"></i>{filtered.length} positions</span>
            <span className="sf-strip-divider">|</span>
            <span>Invested: <strong>₹{Number(totalInvested).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></span>
            <span className="sf-strip-divider">|</span>
            <span className={totalPL >= 0 ? "text-success" : "text-danger"}>
              Realized P&L: <strong>{totalPL >= 0 ? "+" : ""}₹{Number(totalPL).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
            </span>
          </div>
        )}

        {loading && (
          <div className="text-center py-5">
            <div className="spinner-border sf-spinner"></div>
            <p className="mt-3 sf-loading-text">Loading positions...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="sf-empty-state">
            <div className="sf-empty-icon">📭</div>
            <h5>No positions found</h5>
            <p className="text-muted">Add your first buy trade to get started.</p>
            <Link to="/add-trade" className="btn sf-btn-primary mt-2">
              <i className="bi bi-plus-circle me-2"></i>Add First Trade
            </Link>
          </div>
        )}

        {/* Positions list */}
        <div className="d-flex flex-column gap-3">
          {filtered.map((pos) => {
            const pl = pos.realized_pl || 0;
            const isOpen = expanded[pos.id];
            const detail = groupDetails[pos.id];

            return (
              <div key={pos.id} className="sf-position-card">
                {/* Position header row */}
                <div className="sf-position-header" onClick={() => toggleExpand(pos.id)}>
                  <div className="d-flex align-items-center gap-3 flex-wrap">
                    <div className="sf-symbol">{pos.symbol}</div>
                    <span className={`badge bg-${SEGMENT_COLORS[pos.segment] || "secondary"} sf-badge`}>
                      {SEGMENT_LABELS[pos.segment]}
                    </span>
                    <span className="sf-exchange-tag">{pos.exchange}</span>
                    {pos.is_closed
                      ? <span className="sf-closed-badge">Closed</span>
                      : <span className="sf-open-pos-badge">Open</span>}
                  </div>

                  <div className="d-flex align-items-center gap-4 flex-wrap ms-auto">
                    <div className="sf-pos-stat">
                      <div className="sf-pos-stat-label">Avg Cost</div>
                      <div className="sf-pos-stat-val">₹{Number(pos.avg_cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div className="sf-pos-stat">
                      <div className="sf-pos-stat-label">Qty Remaining</div>
                      <div className="sf-pos-stat-val">{pos.total_quantity}</div>
                    </div>
                    <div className="sf-pos-stat">
                      <div className="sf-pos-stat-label">Invested</div>
                      <div className="sf-pos-stat-val">₹{Number(pos.total_invested).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div className="sf-pos-stat">
                      <div className="sf-pos-stat-label">Realized P&L</div>
                      <div className={`sf-pos-stat-val ${pl >= 0 ? "sf-profit" : "sf-loss"}`}>
                        {pl >= 0 ? "+" : ""}₹{Number(pl).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="d-flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {!pos.is_closed && (
                        <button className="btn btn-sm sf-sell-btn" onClick={() => setSellTarget(pos)}>
                          <i className="bi bi-arrow-down-circle me-1"></i>Sell
                        </button>
                      )}
                    </div>

                    <i className={`bi bi-chevron-${isOpen ? "up" : "down"} text-muted`}></i>
                  </div>
                </div>

                {/* Expanded: buy/sell lots */}
                {isOpen && (
                  <div className="sf-position-body">
                    {!detail ? (
                      <div className="text-center py-3"><div className="spinner-border spinner-border-sm sf-spinner"></div></div>
                    ) : (
                      <>
                        <div className="sf-lots-label mb-2">Trade Lots</div>
                        <div className="sf-table-wrap">
                          <table className="table sf-table mb-0">
                            <thead>
                              <tr>
                                <th>Type</th><th>Date</th><th>Price</th><th>Qty</th>
                                <th>Charges</th><th>P&L</th><th>Notes</th><th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.trades.map((t) => (
                                <tr key={t.id} className="sf-table-row">
                                  <td>
                                    <span className={`sf-type-tag ${t.trade_type === "buy" ? "sf-type-buy" : "sf-type-sell"}`}>
                                      {t.trade_type === "buy" ? "▲ BUY" : "▼ SELL"}
                                    </span>
                                  </td>
                                  <td className="sf-date-cell">{t.date}</td>
                                  <td>₹{Number(t.trade_type === "buy" ? t.buy_price : t.sell_price).toLocaleString("en-IN")}</td>
                                  <td>{t.quantity}</td>
                                  <td>₹{Number(t.charges || 0).toLocaleString("en-IN")}</td>
                                  <td>
                                    {t.profit_loss != null
                                      ? <span className={t.profit_loss >= 0 ? "sf-profit" : "sf-loss"}>
                                          {t.profit_loss >= 0 ? "+" : ""}₹{Number(t.profit_loss).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                        </span>
                                      : <span className="text-muted small">—</span>}
                                  </td>
                                  <td className="text-muted small">{t.notes || "—"}</td>
                                  <td>
                                    <div className="d-flex gap-1">
                                      {t.trade_type === "buy" && (
                                        <button className="btn btn-sm sf-edit-btn"
                                          onClick={() => setEditTarget({ group: detail, trade: t })}>
                                          <i className="bi bi-pencil"></i>
                                        </button>
                                      )}
                                      <button className="btn btn-sm sf-delete-btn"
                                        onClick={() => handleDeleteTrade(pos.id, t.id)}>
                                        <i className="bi bi-trash"></i>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="sf-avg-note mt-2">
                          <i className="bi bi-info-circle me-1"></i>
                          Avg cost ₹{Number(detail.avg_cost).toFixed(2)} calculated from {detail.trades.filter(t => t.trade_type === "buy").length} buy lot(s)
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modals */}
      {sellTarget && (
        <SellModal
          position={sellTarget}
          onClose={() => setSellTarget(null)}
          onSuccess={(groupId) => { setSellTarget(null); refreshGroup(groupId); fetchPositions(); }}
        />
      )}
      {editTarget && (
        <EditTradeModal
          group={editTarget.group}
          trade={editTarget.trade}
          onClose={() => setEditTarget(null)}
          onSuccess={(groupId) => { setEditTarget(null); refreshGroup(groupId); fetchPositions(); }}
        />
      )}
    </>
  );
};

export default Positions;
