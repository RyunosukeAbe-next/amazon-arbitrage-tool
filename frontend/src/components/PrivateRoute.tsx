import React, { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface PrivateRouteProps {
  children: ReactNode;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    // 認証状態をチェック中は何も表示しない（またはローディングスピナーを表示）
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    // 認証されていない場合はログインページにリダイレクト
    return <Navigate to="/login" replace />;
  }

  // 認証されている場合は子コンポーネントをレンダリング
  return <>{children}</>;
};

export default PrivateRoute;
