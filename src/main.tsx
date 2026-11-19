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
