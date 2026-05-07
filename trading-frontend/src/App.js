import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { BrokerProvider } from "./context/BrokerContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Positions from "./pages/Positions";
import AddTrade from "./pages/AddTrade";
import Transactions from "./pages/Transactions";
import Analytics from "./pages/Analytics";
import TradeHistory from "./pages/TradeHistory";
import Predict from "./pages/Predict";
import Settings from "./pages/Settings";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "./styles.css";

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/" replace />;
};

const PublicRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  return token ? <Navigate to="/dashboard" replace /> : children;
};

function App() {
  return (
    <ThemeProvider>
      <BrokerProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/"             element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register"     element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/dashboard"    element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/positions"    element={<PrivateRoute><Positions /></PrivateRoute>} />
            <Route path="/add-trade"    element={<PrivateRoute><AddTrade /></PrivateRoute>} />
            <Route path="/transactions" element={<PrivateRoute><Transactions /></PrivateRoute>} />
            <Route path="/analytics"    element={<PrivateRoute><Analytics /></PrivateRoute>} />
            <Route path="/history"      element={<PrivateRoute><TradeHistory /></PrivateRoute>} />
            <Route path="/predict"      element={<PrivateRoute><Predict /></PrivateRoute>} />
            <Route path="/settings"     element={<PrivateRoute><Settings /></PrivateRoute>} />
            <Route path="*"             element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </BrokerProvider>
    </ThemeProvider>
  );
}

export default App;
