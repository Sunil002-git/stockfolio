import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import API from "../services/api";

const Settings = () => {
  const [settings, setSettings] = useState({
    predict_from_date: "",
    predict_to_date: "",
    default_exchange: "NSE",
    default_segment: "equity",
  });
  const [brokers, setBrokers] = useState([]);
  const [brokerForm, setBrokerForm] = useState({ name: "", account_id: "", notes: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingBroker, setAddingBroker] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [showBrokerForm, setShowBrokerForm] = useState(false);

  useEffect(() => {
    Promise.all([API.get("settings/"), API.get("brokers/")])
      .then(([sRes, bRes]) => {
        const s = sRes.data;
        setSettings({
          predict_from_date: s.predict_from_date || "",
          predict_to_date:   s.predict_to_date   || "",
          default_exchange:  s.default_exchange  || "NSE",
          default_segment:   s.default_segment   || "equity",
        });
        setBrokers(bRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    setSuccess(""); setError("");
    try {
      const payload = {
        default_exchange: settings.default_exchange,
        default_segment:  settings.default_segment,
        predict_from_date: settings.predict_from_date || null,
        predict_to_date:   settings.predict_to_date   || null,
      };
      await API.patch("settings/", payload);
      setSuccess("Settings saved!");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const addBroker = async () => {
    if (!brokerForm.name.trim()) return;
    setAddingBroker(true);
    try {
      const res = await API.post("brokers/", brokerForm);
      setBrokers(prev => [...prev, res.data]);
      setBrokerForm({ name: "", account_id: "", notes: "" });
      setShowBrokerForm(false);
    } catch (err) {
      setError(err.response?.data?.name?.[0] || err.response?.data?.non_field_errors?.[0] || "Failed to add broker.");
    } finally {
      setAddingBroker(false);
    }
  };

  const toggleBroker = async (broker) => {
    try {
      const res = await API.patch(`brokers/${broker.id}/`, { is_active: !broker.is_active });
      setBrokers(prev => prev.map(b => b.id === broker.id ? res.data : b));
    } catch { }
  };

  const deleteBroker = async (id) => {
    if (!window.confirm("Delete this broker?")) return;
    try {
      await API.delete(`brokers/${id}/`);
      setBrokers(prev => prev.filter(b => b.id !== id));
    } catch { }
  };

  if (loading) return (
    <>
      <Navbar />
      <div className="container-fluid px-4 py-5 text-center">
        <div className="spinner-border sf-spinner"></div>
      </div>
    </>
  );

  return (
    <>
      <Navbar />
      <div className="container-fluid px-4 py-4 sf-page">
        <div className="sf-page-header mb-4">
          <h2 className="sf-page-title">Settings</h2>
          <p className="sf-page-subtitle">Manage your prediction preferences and broker accounts</p>
        </div>

        {success && <div className="alert alert-success py-2 mb-3"><i className="bi bi-check-circle me-2"></i>{success}</div>}
        {error   && <div className="alert alert-danger  py-2 mb-3"><i className="bi bi-exclamation-triangle me-2"></i>{error}</div>}

        <div className="row g-4">

          {/* ── Prediction Date Range ── */}
          <div className="col-lg-6">
            <div className="sf-section-card">
              <h5 className="sf-section-title mb-1">
                <i className="bi bi-calendar-range me-2"></i>Prediction Date Range
              </h5>
              <p className="text-muted small mb-4">
                Set the historical data window used for stock predictions.
                Leave blank to use the default (last 10 years to today).
                Useful for recently listed stocks like new IPOs.
              </p>

              <div className="row g-3">
                <div className="col-6">
                  <label className="form-label sf-label">From Date</label>
                  <input
                    type="date"
                    className="form-control sf-input"
                    value={settings.predict_from_date}
                    onChange={e => setSettings(p => ({ ...p, predict_from_date: e.target.value }))}
                  />
                  <div className="text-muted small mt-1">Leave blank = 10 years ago</div>
                </div>
                <div className="col-6">
                  <label className="form-label sf-label">To Date</label>
                  <input
                    type="date"
                    className="form-control sf-input"
                    value={settings.predict_to_date}
                    onChange={e => setSettings(p => ({ ...p, predict_to_date: e.target.value }))}
                  />
                  <div className="text-muted small mt-1">Leave blank = today</div>
                </div>
              </div>

              {settings.predict_from_date && (
                <div className="mt-3 p-2 rounded" style={{ background: "rgba(77,159,255,0.08)", border: "1px solid rgba(77,159,255,0.2)" }}>
                  <i className="bi bi-info-circle me-2 text-primary"></i>
                  <span className="small">
                    Prediction will use data from <strong>{settings.predict_from_date}</strong>
                    {" "}to <strong>{settings.predict_to_date || "today"}</strong>
                  </span>
                </div>
              )}

              <button
                className="btn sf-btn-primary mt-3"
                onClick={() => setSettings(p => ({ ...p, predict_from_date: "", predict_to_date: "" }))}
                style={{ marginRight: 8 }}
              >
                <i className="bi bi-arrow-counterclockwise me-1"></i>Reset to Default
              </button>
            </div>
          </div>

          {/* ── Trade Defaults ── */}
          <div className="col-lg-6">
            <div className="sf-section-card">
              <h5 className="sf-section-title mb-1">
                <i className="bi bi-sliders me-2"></i>Trade Defaults
              </h5>
              <p className="text-muted small mb-4">
                These values will be pre-filled when you add a new trade.
              </p>

              <div className="row g-3">
                <div className="col-6">
                  <label className="form-label sf-label">Default Exchange</label>
                  <select
                    className="form-select sf-input"
                    value={settings.default_exchange}
                    onChange={e => setSettings(p => ({ ...p, default_exchange: e.target.value }))}
                  >
                    {["NSE","BSE","MCX","NFO","BFO"].map(ex => (
                      <option key={ex} value={ex}>{ex}</option>
                    ))}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label sf-label">Default Segment</label>
                  <select
                    className="form-select sf-input"
                    value={settings.default_segment}
                    onChange={e => setSettings(p => ({ ...p, default_segment: e.target.value }))}
                  >
                    <option value="equity">Equity (Stock)</option>
                    <option value="futures">Futures</option>
                    <option value="ce">Call Option (CE)</option>
                    <option value="pe">Put Option (PE)</option>
                    <option value="mf">Mutual Fund</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ── Save button (full row) ── */}
          <div className="col-12 d-flex justify-content-end">
            <button className="btn sf-btn-primary px-4" onClick={saveSettings} disabled={saving}>
              {saving
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>
                : <><i className="bi bi-floppy me-2"></i>Save Settings</>}
            </button>
          </div>

          {/* ── Brokers ── */}
          <div className="col-12">
            <div className="sf-section-card">
              <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                <div>
                  <h5 className="sf-section-title mb-1">
                    <i className="bi bi-building me-2"></i>Brokers
                  </h5>
                  <p className="text-muted small mb-0">
                    Add your broker accounts. You can then select a broker when logging trades
                    and filter your positions and history by broker.
                  </p>
                </div>
                <button
                  className="btn sf-btn-primary"
                  onClick={() => { setShowBrokerForm(p => !p); setError(""); }}
                >
                  <i className={`bi bi-${showBrokerForm ? "x" : "plus-circle"} me-1`}></i>
                  {showBrokerForm ? "Cancel" : "Add Broker"}
                </button>
              </div>

              {/* Add broker form */}
              {showBrokerForm && (
                <div className="p-3 rounded mb-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="row g-3 align-items-end">
                    <div className="col-md-4">
                      <label className="form-label sf-label">Broker Name <span className="text-danger">*</span></label>
                      <input
                        type="text"
                        className="form-control sf-input"
                        placeholder="e.g. Zerodha, Groww, Upstox"
                        value={brokerForm.name}
                        onChange={e => setBrokerForm(p => ({ ...p, name: e.target.value }))}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label sf-label">Account ID (optional)</label>
                      <input
                        type="text"
                        className="form-control sf-input"
                        placeholder="e.g. ZR1234"
                        value={brokerForm.account_id}
                        onChange={e => setBrokerForm(p => ({ ...p, account_id: e.target.value }))}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label sf-label">Notes (optional)</label>
                      <input
                        type="text"
                        className="form-control sf-input"
                        placeholder="Any notes..."
                        value={brokerForm.notes}
                        onChange={e => setBrokerForm(p => ({ ...p, notes: e.target.value }))}
                      />
                    </div>
                    <div className="col-md-2">
                      <button
                        className="btn sf-btn-primary w-100"
                        onClick={addBroker}
                        disabled={addingBroker || !brokerForm.name.trim()}
                      >
                        {addingBroker
                          ? <span className="spinner-border spinner-border-sm"></span>
                          : <><i className="bi bi-plus-lg me-1"></i>Add</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Brokers list */}
              {brokers.length === 0 ? (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-building" style={{ fontSize: "2rem", opacity: 0.3 }}></i>
                  <p className="mt-2 mb-0 small">No brokers added yet.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table sf-table mb-0">
                    <thead>
                      <tr>
                        <th>Broker</th>
                        <th>Account ID</th>
                        <th>Trades</th>
                        <th>Notes</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brokers.map(b => (
                        <tr key={b.id} className="sf-table-row">
                          <td>
                            <span className="sf-symbol">{b.name}</span>
                          </td>
                          <td className="text-muted small">{b.account_id || "—"}</td>
                          <td>
                            <span className="badge" style={{ background: "rgba(77,159,255,0.15)", color: "#4d9fff" }}>
                              {b.trade_count} trades
                            </span>
                          </td>
                          <td className="text-muted small">{b.notes || "—"}</td>
                          <td>
                            <span className={`badge ${b.is_active ? "bg-success" : "bg-secondary"}`}>
                              {b.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            <div className="d-flex gap-2">
                              <button
                                className="btn btn-sm sf-btn-outline"
                                onClick={() => toggleBroker(b)}
                                title={b.is_active ? "Deactivate" : "Activate"}
                              >
                                <i className={`bi bi-${b.is_active ? "pause" : "play"}`}></i>
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => deleteBroker(b.id)}
                                title="Delete"
                                disabled={b.trade_count > 0}
                              >
                                <i className="bi bi-trash"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default Settings;
