import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import API from "../services/api";

const Profile = () => {
  const [profile, setProfile] = useState(null);
  const [form, setForm]       = useState({ first_name:"", last_name:"", email:"", phone:"" });
  const [psw, setPsw]         = useState({ current_password:"", new_password:"", confirm:"" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [savingPsw, setSavingPsw] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError]     = useState("");
  const [pswError, setPswError] = useState("");
  const [pswSuccess, setPswSuccess] = useState("");

  useEffect(() => {
    API.get("profile/").then(r => {
      setProfile(r.data);
      setForm({ first_name: r.data.first_name, last_name: r.data.last_name,
                email: r.data.email, phone: r.data.phone || "" });
    }).finally(() => setLoading(false));
  }, []);

  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const handlePswChange = e => setPsw(p => ({ ...p, [e.target.name]: e.target.value }));

  const saveProfile = async (e) => {
    e.preventDefault(); setSaving(true); setSuccess(""); setError("");
    try {
      const r = await API.patch("profile/", form);
      setProfile(p => ({ ...p, ...r.data }));
      setSuccess("Profile updated successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update profile.");
    } finally { setSaving(false); }
  };

  const savePassword = async (e) => {
    e.preventDefault(); setPswError(""); setPswSuccess("");
    if (psw.new_password !== psw.confirm) { setPswError("Passwords do not match."); return; }
    if (psw.new_password.length < 8)      { setPswError("Password must be at least 8 characters."); return; }
    setSavingPsw(true);
    try {
      await API.patch("profile/", {
        current_password: psw.current_password,
        new_password:     psw.new_password,
      });
      setPswSuccess("Password changed! Please sign in again with your new password.");
      setPsw({ current_password:"", new_password:"", confirm:"" });
    } catch (err) {
      setPswError(err.response?.data?.error || "Failed to change password.");
    } finally { setSavingPsw(false); }
  };

  if (loading) return (
    <><Navbar />
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
          <h2 className="sf-page-title">Profile</h2>
          <p className="sf-page-subtitle">Manage your personal information and account security</p>
        </div>

        <div className="row g-4">
          {/* ── Profile Info ── */}
          <div className="col-lg-6">
            <div className="sf-section-card">
              {/* Avatar */}
              <div className="d-flex align-items-center gap-3 mb-4 pb-3"
                   style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
                <div style={{
                  width:64, height:64, borderRadius:"50%",
                  background:"linear-gradient(135deg,#4d9fff,#a78bfa)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:"1.6rem", fontWeight:700, color:"white", flexShrink:0
                }}>
                  {(profile?.first_name?.[0] || profile?.username?.[0] || "U").toUpperCase()}
                </div>
                <div>
                  <div className="sf-symbol">{profile?.first_name} {profile?.last_name}</div>
                  <div className="text-muted small">@{profile?.username}</div>
                  <div className="d-flex gap-2 mt-1">
                    <span className={`badge ${profile?.is_verified ? "bg-success" : "bg-warning text-dark"}`}>
                      <i className={`bi bi-${profile?.is_verified ? "patch-check" : "exclamation-circle"} me-1`}></i>
                      {profile?.is_verified ? "Verified" : "Unverified"}
                    </span>
                    <span className="badge bg-secondary">
                      Joined {profile?.date_joined}
                    </span>
                  </div>
                </div>
              </div>

              <h6 className="sf-section-title mb-3">
                <i className="bi bi-person-gear me-2"></i>Personal Information
              </h6>

              {success && <div className="alert alert-success py-2 small mb-3">{success}</div>}
              {error   && <div className="alert alert-danger  py-2 small mb-3">{error}</div>}

              <form onSubmit={saveProfile}>
                <div className="row g-3 mb-3">
                  <div className="col-6">
                    <label className="form-label sf-label">First Name</label>
                    <input type="text" name="first_name" className="form-control sf-input"
                      value={form.first_name} onChange={handleChange} placeholder="First name" />
                  </div>
                  <div className="col-6">
                    <label className="form-label sf-label">Last Name</label>
                    <input type="text" name="last_name" className="form-control sf-input"
                      value={form.last_name} onChange={handleChange} placeholder="Last name" />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label sf-label">Email</label>
                  <div className="input-group sf-input-group">
                    <span className="input-group-text sf-input-icon"><i className="bi bi-envelope"></i></span>
                    <input type="email" name="email" className="form-control sf-input"
                      value={form.email} onChange={handleChange} placeholder="your@email.com" />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="form-label sf-label">Phone</label>
                  <div className="input-group sf-input-group">
                    <span className="input-group-text sf-input-icon"><i className="bi bi-phone"></i></span>
                    <input type="tel" name="phone" className="form-control sf-input"
                      value={form.phone} onChange={handleChange} placeholder="+91 98765 43210" />
                  </div>
                </div>
                <button type="submit" className="btn sf-btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>
                           : <><i className="bi bi-floppy me-2"></i>Save Changes</>}
                </button>
              </form>
            </div>
          </div>

          {/* ── Change Password ── */}
          <div className="col-lg-6">
            <div className="sf-section-card">
              <h6 className="sf-section-title mb-3">
                <i className="bi bi-shield-lock me-2"></i>Change Password
              </h6>

              {pswSuccess && <div className="alert alert-success py-2 small mb-3">{pswSuccess}</div>}
              {pswError   && <div className="alert alert-danger  py-2 small mb-3">{pswError}</div>}

              <form onSubmit={savePassword}>
                <div className="mb-3">
                  <label className="form-label sf-label">Current Password</label>
                  <div className="input-group sf-input-group">
                    <span className="input-group-text sf-input-icon"><i className="bi bi-lock"></i></span>
                    <input type="password" name="current_password" className="form-control sf-input"
                      value={psw.current_password} onChange={handlePswChange}
                      placeholder="Enter current password" required />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label sf-label">New Password</label>
                  <div className="input-group sf-input-group">
                    <span className="input-group-text sf-input-icon"><i className="bi bi-lock-fill"></i></span>
                    <input type="password" name="new_password" className="form-control sf-input"
                      value={psw.new_password} onChange={handlePswChange}
                      placeholder="New password (min 8 chars)" required />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="form-label sf-label">Confirm New Password</label>
                  <div className="input-group sf-input-group">
                    <span className="input-group-text sf-input-icon"><i className="bi bi-lock-fill"></i></span>
                    <input type="password" name="confirm" className="form-control sf-input"
                      value={psw.confirm} onChange={handlePswChange}
                      placeholder="Repeat new password" required />
                  </div>
                </div>
                <button type="submit" className="btn sf-btn-primary" disabled={savingPsw}>
                  {savingPsw ? <><span className="spinner-border spinner-border-sm me-2"></span>Changing...</>
                              : <><i className="bi bi-key me-2"></i>Change Password</>}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Profile;
