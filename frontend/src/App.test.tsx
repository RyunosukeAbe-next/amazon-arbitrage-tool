import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const AuthStateProbe: React.FC = () => {
  const { isAuthenticated } = useAuth();
  return <div>{isAuthenticated ? 'authenticated' : 'unauthenticated'}</div>;
};

test('initializes unauthenticated when no token is stored', async () => {
  localStorage.removeItem('authToken');

  render(
    <AuthProvider>
      <AuthStateProbe />
    </AuthProvider>
  );

  await waitFor(() => {
    expect(screen.getByText('unauthenticated')).toBeInTheDocument();
  });
});
