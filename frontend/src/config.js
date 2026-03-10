// Central API URL — set VITE_API_URL in frontend/.env for production
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
export default API_URL;
