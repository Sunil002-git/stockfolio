import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../services/api";

const STEPS = { FORM: 'form', OTP: 'otp', DONE: 'done' };

const Register = () => {
  const [step, setStep]       = useState(STEPS.FORM);
  const [form, setForm]       = useState({ username:"", email:"", first_name:"", last_name:"", password:"", password2:"" });
  const [otp, setOtp]         = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors]   = useState({});
  const [info, setInfo]       = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // Step 1 — send OTP to email
  const handleSendOTP = async (e) => {
    e.preventDefault();
    setErrors({}); setInfo("");
    if (form.password !== form.password2) {
      setErrors({ password2: ["Passwords do not match."] }); return;
    }
    if (!form.email) { setErrors({ email: ["Email is required for verification."] }); return; }
    setLoading(true);
    try {
      await API.post("otp/send/", { email: form.email, purpose: "register" });
      setInfo(`A 6-digit OTP has been sent to ${form.email}`);
      setStep(STEPS.OTP);
    } catch (err) {
      setErrors(err.response?.data || { non_field_errors: ["Failed to send OTP. Try again."] });
    } finally { setLoading(false); }
  };

  // Step 2 — submit OTP + full form
  const handleVerifyAndRegister = async (e) => {
    e.preventDefault();
    setErrors({}); setLoading(true);
    try {
      await API.post("register/otp/", { ...form, otp_code: otp });
      setStep(STEPS.DONE);
    } catch (err) {
      setErrors(err.response?.data || { non_field_errors: ["Verification failed. Try again."] });
    } finally { setLoading(false); }
  };

  const resendOTP = async () => {
    setLoading(true);
    try {
      await API.post("otp/send/", { email: form.email, purpose: "register" });
      setInfo("New OTP sent!");
    } catch { setInfo("Failed to resend."); }
    finally { setLoading(false); }
  };

  const fieldErr = (f) => errors[f]
    ? <div className="text-danger small mt-1">{Array.isArray(errors[f]) ? errors[f][0] : errors[f]}</div>
    : null;

  if (step === STEPS.DONE) return (
    <div className="sf-auth-page">
      <div className="sf-auth-card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: "3rem" }}>✅</div>
        <h4 className="mt-3">Account Created!</h4>
        <p className="text-muted">Your email has been verified and your account is ready.</p>
        <button className="btn sf-btn-primary w-100 mt-2" onClick={() => navigate("/")}>
          <i className="bi bi-box-arrow-in-right me-2"></i>Go to Sign In
        </button>
      </div>
    </div>
  );

  return (
    <div className="sf-auth-page">
      <div className="sf-auth-card sf-auth-card-wide">
        <div className="sf-auth-logo">
          <span className="sf-auth-logo-icon">📈</span>
          <h1 className="sf-auth-brand">Stock<span className="sf-brand-accent">folio</span></h1>
          <p className="sf-auth-tagline">
            {step === STEPS.FORM ? "Create your account" : "Verify your email"}
          </p>
        </div>

        {/* Step indicator */}
        <div className="d-flex align-items-center justify-content-center gap-3 mb-4">
          {[{n:1,label:"Details"},{n:2,label:"Verify Email"}].map(({n,label}) => (
            <div key={n} className="d-flex align-items-center gap-2">
              <div style={{
                width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center",
                justifyContent:"center", fontWeight:600, fontSize:"0.8rem",
                background: (step===STEPS.FORM && n===1) || (step===STEPS.OTP && n===2)
                  ? "#4d9fff" : n < (step===STEPS.OTP ? 2 : 1) ? "#22c55e" : "rgba(255,255,255,0.1)",
                color: "white",
              }}>
                {n < (step===STEPS.OTP ? 2 : 1) ? "✓" : n}
              </div>
              <span className="small text-muted">{label}</span>
            </div>
          ))}
        </div>

        {errors.non_field_errors && (
          <div className="alert alert-danger py-2 small mb-3">
            <i className="bi bi-exclamation-circle me-2"></i>{errors.non_field_errors[0]}
          </div>
        )}
        {errors.error && (
          <div className="alert alert-danger py-2 small mb-3">
            <i className="bi bi-exclamation-circle me-2"></i>{errors.error}
          </div>
        )}
        {info && <div className="alert alert-info py-2 small mb-3"><i className="bi bi-info-circle me-2"></i>{info}</div>}

        {/* ── STEP 1: Form ── */}
        {step === STEPS.FORM && (
          <form onSubmit={handleSendOTP}>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label sf-label">First Name</label>
                <input type="text" name="first_name" className="form-control sf-input"
                  placeholder="First name" value={form.first_name} onChange={handleChange} />
                {fieldErr("first_name")}
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label sf-label">Last Name</label>
                <input type="text" name="last_name" className="form-control sf-input"
                  placeholder="Last name" value={form.last_name} onChange={handleChange} />
                {fieldErr("last_name")}
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label sf-label">Username <span className="text-danger">*</span></label>
              <div className="input-group sf-input-group">
                <span className="input-group-text sf-input-icon"><i className="bi bi-person"></i></span>
                <input type="text" name="username" className="form-control sf-input"
                  placeholder="Choose a username" value={form.username} onChange={handleChange} required />
              </div>
              {fieldErr("username")}
            </div>
            <div className="mb-3">
              <label className="form-label sf-label">Email <span className="text-danger">*</span></label>
              <div className="input-group sf-input-group">
                <span className="input-group-text sf-input-icon"><i className="bi bi-envelope"></i></span>
                <input type="email" name="email" className="form-control sf-input"
                  placeholder="your@email.com" value={form.email} onChange={handleChange} required />
              </div>
              {fieldErr("email")}
            </div>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label sf-label">Password <span className="text-danger">*</span></label>
                <div className="input-group sf-input-group">
                  <span className="input-group-text sf-input-icon"><i className="bi bi-lock"></i></span>
                  <input type="password" name="password" className="form-control sf-input"
                    placeholder="Create password" value={form.password} onChange={handleChange} required />
                </div>
                {fieldErr("password")}
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label sf-label">Confirm Password <span className="text-danger">*</span></label>
                <div className="input-group sf-input-group">
                  <span className="input-group-text sf-input-icon"><i className="bi bi-lock-fill"></i></span>
                  <input type="password" name="password2" className="form-control sf-input"
                    placeholder="Confirm password" value={form.password2} onChange={handleChange} required />
                </div>
                {fieldErr("password2")}
              </div>
            </div>
            <button type="submit" className="btn sf-btn-primary w-100 mt-2" disabled={loading}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Sending OTP...</>
                : <><i className="bi bi-envelope-check me-2"></i>Send Verification OTP</>}
            </button>
          </form>
        )}

        {/* ── STEP 2: OTP ── */}
        {step === STEPS.OTP && (
          <form onSubmit={handleVerifyAndRegister}>
            <div className="text-center mb-4">
              <div style={{ fontSize:"2.5rem" }}>📧</div>
              <p className="text-muted mt-2 mb-0">
                Enter the 6-digit OTP sent to<br/>
                <strong>{form.email}</strong>
              </p>
            </div>

            <div className="mb-4">
              <label className="form-label sf-label text-center d-block">OTP Code</label>
              <input
                type="text" className="form-control sf-input text-center"
                style={{ fontSize:"2rem", fontWeight:700, letterSpacing:"12px" }}
                placeholder="• • • • • •" maxLength={6}
                value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))}
                required
              />
              {fieldErr("error")}
              {fieldErr("non_field_errors")}
            </div>

            <button type="submit" className="btn sf-btn-primary w-100" disabled={loading || otp.length !== 6}>
              {loading
                ? <><span className="spinner-border spinner-border-sm me-2"></span>Verifying...</>
                : <><i className="bi bi-shield-check me-2"></i>Verify & Create Account</>}
            </button>

            <div className="text-center mt-3">
              <button type="button" className="btn btn-link sf-auth-link p-0 small"
                onClick={() => setStep(STEPS.FORM)}>← Back to form</button>
              <span className="text-muted mx-2">·</span>
              <button type="button" className="btn btn-link sf-auth-link p-0 small"
                onClick={resendOTP} disabled={loading}>Resend OTP</button>
            </div>
          </form>
        )}

        <div className="sf-auth-footer">
          Already have an account?{" "}
          <Link to="/" className="sf-auth-link">Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
