import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import API from "../services/api";

const initialForm = {
  symbol: "",
  segment: "equity",
  exchange: "NSE",
  buy_price: "",
  quantity: "",
  charges: "",
  date: new Date().toISOString().split("T")[0],
  broker_id: "",
  // F&O fields
  strike_price: "",
  expiry_date: "",
  lot_size: "",
  // MF fields
  fund_house: "",
  // Notes
  notes: "",
};

const SEGMENTS = [
  { value: "equity", label: "Equity (Stock)" },
  { value: "futures", label: "Futures" },
  { value: "ce", label: "Call Option (CE)" },
  { value: "pe", label: "Put Option (PE)" },
  { value: "mf", label: "Mutual Fund" },
];

const EXCHANGES = ["NSE", "BSE", "MCX", "NFO", "BFO"];

const isDerivative = (seg) => ["futures", "ce", "pe"].includes(seg);
const isMF = (seg) => seg === "mf";

const AddTrade = () => {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState("");
  const [brokers, setBrokers] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Load user settings for defaults and brokers list
    Promise.all([
      API.get("settings/"),
      API.get("brokers/", { params: { active_only: "true" } }),
    ]).then(([sRes, bRes]) => {
      const s = sRes.data;
      setForm(prev => ({
        ...prev,
        exchange: s.default_exchange || prev.exchange,
        segment:  s.default_segment  || prev.segment,
      }));
      setBrokers(bRes.data);
    }).catch(() => {});
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    setSuccess("");

    // Build payload — strip empty strings to null
    const payload = {
      symbol: form.symbol.trim().toUpperCase(),
      segment: form.segment,
      exchange: form.exchange,
      buy_price: parseFloat(form.buy_price),
      quantity: parseInt(form.quantity),
      charges: parseFloat(form.charges || 0),
      date: form.date,
      notes: form.notes || "",
    };
    if (form.broker_id) payload.broker_id = parseInt(form.broker_id);

    // F&O extras
    if (isDerivative(form.segment)) {
      if (form.strike_price) payload.strike_price = parseFloat(form.strike_price);
      if (form.expiry_date) payload.expiry_date = form.expiry_date;
      if (form.lot_size) payload.lot_size = parseInt(form.lot_size);
    }

    // MF extras
    if (isMF(form.segment)) {
      payload.fund_house = form.fund_house || "";
    }

    try {
      // ✅ Correct endpoint: trades/buy/
      await API.post("trades/buy/", payload);
      setSuccess("Buy trade added successfully!");
      setTimeout(() => navigate("/positions"), 1200);
    } catch (err) {
      if (err.response?.data) {
        setErrors(err.response.data);
      } else {
        setErrors({ non_field_errors: ["Something went wrong. Please try again."] });
      }
    } finally {
      setLoading(false);
    }
  };

  const fieldError = (field) =>
    errors[field] ? (
      <div className="text-danger small mt-1">
        {Array.isArray(errors[field]) ? errors[field][0] : errors[field]}
      </div>
    ) : null;

  return (
    <>
      <Navbar />
      <div className="container-fluid px-4 py-4 sf-page">
        <div className="sf-page-header mb-4">
          <h2 className="sf-page-title">Add Buy Trade</h2>
          <p className="sf-page-subtitle">Log a new buy entry — you can sell it later from Positions</p>
        </div>

        <div className="row justify-content-center">
          <div className="col-xl-9 col-lg-11">
            <div className="sf-form-card">
              <form onSubmit={handleSubmit}>

                {errors.non_field_errors && (
                  <div className="alert alert-danger py-2 small mb-3">
                    <i className="bi bi-exclamation-circle me-2"></i>
                    {errors.non_field_errors[0]}
                  </div>
                )}
                {success && (
                  <div className="alert alert-success py-2 small mb-3">
                    <i className="bi bi-check-circle me-2"></i>{success}
                  </div>
                )}

                {/* Section 1 — Trade Identity */}
                <div className="sf-form-section">
                  <h6 className="sf-form-section-title">
                    <span className="sf-form-step">1</span> Trade Identity
                  </h6>
                  <div className="row g-3">
                    <div className="col-md-4">
                      <label className="form-label sf-label">Segment <span className="text-danger">*</span></label>
                      <select name="segment" className="form-select sf-input"
                        value={form.segment} onChange={handleChange} required>
                        {SEGMENTS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      {fieldError("segment")}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label sf-label">Exchange <span className="text-danger">*</span></label>
                      <select name="exchange" className="form-select sf-input"
                        value={form.exchange} onChange={handleChange} required>
                        {EXCHANGES.map((ex) => (
                          <option key={ex} value={ex}>{ex}</option>
                        ))}
                      </select>
                      {fieldError("exchange")}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label sf-label">Trade Type</label>
                      <div className="sf-type-btn sf-type-buy-active w-100 text-center py-2" style={{ borderRadius: "8px", fontSize: "0.88rem" }}>
                        <i className="bi bi-arrow-up-circle me-2"></i>Buy Entry
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2 — Symbol & Date */}
                <div className="sf-form-section">
                  <h6 className="sf-form-section-title">
                    <span className="sf-form-step">2</span> Symbol & Date
                  </h6>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label sf-label">
                        {isMF(form.segment) ? "Fund Name" : "Stock Symbol"} <span className="text-danger">*</span>
                      </label>
                      <input type="text" name="symbol" className="form-control sf-input"
                        placeholder={isMF(form.segment) ? "e.g. Mirae Asset Large Cap" : "e.g. RELIANCE, NIFTY50"}
                        value={form.symbol} onChange={handleChange}
                        required style={{ textTransform: "uppercase" }} />
                      {fieldError("symbol")}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label sf-label">Trade Date <span className="text-danger">*</span></label>
                      <input type="date" name="date" className="form-control sf-input"
                        value={form.date} onChange={handleChange} required />
                      {fieldError("date")}
                    </div>

                    {isMF(form.segment) && (
                      <div className="col-md-6">
                        <label className="form-label sf-label">Fund House</label>
                        <input type="text" name="fund_house" className="form-control sf-input"
                          placeholder="e.g. Mirae Asset, SBI MF, HDFC MF"
                          value={form.fund_house} onChange={handleChange} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3 — Price & Quantity */}
                <div className="sf-form-section">
                  <h6 className="sf-form-section-title">
                    <span className="sf-form-step">3</span> Price & Quantity
                  </h6>
                  <div className="row g-3">
                    <div className="col-md-4">
                      <label className="form-label sf-label">Buy Price (₹) <span className="text-danger">*</span></label>
                      <input type="number" name="buy_price" className="form-control sf-input"
                        placeholder="0.00" value={form.buy_price} onChange={handleChange}
                        step="0.01" min="0" required />
                      {fieldError("buy_price")}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label sf-label">Quantity <span className="text-danger">*</span></label>
                      <input type="number" name="quantity" className="form-control sf-input"
                        placeholder="0" value={form.quantity} onChange={handleChange}
                        min="1" required />
                      {fieldError("quantity")}
                    </div>

                    <div className="col-md-4">
                      <label className="form-label sf-label">Charges / Brokerage (₹)</label>
                      <input type="number" name="charges" className="form-control sf-input"
                        placeholder="0.00" value={form.charges} onChange={handleChange}
                        step="0.01" min="0" />
                    </div>
                  </div>

                  {/* Invested amount preview */}
                  {form.buy_price && form.quantity && (
                    <div className="sf-pl-preview sf-pl-profit mt-3">
                      <i className="bi bi-wallet2 me-2"></i>
                      Total Investment: <strong>
                        ₹{Number(parseFloat(form.buy_price) * parseInt(form.quantity || 0))
                          .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </strong>
                      {parseFloat(form.charges) > 0 && (
                        <span className="ms-2 text-muted small">+ ₹{form.charges} charges</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Section 4 — F&O Fields */}
                {isDerivative(form.segment) && (
                  <div className="sf-form-section sf-form-section-highlight">
                    <h6 className="sf-form-section-title">
                      <span className="sf-form-step">4</span> F&O Details
                    </h6>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label sf-label">Strike Price (₹)</label>
                        <input type="number" name="strike_price" className="form-control sf-input"
                          placeholder="e.g. 19500" value={form.strike_price} onChange={handleChange} step="0.5" />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label sf-label">Expiry Date</label>
                        <input type="date" name="expiry_date" className="form-control sf-input"
                          value={form.expiry_date} onChange={handleChange} />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label sf-label">Lot Size</label>
                        <input type="number" name="lot_size" className="form-control sf-input"
                          placeholder="e.g. 50" value={form.lot_size} onChange={handleChange} min="1" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Section Broker */}
                {brokers.length > 0 && (
                  <div className="sf-form-section">
                    <h6 className="sf-form-section-title">
                      <span className="sf-form-step">{isDerivative(form.segment) ? "5" : "4"}</span> Broker
                      <span className="ms-2 text-muted small fw-normal">(optional)</span>
                    </h6>
                    <select name="broker_id" className="form-select sf-input" value={form.broker_id} onChange={handleChange}>
                      <option value="">— Select Broker —</option>
                      {brokers.map(b => (
                        <option key={b.id} value={b.id}>{b.name}{b.account_id ? " (" + b.account_id + ")" : ""}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Section Notes */}
                <div className="sf-form-section">
                  <h6 className="sf-form-section-title">
                    <span className="sf-form-step">{isDerivative(form.segment) ? (brokers.length > 0 ? "6" : "5") : (brokers.length > 0 ? "5" : "4")}</span> Notes
                    <span className="ms-2 text-muted small fw-normal">(optional)</span>
                  </h6>
                  <textarea name="notes" className="form-control sf-input" rows="3"
                    placeholder="Why are you buying? Strategy, observations..."
                    value={form.notes} onChange={handleChange}></textarea>
                </div>

                {/* Actions */}
                <div className="d-flex gap-3 mt-4">
                  <button type="submit" className="btn sf-btn-primary flex-fill" disabled={loading}>
                    {loading ? (
                      <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>
                    ) : (
                      <><i className="bi bi-plus-circle me-2"></i>Add Buy Trade</>
                    )}
                  </button>
                  <button type="button" className="btn sf-btn-ghost"
                    onClick={() => navigate("/positions")}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AddTrade;