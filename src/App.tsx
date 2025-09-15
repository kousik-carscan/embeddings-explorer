// import React from 'react';
import { useAuth, AuthProvider } from './auth';
import Login from './components/Login';
import Explorer from './pages/Explorer';

function AppInner() {
  const { token } = useAuth();
  return token ? <Explorer /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}