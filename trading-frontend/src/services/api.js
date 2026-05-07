import axios from "axios";

// In production (Vercel), use the Render backend.
// In local dev (localhost), use the local Django server.
const BASE_URL =
  process.env.REACT_APP_API_URL ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000/api/"
    : "https://stockfolio-xv8x.onrender.com/api/");

const API = axios.create({ baseURL: BASE_URL });

API.interceptors.request.use((req) => {
  const token = localStorage.getItem("token");
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

export default API;
