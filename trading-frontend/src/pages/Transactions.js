import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import API from "../services/api";

const Transactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    type: "deposit",
    amount: "",
    note: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState("");
  const [filterType, setFilterType] = useState("");

  const fetchTransactions = () => {
    setLoading(true);
    const params = {};
    if (filterType) params.type = filterType;
    API.get("transactions/", { params })
      .then((r) => setTransactions(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTransactions(); }, [filterType]);

  const handleChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setSuccess("");
    try {
      await API.post("transactions/", {
        ...form,
        amount: parseFloat(form.amount),
      });
      setSuccess(`${form.type === "deposit" ? "Deposit" : "Withdrawal"} of ₹${form.amount} recorded!`);
      setForm({ type: "deposit", amount: "", note: "", date: new Date().toISOString().split("T")[0] });
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

  const totalDeposit = transactions.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
  const totalWithdraw = transactions.filter(t => t.type === "withdraw").reduce((s, t) => s + t.amount, 0);
  const net = totalDeposit - totalWithdraw;

  return (
    <>
      <Navbar />
      <div className="container-fluid px-4 py-4 sf-page">
        <div className="sf-page-header mb-4">
          <h2 className="sf-page-title">Transactions</h2>
          <p className="sf-page-subtitle">Manage deposits and withdrawals</p>
        </div>

        <div className="row g-4">
          {/* Left: Form */}
          <div className="col-lg-4">
            <div className="sf-form-card">
              <h6 className="sf-section-title mb-3">
                <i className="bi bi-plus-circle me-2"></i>New Transaction
              </h6>

              {success && <div className="alert alert-success py-2 small mb-3">{success}</div>}

              <form onSubmit={handleSubmit}>
                {/* Type toggle */}
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

                <div className="mb-3">
                  <label className="form-label sf-label">Amount (₹) <span className="text-danger">*</span></label>
                  <input type="number" name="amount" className="form-control sf-input"
                    placeholder="0.00" value={form.amount} onChange={handleChange}
                    step="0.01" min="0.01" required />
                  {errors.amount && <div className="text-danger small mt-1">{errors.amount[0]}</div>}
                </div>

                <div className="mb-3">
                  <label className="form-label sf-label">Date <span className="text-danger">*</span></label>
                  <input type="date" name="date" className="form-control sf-input"
                    value={form.date} onChange={handleChange} required />
                </div>

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

            {/* Summary cards */}
            <div className="row g-3 mt-1">
              <div className="col-12">
                <div className="sf-stat-card sf-stat-success">
                  <div className="sf-stat-icon">💰</div>
                  <div className="sf-stat-body">
                    <div className="sf-stat-label">Total Deposits</div>
                    <div className="sf-stat-value text-success">₹{Number(totalDeposit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>
              <div className="col-12">
                <div className="sf-stat-card sf-stat-danger">
                  <div className="sf-stat-icon">💸</div>
                  <div className="sf-stat-body">
                    <div className="sf-stat-label">Total Withdrawals</div>
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

          {/* Right: History */}
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
                <h5>No transactions yet</h5>
                <p className="text-muted">Add your first deposit to get started.</p>
              </div>
            )}

            {!loading && transactions.length > 0 && (
              <div className="sf-table-wrap">
                <table className="table sf-table mb-0">
                  <thead>
                    <tr>
                      <th>Type</th><th>Date</th><th>Amount</th><th>Note</th><th></th>
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
