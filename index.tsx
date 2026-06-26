import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initPWA } from './pwa';

const CANONICAL_APP_HOST = 'fitfocus.pages.dev';
const isPreviewPagesHost =
  typeof window !== 'undefined' &&
  window.location.hostname.endsWith('.pages.dev') &&
  window.location.hostname !== CANONICAL_APP_HOST;

if (isPreviewPagesHost) {
  const target = new URL(window.location.href);
  target.protocol = 'https:';
  target.host = CANONICAL_APP_HOST;
  window.location.replace(target.toString());
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// Запускаем регистрацию SW как можно раньше, не дожидаясь рендера всего дерева.
void initPWA();

// React 18 root
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
