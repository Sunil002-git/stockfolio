import React, { useState } from "react";
import API from "../services/api";

const EditTradeModal = ({ group, trade, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    buy_price: trade.buy_price,
    quantity: trade.quantity,
    charges: trade.charges || 0,
    date: trade.date,
    notes: trade.notes || "",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    try {
      await API.patch(`positions/${group.id}/edit_trade/`, {
        trade_id: trade.id,
        buy_price: parseFloat(form.buy_price),
        quantity: parseInt(form.quantity),
        charges: parseFloat(form.charges || 0),
        date: form.date,
        notes: form.notes,
      });
      onSuccess(group.id);
    } catch (err) {
      setErrors(err.response?.data || { detail: "Something went wrong." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sf-modal-overlay" onClick={onClose}>
      <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sf-modal-header">
          <div>
            <h5 className="sf-modal-title">
              <span className="sf-type-tag sf-type-buy me-2">▲ EDIT BUY</span>
              {group.symbol}
            </h5>
            <div className="sf-modal-sub">Edit this buy lot — avg cost will recalculate automatically</div>
          </div>
          <button className="sf-modal-close" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="sf-modal-body">
          {errors.detail && (
            <div className="alert alert-danger py-2 small mb-3">{errors.detail}</div>
          )}

          <div className="row g-3">
            <div className="col-6">
              <label className="form-label sf-label">Buy Price (₹) <span className="text-danger">*</span></label>
              <input type="number" name="buy_price" className="form-control sf-input"
                value={form.buy_price} onChange={handleChange}
                step="0.01" min="0" required autoFocus />
            </div>

            <div className="col-6">
              <label className="form-label sf-label">Quantity <span className="text-danger">*</span></label>
              <input type="number" name="quantity" className="form-control sf-input"
                value={form.quantity} onChange={handleChange} min="1" required />
            </div>

            <div className="col-6">
              <label className="form-label sf-label">Charges (₹)</label>
              <input type="number" name="charges" className="form-control sf-input"
                value={form.charges} onChange={handleChange} step="0.01" min="0" />
            </div>

            <div className="col-6">
              <label className="form-label sf-label">Buy Date <span className="text-danger">*</span></label>
              <input type="date" name="date" className="form-control sf-input"
                value={form.date} onChange={handleChange} required />
            </div>

            <div className="col-12">
              <label className="form-label sf-label">Notes</label>
              <textarea name="notes" className="form-control sf-input" rows="2"
                placeholder="Trade rationale..."
                value={form.notes} onChange={handleChange}></textarea>
            </div>
          </div>

          <div className="sf-avg-note mt-3">
            <i className="bi bi-info-circle me-1"></i>
            Saving will recalculate the average cost across all buy lots for {group.symbol}.
          </div>

          <div className="d-flex gap-3 mt-4">
            <button type="submit" className="btn sf-btn-primary flex-fill" disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>
                : <><i className="bi bi-check-circle me-2"></i>Save Changes</>}
            </button>
            <button type="button" className="btn sf-btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditTradeModal;
