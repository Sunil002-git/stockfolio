import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../services/api";

const STEPS = { EMAIL: 'email', OTP: 'otp', PASSWORD: 'password', DONE: 'done' };

const ForgotPassword = () => {
  const [step, setStep]       = useState(STEPS.EMAIL);
  const [email, setEmail]     = useState("");
  const [otp, setOtp]         = useState("");
  const [newPsw, setNewPsw]   = useState("");
  const [newPsw2, setNewPsw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [info, setInfo]       = useState("");
  const navigate = useNavigate();

  const sendOTP = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      await API.post("otp/send/", { email, purpose: "forgot_password" });
      setInfo(`OTP sent to ${email}`);
      setStep(STEPS.OTP);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to send OTP.");
    } finally { setLoading(false); }
  };

  const verifyOTP = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      await API.post("otp/verify/", { email, code: otp, purpose: "forgot_password" });
      setStep(STEPS.PASSWORD);
    } catch (err) {
      setError(err.response?.data?.error || "Invalid OTP.");
    } finally { setLoading(false); }
  };

  const resetPassword = async (e) => {
    e.preventDefault(); setError("");
    if (newPsw !== newPsw2) { setError("Passwords do not match."); return; }
    if (newPsw.length < 8)  { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      await API.post("password/reset/", { email, otp_code: otp, new_password: newPsw });
      setStep(STEPS.DONE);
    } catch (err) {
      setError(err.response?.data?.error || "Reset failed.");
    } finally { setLoading(false); }
  };

  const stepNum = { [STEPS.EMAIL]:1, [STEPS.OTP]:2, [STEPS.PASSWORD]:3, [STEPS.DONE]:3 };

  if (step === STEPS.DONE) return (
    <div className="sf-auth-page">
      <div className="sf-auth-card" style={{ textAlign:"center" }}>
        <div style={{ fontSize:"3rem" }}>🔐</div>
        <h4 className="mt-3">Password Reset!</h4>
        <p className="text-muted">Your password has been updated. You can now sign in.</p>
        <button className="btn sf-btn-primary w-100 mt-2" onClick={() => navigate("/")}>
          <i className="bi bi-box-arrow-in-right me-2"></i>Go to Sign In
        </button>
      </div>
    </div>
  );

  return (
    <div className="sf-auth-page">
      <div className="sf-auth-card">
        <div className="sf-auth-logo">
          <span className="sf-auth-logo-icon">🔑</span>
          <h1 className="sf-auth-brand">Stock<span className="sf-brand-accent">folio</span></h1>
          <p className="sf-auth-tagline">Reset your password</p>
        </div>

        {/* Step dots */}
        <div className="d-flex justify-content-center gap-2 mb-4">
          {[1,2,3].map(n => (
            <div key={n} style={{
              width:10, height:10, borderRadius:"50%",
              background: n <= stepNum[step] ? "#4d9fff" : "rgba(255,255,255,0.15)",
              transition:"background 0.2s",
            }}/>
          ))}
        </div>

        {error && <div className="alert alert-danger py-2 small mb-3"><i className="bi bi-exclamation-circle me-2"></i>{error}</div>}
        {info  && <div className="alert alert-info  py-2 small mb-3"><i className="bi bi-info-circle me-2"></i>{info}</div>}

        {/* Step 1 — Email */}
        {step === STEPS.EMAIL && (
          <form onSubmit={sendOTP}>
            <p className="text-muted small mb-3">Enter your registered email and we'll send you a reset OTP.</p>
            <div className="mb-4">
              <label className="form-label sf-label">Email</label>
              <div className="input-group sf-input-group">
                <span className="input-group-text sf-input-icon"><i className="bi bi-envelope"></i></span>
                <input type="email" className="form-control sf-input" placeholder="your@email.com"
                  value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
            </div>
            <button type="submit" className="btn sf-btn-primary w-100" disabled={loading}>
              {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Sending...</>
                       : <><i className="bi bi-send me-2"></i>Send OTP</>}
            </button>
          </form>
        )}

        {/* Step 2 — OTP */}
        {step === STEPS.OTP && (
          <form onSubmit={verifyOTP}>
            <div className="text-center mb-4">
              <div style={{ fontSize:"2.2rem" }}>📧</div>
              <p className="text-muted small mt-2">Enter the OTP sent to <strong>{email}</strong></p>
            </div>
            <div className="mb-4">
              <input type="text" className="form-control sf-input text-center"
                style={{ fontSize:"2rem", fontWeight:700, letterSpacing:"12px" }}
                placeholder="• • • • • •" maxLength={6}
                value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))} required />
            </div>
            <button type="submit" className="btn sf-btn-primary w-100" disabled={loading || otp.length !== 6}>
              {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Verifying...</>
                       : <><i className="bi bi-shield-check me-2"></i>Verify OTP</>}
            </button>
            <div className="text-center mt-3">
              <button type="button" className="btn btn-link sf-auth-link p-0 small"
                onClick={() => setStep(STEPS.EMAIL)}>← Back</button>
            </div>
          </form>
        )}

        {/* Step 3 — New password */}
        {step === STEPS.PASSWORD && (
          <form onSubmit={resetPassword}>
            <p className="text-muted small mb-3">OTP verified. Set your new password.</p>
            <div className="mb-3">
              <label className="form-label sf-label">New Password</label>
              <div className="input-group sf-input-group">
                <span className="input-group-text sf-input-icon"><i className="bi bi-lock"></i></span>
                <input type="password" className="form-control sf-input" placeholder="New password (min 8 chars)"
                  value={newPsw} onChange={e => setNewPsw(e.target.value)} required />
              </div>
            </div>
            <div className="mb-4">
              <label className="form-label sf-label">Confirm New Password</label>
              <div className="input-group sf-input-group">
                <span className="input-group-text sf-input-icon"><i className="bi bi-lock-fill"></i></span>
                <input type="password" className="form-control sf-input" placeholder="Repeat new password"
                  value={newPsw2} onChange={e => setNewPsw2(e.target.value)} required />
              </div>
            </div>
            <button type="submit" className="btn sf-btn-primary w-100" disabled={loading}>
              {loading ? <><span className="spinner-border spinner-border-sm me-2"></span>Resetting...</>
                       : <><i className="bi bi-key me-2"></i>Reset Password</>}
            </button>
          </form>
        )}

        <div className="sf-auth-footer">
          <Link to="/" className="sf-auth-link">← Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
