import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ensurePWAStarted } from './pwa';
import { PwaUpdateNotice } from './ui/PwaUpdateNotice';
import { clearRetiredLocalTelemetry } from './storage/hybrid';

// Keep this deployment's origin for relative API requests and browser storage.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// Запускаем регистрацию SW как можно раньше, не дожидаясь рендера всего дерева.
clearRetiredLocalTelemetry();
void ensurePWAStarted();

// React 18 root
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
    <PwaUpdateNotice />
  </React.StrictMode>
);
