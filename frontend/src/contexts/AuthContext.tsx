import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

// コンテキストが持つ値の型定義
interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

// コンテキストの作成
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// AuthProvider コンポーネントのPropsの型定義
interface AuthProviderProps {
  children: ReactNode;
}

// 認証状態を提供するプロバイダーコンポーネント
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // アプリケーション起動時にlocalStorageからトークンを読み込む
    try {
      const storedToken = localStorage.getItem('authToken');
      if (storedToken) {
        setToken(storedToken);
      }
    } catch (error) {
      console.error('Failed to load token from localStorage', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = (newToken: string) => {
    setToken(newToken);
    try {
      localStorage.setItem('authToken', newToken);
    } catch (error) {
      console.error('Failed to save token to localStorage', error);
    }
  };

  const logout = () => {
    setToken(null);
    try {
      localStorage.removeItem('authToken');
    } catch (error) {
      console.error('Failed to remove token from localStorage', error);
    }
  };

  const value = {
    token,
    isAuthenticated: !!token,
    loading,
    login,
    logout,
  };

  // loadingが終わるまでは何も表示しないか、スピナーを表示する
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// コンテキストを簡単に利用するためのカスタムフック
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
