import React, { useState } from "react";
import API from "../services/api";

const fmt = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const SellModal = ({ position, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    sell_price: "",
    quantity: position.total_quantity,
    charges: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null); // show result after success

  const handleChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const pl =
    form.sell_price && form.quantity
      ? (
          (parseFloat(form.sell_price) - position.avg_cost) *
            parseInt(form.quantity) -
          parseFloat(form.charges || 0)
        ).toFixed(2)
      : null;

  const proceeds =
    form.sell_price && form.quantity
      ? (parseFloat(form.sell_price) * parseInt(form.quantity) - parseFloat(form.charges || 0)).toFixed(2)
      : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    try {
      const res = await API.post("trades/sell/", {
        group_id: position.id,
        sell_price: parseFloat(form.sell_price),
        quantity: parseInt(form.quantity),
        charges: parseFloat(form.charges || 0),
        date: form.date,
        notes: form.notes,
      });
      setResult(res.data);
    } catch (err) {
      setErrors(
        err.response?.data || { non_field_errors: ["Something went wrong."] }
      );
    } finally {
      setLoading(false);
    }
  };

  const fieldErr = (f) =>
    errors[f] ? (
      <div className="text-danger small mt-1">
        {Array.isArray(errors[f]) ? errors[f][0] : errors[f]}
      </div>
    ) : null;

  // ── Result screen after sell ──────────────────────────────
  if (result) {
    const isProfit = (result.profit_loss || 0) >= 0;
    return (
      <div className="sf-modal-overlay" onClick={onClose}>
        <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
          <div className="sf-modal-body text-center py-4">
            <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>
              {isProfit ? "🎉" : "😔"}
            </div>
            <h4 className={`mb-1 ${isProfit ? "text-success" : "text-danger"}`}>
              {isProfit ? "Trade Closed — Profit!" : "Trade Closed — Loss"}
            </h4>
            <p className="text-muted small mb-3">
              {position.symbol} · {form.quantity} units @ {fmt(parseFloat(form.sell_price))}
            </p>

            <div className="sf-result-grid">
              <div className="sf-result-item">
                <div className="sf-result-label">Avg Cost</div>
                <div className="sf-result-val">{fmt(position.avg_cost)}</div>
              </div>
              <div className="sf-result-item">
                <div className="sf-result-label">Sell Price</div>
                <div className="sf-result-val">{fmt(parseFloat(form.sell_price))}</div>
              </div>
              <div className="sf-result-item">
                <div className="sf-result-label">Proceeds</div>
                <div className="sf-result-val">{fmt(proceeds)}</div>
              </div>
              <div className="sf-result-item">
                <div className="sf-result-label">Realized P&L</div>
                <div className={`sf-result-val ${isProfit ? "sf-profit" : "sf-loss"}`} style={{ fontSize: "1.2rem" }}>
                  {isProfit ? "+" : ""}{fmt(result.profit_loss)}
                </div>
              </div>
            </div>

            {result.new_balance !== undefined && (
              <div className="sf-balance-after-sell mt-3">
                <i className="bi bi-wallet2 me-2"></i>
                New Balance: <strong className={result.new_balance >= 0 ? "text-success" : "text-danger"}>
                  {fmt(result.new_balance)}
                </strong>
              </div>
            )}

            <button
              className="btn sf-btn-primary mt-4 px-5"
              onClick={() => onSuccess(position.id)}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Sell form ─────────────────────────────────────────────
  return (
    <div className="sf-modal-overlay" onClick={onClose}>
      <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sf-modal-header">
          <div>
            <h5 className="sf-modal-title">
              <span className="sf-type-tag sf-type-sell me-2">▼ SELL</span>
              {position.symbol}
            </h5>
            <div className="sf-modal-sub">
              Avg cost: <strong>{fmt(position.avg_cost)}</strong> &nbsp;|&nbsp;
              Available qty: <strong>{position.total_quantity}</strong>
            </div>
          </div>
          <button className="sf-modal-close" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="sf-modal-body">
          {errors.non_field_errors && (
            <div className="alert alert-danger py-2 small mb-3">
              {errors.non_field_errors[0]}
            </div>
          )}

          <div className="row g-3">
            <div className="col-6">
              <label className="form-label sf-label">
                Sell Price (₹) <span className="text-danger">*</span>
              </label>
              <input
                type="number" name="sell_price" className="form-control sf-input"
                placeholder="0.00" value={form.sell_price} onChange={handleChange}
                step="0.01" min="0" required autoFocus
              />
              {fieldErr("sell_price")}
            </div>

            <div className="col-6">
              <label className="form-label sf-label">
                Quantity <span className="text-danger">*</span>
              </label>
              <input
                type="number" name="quantity" className="form-control sf-input"
                placeholder="0" value={form.quantity} onChange={handleChange}
                min="1" max={position.total_quantity} required
              />
              {fieldErr("quantity")}
              <div className="text-muted small mt-1">Max: {position.total_quantity}</div>
            </div>

            <div className="col-6">
              <label className="form-label sf-label">Charges (₹)</label>
              <input
                type="number" name="charges" className="form-control sf-input"
                placeholder="0.00" value={form.charges} onChange={handleChange}
                step="0.01" min="0"
              />
            </div>

            <div className="col-6">
              <label className="form-label sf-label">
                Sell Date <span className="text-danger">*</span>
              </label>
              <input
                type="date" name="date" className="form-control sf-input"
                value={form.date} onChange={handleChange} required
              />
            </div>

            <div className="col-12">
              <label className="form-label sf-label">Notes</label>
              <textarea
                name="notes" className="form-control sf-input" rows="2"
                placeholder="Reason for selling..."
                value={form.notes} onChange={handleChange}
              ></textarea>
            </div>
          </div>

          {/* P&L + Proceeds Preview */}
          {pl !== null && (
            <div className={`sf-pl-preview mt-3 ${parseFloat(pl) >= 0 ? "sf-pl-profit" : "sf-pl-loss"}`}>
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                  <i className={`bi ${parseFloat(pl) >= 0 ? "bi-graph-up-arrow" : "bi-graph-down-arrow"} me-2`}></i>
                  Estimated P&L: <strong>{parseFloat(pl) >= 0 ? "+" : ""}{fmt(pl)}</strong>
                </div>
                {proceeds && (
                  <div className="text-muted small">
                    Proceeds: <strong>{fmt(proceeds)}</strong> back to balance
                  </div>
                )}
              </div>
              <div className="mt-1" style={{ fontSize: "0.78rem", opacity: 0.8 }}>
                ({form.quantity} × (₹{parseFloat(form.sell_price || 0).toFixed(2)} − ₹{position.avg_cost.toFixed(2)} avg))
                {parseFloat(form.charges) > 0 && ` − ₹${form.charges} charges`}
              </div>
            </div>
          )}

          <div className="d-flex gap-3 mt-4">
            <button
              type="submit" className="btn sf-btn-primary flex-fill" disabled={loading}
            >
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</>
                : <><i className="bi bi-arrow-down-circle me-2"></i>Confirm Sell</>}
            </button>
            <button type="button" className="btn sf-btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SellModal;
