import React, { useEffect, useState, useCallback } from "react";
import Navbar from "../components/Navbar";
import API from "../services/api";
import { useBroker, BrokerSelector } from "../context/BrokerContext";

const Transactions = () => {
  const { brokers, brokerParam, activeBroker } = useBroker();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [form, setForm] = useState({
    type: "deposit", amount: "", note: "",
    date: new Date().toISOString().split("T")[0],
    broker_id: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]         = useState({});
  const [success, setSuccess]       = useState("");
  const [filterType, setFilterType] = useState("");

  const fetchTransactions = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filterType)  params.type   = filterType;
    if (brokerParam) params.broker = brokerParam;
    API.get("transactions/", { params })
      .then((r) => setTransactions(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterType, brokerParam]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const handleChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setErrors({}); setSuccess("");
    const payload = { ...form, amount: parseFloat(form.amount) };
    if (!payload.broker_id) delete payload.broker_id;
    try {
      await API.post("transactions/", payload);
      setSuccess(`${form.type === "deposit" ? "Deposit" : "Withdrawal"} of ₹${form.amount} recorded!`);
      setForm({ type: "deposit", amount: "", note: "", date: new Date().toISOString().split("T")[0], broker_id: "" });
      fetchTransactions();
    } catch (err) {
      setErrors(err.response?.data || {});
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this transaction?")) return;
    await API.delete(`transactions/${id}/`);
    fetchTransactions();
  };

  const totalDeposit  = transactions.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
  const totalWithdraw = transactions.filter(t => t.type === "withdraw").reduce((s, t) => s + t.amount, 0);
  const net = totalDeposit - totalWithdraw;

  const activeBrokerName = activeBroker === "all"
    ? null : brokers.find(b => String(b.id) === activeBroker)?.name;

  return (
    <>
      <Navbar />
      <div className="container-fluid px-4 py-4 sf-page">
        <div className="sf-page-header mb-3">
          <div>
            <h2 className="sf-page-title mb-0">Transactions</h2>
            <p className="sf-page-subtitle mb-0">
              Manage deposits and withdrawals
              {activeBrokerName && (
                <span className="ms-2">
                  — <span className="sf-broker-tag-inline">{activeBrokerName}</span>
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Broker selector */}
        <BrokerSelector className="mb-4" />

        <div className="row g-4">
          {/* ── Form ── */}
          <div className="col-lg-4">
            <div className="sf-form-card">
              <h6 className="sf-section-title mb-3">
                <i className="bi bi-plus-circle me-2"></i>New Transaction
              </h6>

              {success && <div className="alert alert-success py-2 small mb-3">{success}</div>}

              <form onSubmit={handleSubmit}>
                {/* Type */}
                <div className="mb-3">
                  <label className="form-label sf-label">Type</label>
                  <div className="d-flex gap-2">
                    <button type="button"
                      className={`btn flex-fill sf-type-btn ${form.type === "deposit" ? "sf-type-buy-active" : "sf-type-inactive"}`}
                      onClick={() => setForm(p => ({ ...p, type: "deposit" }))}>
                      <i className="bi bi-arrow-down-circle me-1"></i> Deposit
                    </button>
                    <button type="button"
                      className={`btn flex-fill sf-type-btn ${form.type === "withdraw" ? "sf-type-sell-active" : "sf-type-inactive"}`}
                      onClick={() => setForm(p => ({ ...p, type: "withdraw" }))}>
                      <i className="bi bi-arrow-up-circle me-1"></i> Withdraw
                    </button>
                  </div>
                </div>

                {/* Amount */}
                <div className="mb-3">
                  <label className="form-label sf-label">Amount (₹) <span className="text-danger">*</span></label>
                  <input type="number" name="amount" className="form-control sf-input"
                    placeholder="0.00" value={form.amount} onChange={handleChange}
                    step="0.01" min="0.01" required />
                  {errors.amount && <div className="text-danger small mt-1">{errors.amount[0]}</div>}
                </div>

                {/* Date */}
                <div className="mb-3">
                  <label className="form-label sf-label">Date <span className="text-danger">*</span></label>
                  <input type="date" name="date" className="form-control sf-input"
                    value={form.date} onChange={handleChange} required />
                </div>

                {/* Broker */}
                {brokers.length > 0 && (
                  <div className="mb-3">
                    <label className="form-label sf-label">Broker</label>
                    <select name="broker_id" className="form-select sf-input"
                      value={form.broker_id} onChange={handleChange}>
                      <option value="">— No Broker —</option>
                      {brokers.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name}{b.account_id ? ` (${b.account_id})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Note */}
                <div className="mb-4">
                  <label className="form-label sf-label">Note</label>
                  <input type="text" name="note" className="form-control sf-input"
                    placeholder="e.g. Monthly top-up, profits withdrawal..."
                    value={form.note} onChange={handleChange} />
                </div>

                <button type="submit" className="btn sf-btn-primary w-100" disabled={submitting}>
                  {submitting
                    ? <><span className="spinner-border spinner-border-sm me-2"></span>Processing...</>
                    : <><i className={`bi bi-${form.type === "deposit" ? "arrow-down" : "arrow-up"}-circle me-2`}></i>
                        Add {form.type === "deposit" ? "Deposit" : "Withdrawal"}</>}
                </button>
              </form>
            </div>

            {/* Summary */}
            <div className="row g-3 mt-1">
              <div className="col-12">
                <div className="sf-stat-card sf-stat-success">
                  <div className="sf-stat-icon">💰</div>
                  <div className="sf-stat-body">
                    <div className="sf-stat-label">Total Deposits{activeBrokerName ? ` · ${activeBrokerName}` : ""}</div>
                    <div className="sf-stat-value text-success">₹{Number(totalDeposit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>
              <div className="col-12">
                <div className="sf-stat-card sf-stat-danger">
                  <div className="sf-stat-icon">💸</div>
                  <div className="sf-stat-body">
                    <div className="sf-stat-label">Total Withdrawals{activeBrokerName ? ` · ${activeBrokerName}` : ""}</div>
                    <div className="sf-stat-value text-danger">₹{Number(totalWithdraw).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>
              <div className="col-12">
                <div className={`sf-stat-card ${net >= 0 ? "sf-stat-primary" : "sf-stat-danger"}`}>
                  <div className="sf-stat-icon">🏦</div>
                  <div className="sf-stat-body">
                    <div className="sf-stat-label">Net Balance</div>
                    <div className={`sf-stat-value ${net >= 0 ? "" : "text-danger"}`}>₹{Number(net).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── History ── */}
          <div className="col-lg-8">
            <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
              <h6 className="sf-section-title mb-0">Transaction History</h6>
              <select className="form-select sf-input" style={{ width: "160px" }}
                value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">All</option>
                <option value="deposit">Deposits only</option>
                <option value="withdraw">Withdrawals only</option>
              </select>
            </div>

            {loading && <div className="text-center py-4"><div className="spinner-border sf-spinner"></div></div>}

            {!loading && transactions.length === 0 && (
              <div className="sf-empty-state">
                <div className="sf-empty-icon">🏦</div>
                <h5>No transactions{activeBrokerName ? ` for ${activeBrokerName}` : ""}</h5>
                <p className="text-muted">
                  {activeBrokerName
                    ? "Try switching to \"All Brokers\" or add a transaction for this broker."
                    : "Add your first deposit to get started."}
                </p>
              </div>
            )}

            {!loading && transactions.length > 0 && (
              <div className="sf-table-wrap">
                <table className="table sf-table mb-0">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Broker</th>
                      <th>Note</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((txn) => (
                      <tr key={txn.id} className="sf-table-row">
                        <td>
                          <span className={`sf-type-tag ${txn.type === "deposit" ? "sf-type-buy" : "sf-type-sell"}`}>
                            {txn.type === "deposit" ? "↓ DEPOSIT" : "↑ WITHDRAW"}
                          </span>
                        </td>
                        <td className="sf-date-cell">{txn.date}</td>
                        <td>
                          <span className={txn.type === "deposit" ? "sf-profit" : "sf-loss"}>
                            {txn.type === "deposit" ? "+" : "−"}₹{Number(txn.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td>
                          {txn.broker_name
                            ? <span className="sf-broker-tag"><i className="bi bi-building me-1"></i>{txn.broker_name}</span>
                            : <span className="text-muted small">—</span>}
                        </td>
                        <td className="text-muted small">{txn.note || "—"}</td>
                        <td>
                          <button className="btn btn-sm sf-delete-btn" onClick={() => handleDelete(txn.id)}>
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
        </div>
      </div>
    </>
  );
};

export default Transactions;
