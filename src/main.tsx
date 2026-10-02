import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/global.css';
import { isFirebaseConfigured } from './lib/firebase';
import App from './App.tsx';
import SetupNeededPage from './pages/SetupNeededPage.tsx';
import { AuthProvider } from './contexts/AuthContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isFirebaseConfigured ? (
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    ) : (
      <SetupNeededPage />
    )}
  </StrictMode>
);
