import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import API from "../services/api";

const BrokerContext = createContext(null);

export const BrokerProvider = ({ children }) => {
  const [brokers, setBrokers]           = useState([]);      // all user brokers
  const [activeBroker, setActiveBroker] = useState("all");   // "all" or broker id string
  const [loading, setLoading]           = useState(true);

  const fetchBrokers = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    API.get("brokers/")
      .then(r => setBrokers(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchBrokers(); }, [fetchBrokers]);

  // brokerParam: what to send as ?broker= query param. undefined = no filter (all)
  const brokerParam = activeBroker === "all" ? undefined : activeBroker;

  return (
    <BrokerContext.Provider value={{ brokers, activeBroker, setActiveBroker, brokerParam, loading, fetchBrokers }}>
      {children}
    </BrokerContext.Provider>
  );
};

export const useBroker = () => useContext(BrokerContext);

/* ── BrokerSelector UI component ─────────────────────────────────────────── */
export const BrokerSelector = ({ className = "" }) => {
  const { brokers, activeBroker, setActiveBroker, loading } = useBroker();

  if (loading || brokers.length === 0) return null;

  return (
    <div className={`sf-broker-selector ${className}`}>
      <i className="bi bi-building me-2 text-muted" style={{ fontSize: "0.85rem" }}></i>
      <div className="d-flex gap-2 flex-wrap align-items-center">
        <button
          className={`sf-broker-pill ${activeBroker === "all" ? "sf-broker-pill-active" : ""}`}
          onClick={() => setActiveBroker("all")}
        >
          All Brokers
        </button>
        {brokers.map(b => (
          <button
            key={b.id}
            className={`sf-broker-pill ${activeBroker === String(b.id) ? "sf-broker-pill-active" : ""}`}
            onClick={() => setActiveBroker(String(b.id))}
          >
            {b.name}
          </button>
        ))}
      </div>
    </div>
  );
};
