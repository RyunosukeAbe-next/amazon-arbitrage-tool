import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AmazonCallbackPage from './pages/AmazonCallbackPage'; // 新しいインポート
import PrivateRoute from './components/PrivateRoute';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/amazon/callback" element={<AmazonCallbackPage />} />
        <Route path="/api/amazon/callback" element={<AmazonCallbackPage />} /> {/* 追加 */}
        <Route 
          path="/" 
          element={
            <PrivateRoute>
              <DashboardPage />
            </PrivateRoute>
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;
