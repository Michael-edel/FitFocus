import { runStorageMigrations } from './storage/migrations';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initPWA } from './pwa';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// Run local schema migrations BEFORE app mounts
runStorageMigrations();

// React 18 root
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Безопасно: в Google AI Studio ничего не делает, а в Vite (dev/build) регистрирует SW.
void initPWA();
