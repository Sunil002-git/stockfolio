import React, { useEffect, useState, useCallback } from "react";
import Navbar from "../components/Navbar";
import API from "../services/api";

const AdminUsers = () => {
  const [data, setData]         = useState({ users: [], total: 0, active: 0, inactive: 0 });
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionMsg, setActionMsg]       = useState({ type: "", text: "" });
  const [confirmDelete, setConfirmDelete] = useState(null); // user object to confirm

  const fetchUsers = useCallback(() => {
    setLoading(true);
    const params = {};
    if (search)       params.search = search;
    if (statusFilter) params.status = statusFilter;
    API.get("admin/users/", { params })
      .then(r => setData(r.data))
      .catch(() => setActionMsg({ type: "danger", text: "Failed to load users." }))
      .finally(() => setLoading(false));
  }, [search, statusFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const flash = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg({ type: "", text: "" }), 4000);
  };

  const toggleActive = async (user) => {
    try {
      await API.patch(`admin/users/${user.id}/`, { is_active: !user.is_active });
      flash("success", `${user.username} ${!user.is_active ? "activated" : "deactivated"}.`);
      fetchUsers();
    } catch (e) {
      flash("danger", e.response?.data?.error || "Action failed.");
    }
  };

  const toggleStaff = async (user) => {
    try {
      await API.patch(`admin/users/${user.id}/`, { is_staff: !user.is_staff });
      flash("success", `${user.username} staff status updated.`);
      fetchUsers();
    } catch (e) {
      flash("danger", e.response?.data?.error || "Action failed.");
    }
  };

  const deleteUser = async (user) => {
    try {
      await API.delete(`admin/users/${user.id}/`);
      flash("success", `User ${user.username} deleted permanently.`);
      setConfirmDelete(null);
      fetchUsers();
    } catch (e) {
      flash("danger", e.response?.data?.error || "Delete failed.");
      setConfirmDelete(null);
    }
  };

  const initials = (u) =>
    ((u.first_name?.[0] || "") + (u.last_name?.[0] || "") || u.username[0]).toUpperCase();

  return (
    <>
      <Navbar />
      <div className="container-fluid px-4 py-4 sf-page">

        {/* Header */}
        <div className="sf-page-header mb-4">
          <div>
            <h2 className="sf-page-title">User Management</h2>
            <p className="sf-page-subtitle">View, activate, deactivate or remove registered users</p>
          </div>
        </div>

        {/* Stats */}
        <div className="row g-3 mb-4">
          {[
            { label: "Total Users",    value: data.total,    icon: "people",          color: "primary" },
            { label: "Active",         value: data.active,   icon: "person-check",    color: "success" },
            { label: "Inactive",       value: data.inactive, icon: "person-dash",     color: "danger"  },
          ].map(s => (
            <div className="col-sm-4" key={s.label}>
              <div className={`sf-stat-card sf-stat-${s.color}`}>
                <div className="sf-stat-icon"><i className={`bi bi-${s.icon}`}></i></div>
                <div className="sf-stat-body">
                  <div className="sf-stat-label">{s.label}</div>
                  <div className="sf-stat-value" style={{ fontSize: "1.6rem" }}>{s.value}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {actionMsg.text && (
          <div className={`alert alert-${actionMsg.type} py-2 mb-3`}>
            <i className={`bi bi-${actionMsg.type === "success" ? "check-circle" : "exclamation-triangle"} me-2`}></i>
            {actionMsg.text}
          </div>
        )}

        {/* Filters */}
        <div className="sf-filter-bar mb-4">
          <div className="row g-2 align-items-center">
            <div className="col-md-5">
              <div className="input-group sf-input-group">
                <span className="input-group-text sf-input-icon"><i className="bi bi-search"></i></span>
                <input
                  type="text" className="form-control sf-input"
                  placeholder="Search by name, username or email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button className="btn sf-btn-ghost" onClick={() => setSearch("")}>
                    <i className="bi bi-x"></i>
                  </button>
                )}
              </div>
            </div>
            <div className="col-md-3">
              <select className="form-select sf-input" value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Users</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>
            <div className="col-md-2">
              <button className="btn sf-btn-ghost w-100" onClick={fetchUsers}>
                <i className="bi bi-arrow-clockwise me-1"></i>Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border sf-spinner"></div>
            <p className="mt-3 sf-loading-text">Loading users...</p>
          </div>
        ) : data.users.length === 0 ? (
          <div className="sf-empty-state">
            <div className="sf-empty-icon">👥</div>
            <h5>No users found</h5>
          </div>
        ) : (
          <div className="sf-section-card p-0">
            <div className="table-responsive">
              <table className="table sf-table mb-0">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Joined</th>
                    <th>Last Login</th>
                    <th>Trades</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map(u => (
                    <tr key={u.id} className={`sf-table-row ${!u.is_active ? "sf-row-inactive" : ""}`}>
                      {/* Avatar + name */}
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <div style={{
                            width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                            background: u.is_superuser
                              ? "linear-gradient(135deg,#f59e0b,#ef4444)"
                              : u.is_active
                                ? "linear-gradient(135deg,#4d9fff,#a78bfa)"
                                : "rgba(255,255,255,0.1)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.8rem", fontWeight: 700, color: "white",
                          }}>
                            {initials(u)}
                          </div>
                          <div>
                            <div className="sf-symbol" style={{ fontSize: "0.85rem" }}>
                              {u.first_name || u.last_name
                                ? `${u.first_name} ${u.last_name}`.trim()
                                : u.username}
                            </div>
                            <div className="text-muted" style={{ fontSize: "0.72rem" }}>@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-muted small">{u.email || "—"}</td>
                      <td className="text-muted small">{u.phone || "—"}</td>
                      <td className="sf-date-cell">{u.date_joined}</td>
                      <td className="sf-date-cell">{u.last_login || "Never"}</td>
                      <td>
                        <span className="badge" style={{ background: "rgba(77,159,255,0.15)", color: "#4d9fff" }}>
                          {u.trade_count}
                        </span>
                      </td>
                      {/* Role */}
                      <td>
                        {u.is_superuser ? (
                          <span className="badge bg-warning text-dark">
                            <i className="bi bi-shield-fill me-1"></i>Superuser
                          </span>
                        ) : u.is_staff ? (
                          <span className="badge bg-info text-dark">
                            <i className="bi bi-person-gear me-1"></i>Staff
                          </span>
                        ) : (
                          <span className="badge bg-secondary">User</span>
                        )}
                      </td>
                      {/* Status */}
                      <td>
                        <span className={`badge ${u.is_active ? "bg-success" : "bg-danger"}`}>
                          <i className={`bi bi-${u.is_active ? "check-circle" : "x-circle"} me-1`}></i>
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {/* Actions */}
                      <td>
                        {u.is_superuser ? (
                          <span className="text-muted small">Protected</span>
                        ) : (
                          <div className="d-flex gap-1 flex-wrap">
                            {/* Activate / Deactivate */}
                            <button
                              className={`btn btn-sm ${u.is_active ? "btn-outline-warning" : "btn-outline-success"}`}
                              onClick={() => toggleActive(u)}
                              title={u.is_active ? "Deactivate user" : "Activate user"}
                            >
                              <i className={`bi bi-${u.is_active ? "pause-circle" : "play-circle"}`}></i>
                              <span className="ms-1 d-none d-xl-inline">
                                {u.is_active ? "Deactivate" : "Activate"}
                              </span>
                            </button>
                            {/* Staff toggle */}
                            <button
                              className="btn btn-sm btn-outline-info"
                              onClick={() => toggleStaff(u)}
                              title={u.is_staff ? "Remove staff" : "Make staff"}
                            >
                              <i className={`bi bi-${u.is_staff ? "person-dash" : "person-gear"}`}></i>
                              <span className="ms-1 d-none d-xl-inline">
                                {u.is_staff ? "Remove Staff" : "Make Staff"}
                              </span>
                            </button>
                            {/* Delete */}
                            <button
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => setConfirmDelete(u)}
                              title="Delete user permanently"
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Delete confirmation modal */}
        {confirmDelete && (
          <div className="sf-modal-overlay" onClick={() => setConfirmDelete(null)}>
            <div className="sf-modal-box" onClick={e => e.stopPropagation()}>
              <div className="text-center mb-3" style={{ fontSize: "2.5rem" }}>⚠️</div>
              <h5 className="text-center mb-2">Delete User?</h5>
              <p className="text-muted text-center small mb-4">
                This will permanently delete <strong>@{confirmDelete.username}</strong> and
                all their trades, positions, and transactions. This cannot be undone.
              </p>
              <div className="d-flex gap-2">
                <button className="btn sf-btn-ghost flex-fill"
                  onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger flex-fill"
                  onClick={() => deleteUser(confirmDelete)}>
                  <i className="bi bi-trash me-2"></i>Delete Permanently
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default AdminUsers;
