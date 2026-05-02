import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

const Navbar = () => {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="navbar navbar-expand-lg sticky-top sf-navbar">
      <div className="container-fluid px-4">
        {/* Brand */}
        <Link className="navbar-brand sf-brand" to="/dashboard">
          <span className="sf-brand-icon">📈</span>
          <span className="sf-brand-text">Stock<span className="sf-brand-accent">folio</span></span>
        </Link>

        {/* Mobile toggle */}
        <button
          className="navbar-toggler border-0"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#sfNavbar"
          aria-expanded="false"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        {/* Links */}
        <div className="collapse navbar-collapse" id="sfNavbar">
          <ul className="navbar-nav me-auto ms-4 gap-1">
            <li className="nav-item">
              <Link
                className={`nav-link sf-nav-link ${isActive("/dashboard") ? "active" : ""}`}
                to="/dashboard"
              >
                <i className="bi bi-speedometer2 me-1"></i> Dashboard
              </Link>
            </li>
            <li className="nav-item">
              <Link
                className={`nav-link sf-nav-link ${isActive("/trades") ? "active" : ""}`}
                to="/trades"
              >
                <i className="bi bi-bar-chart-line me-1"></i> Trades
              </Link>
            </li>
            <li className="nav-item">
              <Link
                className={`nav-link sf-nav-link ${isActive("/add-trade") ? "active" : ""}`}
                to="/add-trade"
              >
                <i className="bi bi-plus-circle me-1"></i> Add Trade
              </Link>
            </li>
          </ul>

          {/* Right controls */}
          <div className="d-flex align-items-center gap-3">
            {/* Theme Toggle */}
            <button
              className="btn sf-theme-toggle"
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <><i className="bi bi-sun-fill me-1"></i> Light</>
              ) : (
                <><i className="bi bi-moon-fill me-1"></i> Dark</>
              )}
            </button>

            {/* Logout */}
            <button className="btn sf-logout-btn" onClick={handleLogout}>
              <i className="bi bi-box-arrow-right me-1"></i> Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
