import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../services/api";

const Login = () => {
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await API.post("login/", form);
      localStorage.setItem("token", res.data.access);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sf-auth-page">
      <div className="sf-auth-card">
        {/* Logo */}
        <div className="sf-auth-logo">
          <span className="sf-auth-logo-icon">📈</span>
          <h1 className="sf-auth-brand">
            Stock<span className="sf-brand-accent">folio</span>
          </h1>
          <p className="sf-auth-tagline">Your personal trading journal</p>
        </div>

        <form onSubmit={handleLogin}>
          {error && (
            <div className="alert alert-danger py-2 small" role="alert">
              <i className="bi bi-exclamation-circle me-2"></i>{error}
            </div>
          )}

          <div className="mb-3">
            <label className="form-label sf-label">Username</label>
            <div className="input-group sf-input-group">
              <span className="input-group-text sf-input-icon">
                <i className="bi bi-person"></i>
              </span>
              <input
                type="text"
                name="username"
                className="form-control sf-input"
                placeholder="Enter your username"
                value={form.username}
                onChange={handleChange}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="form-label sf-label">Password</label>
            <div className="input-group sf-input-group">
              <span className="input-group-text sf-input-icon">
                <i className="bi bi-lock"></i>
              </span>
              <input
                type="password"
                name="password"
                className="form-control sf-input"
                placeholder="Enter your password"
                value={form.password}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn sf-btn-primary w-100"
            disabled={loading}
          >
            {loading ? (
              <><span className="spinner-border spinner-border-sm me-2"></span>Signing in...</>
            ) : (
              <><i className="bi bi-box-arrow-in-right me-2"></i>Sign In</>
            )}
          </button>
        </form>

        <div className="sf-auth-footer">
          Don't have an account?{" "}
          <Link to="/register" className="sf-auth-link">
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
