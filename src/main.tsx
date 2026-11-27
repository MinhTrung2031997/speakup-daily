import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ConfirmHost from './components/ConfirmDialog';
import { AuthGate } from './lib/auth';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
    <ConfirmHost />
  </React.StrictMode>,
);

// Service worker for reminder notifications (push + tap to open Today's plan).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
