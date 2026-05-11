import axios from "axios";

const BASE_URL =
  process.env.REACT_APP_API_URL ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000/api/"
    : "https://stockfolio-xv8x.onrender.com/api/");

const API = axios.create({ baseURL: BASE_URL });

// ── Helpers ──────────────────────────────────────────────────────────────────
const clearSession = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("is_superuser");
  window.location.href = "/";
};

let isRefreshing = false;
let failedQueue  = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token));
  failedQueue = [];
};

// ── Request interceptor: attach access token ─────────────────────────────────
API.interceptors.request.use((req) => {
  const token = localStorage.getItem("token");
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

// ── Response interceptor: silent refresh on 401 ──────────────────────────────
API.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    // 403 = account deactivated — hard logout
    if (err.response?.status === 403 &&
        err.response?.data?.error?.includes('deactivated')) {
      alert(err.response.data.error);
      clearSession();
      return Promise.reject(err);
    }

    // 401 on a non-refresh endpoint = try to refresh
    if (err.response?.status === 401 && !original._retry &&
        !original.url?.includes('token/refresh') &&
        !original.url?.includes('login')) {

      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`;
          return API(original);
        }).catch(e => Promise.reject(e));
      }

      original._retry  = true;
      isRefreshing     = true;

      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) { clearSession(); return Promise.reject(err); }

      try {
        const res = await axios.post(`${BASE_URL}token/refresh/`, { refresh: refreshToken });
        const newToken = res.data.access;
        localStorage.setItem("token", newToken);
        API.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return API(original);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        clearSession();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);

export default API;
