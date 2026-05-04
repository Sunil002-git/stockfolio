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

  const navLinks = [
    { to: "/dashboard",    icon: "speedometer2",  label: "Dashboard" },
    { to: "/positions",    icon: "layers",         label: "Positions" },
    { to: "/add-trade",    icon: "plus-circle",    label: "Add Buy" },
    { to: "/history",      icon: "clock-history",  label: "History" },
    { to: "/transactions", icon: "bank",           label: "Funds" },
    { to: "/analytics",    icon: "bar-chart-line", label: "Analytics" },
  ];

  return (
    <nav className="navbar navbar-expand-lg sticky-top sf-navbar">
      <div className="container-fluid px-4">
        <Link className="navbar-brand sf-brand" to="/dashboard">
          <span className="sf-brand-icon">📈</span>
          <span className="sf-brand-text">
            Stock<span className="sf-brand-accent">folio</span>
          </span>
        </Link>

        <button
          className="navbar-toggler border-0"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#sfNavbar"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="sfNavbar">
          <ul className="navbar-nav me-auto ms-4 gap-1">
            {navLinks.map((link) => (
              <li className="nav-item" key={link.to}>
                <Link
                  className={`nav-link sf-nav-link ${isActive(link.to) ? "active" : ""}`}
                  to={link.to}
                >
                  <i className={`bi bi-${link.icon} me-1`}></i>{link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="d-flex align-items-center gap-3">
            <button className="btn sf-theme-toggle" onClick={toggleTheme}>
              {theme === "dark"
                ? <><i className="bi bi-sun-fill me-1"></i>Light</>
                : <><i className="bi bi-moon-fill me-1"></i>Dark</>}
            </button>
            <button className="btn sf-logout-btn" onClick={handleLogout}>
              <i className="bi bi-box-arrow-right me-1"></i>Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
