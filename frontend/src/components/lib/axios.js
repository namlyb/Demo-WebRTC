import axios from "axios";

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    "Content-Type": "application/json"
  },
  withCredentials: false
});

// Interceptor (optional - chuẩn production)
instance.interceptors.response.use(
  response => response,
  error => {
    console.error("API Error:", error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default instance;