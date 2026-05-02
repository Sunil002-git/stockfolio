import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../services/api";

const Register = () => {
  const [form, setForm] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    password2: "",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    try {
      await API.post("register/", form);
      navigate("/", { state: { registered: true } });
    } catch (err) {
      if (err.response?.data) {
        setErrors(err.response.data);
      } else {
        setErrors({ non_field_errors: ["Something went wrong. Try again."] });
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
    <div className="sf-auth-page">
      <div className="sf-auth-card sf-auth-card-wide">
        {/* Logo */}
        <div className="sf-auth-logo">
          <span className="sf-auth-logo-icon">📈</span>
          <h1 className="sf-auth-brand">
            Stock<span className="sf-brand-accent">folio</span>
          </h1>
          <p className="sf-auth-tagline">Create your account</p>
        </div>

        <form onSubmit={handleRegister}>
          {errors.non_field_errors && (
            <div className="alert alert-danger py-2 small">
              <i className="bi bi-exclamation-circle me-2"></i>
              {errors.non_field_errors[0]}
            </div>
          )}

          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label sf-label">First Name</label>
              <input
                type="text"
                name="first_name"
                className="form-control sf-input"
                placeholder="First name"
                value={form.first_name}
                onChange={handleChange}
              />
              {fieldError("first_name")}
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label sf-label">Last Name</label>
              <input
                type="text"
                name="last_name"
                className="form-control sf-input"
                placeholder="Last name"
                value={form.last_name}
                onChange={handleChange}
              />
              {fieldError("last_name")}
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label sf-label">Username <span className="text-danger">*</span></label>
            <div className="input-group sf-input-group">
              <span className="input-group-text sf-input-icon">
                <i className="bi bi-person"></i>
              </span>
              <input
                type="text"
                name="username"
                className="form-control sf-input"
                placeholder="Choose a username"
                value={form.username}
                onChange={handleChange}
                required
              />
            </div>
            {fieldError("username")}
          </div>

          <div className="mb-3">
            <label className="form-label sf-label">Email</label>
            <div className="input-group sf-input-group">
              <span className="input-group-text sf-input-icon">
                <i className="bi bi-envelope"></i>
              </span>
              <input
                type="email"
                name="email"
                className="form-control sf-input"
                placeholder="your@email.com"
                value={form.email}
                onChange={handleChange}
              />
            </div>
            {fieldError("email")}
          </div>

          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label sf-label">Password <span className="text-danger">*</span></label>
              <div className="input-group sf-input-group">
                <span className="input-group-text sf-input-icon">
                  <i className="bi bi-lock"></i>
                </span>
                <input
                  type="password"
                  name="password"
                  className="form-control sf-input"
                  placeholder="Create password"
                  value={form.password}
                  onChange={handleChange}
                  required
                />
              </div>
              {fieldError("password")}
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label sf-label">Confirm Password <span className="text-danger">*</span></label>
              <div className="input-group sf-input-group">
                <span className="input-group-text sf-input-icon">
                  <i className="bi bi-lock-fill"></i>
                </span>
                <input
                  type="password"
                  name="password2"
                  className="form-control sf-input"
                  placeholder="Confirm password"
                  value={form.password2}
                  onChange={handleChange}
                  required
                />
              </div>
              {fieldError("password2")}
            </div>
          </div>

          <button
            type="submit"
            className="btn sf-btn-primary w-100 mt-2"
            disabled={loading}
          >
            {loading ? (
              <><span className="spinner-border spinner-border-sm me-2"></span>Creating account...</>
            ) : (
              <><i className="bi bi-person-plus me-2"></i>Create Account</>
            )}
          </button>
        </form>

        <div className="sf-auth-footer">
          Already have an account?{" "}
          <Link to="/" className="sf-auth-link">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
