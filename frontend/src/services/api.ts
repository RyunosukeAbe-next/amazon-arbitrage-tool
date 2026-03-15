import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api', // バックエンドAPIのベースURL
});

// リクエストインターセプターを設定
api.interceptors.request.use(
  (config) => {
    // localStorageからトークンを取得
    const token = localStorage.getItem('authToken');

    if (token) {
      // ヘッダーにトークンを設定
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
