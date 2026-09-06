import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker is registered relative to the document — but never from
// the Home Assistant ingress path. A worker installed there lives on HA's own
// origin, is scoped to /api/hassio_ingress/<token>/, shares storage with the HA
// frontend and orphans itself the moment that token changes. Offline support
// and push belong to the bare port (or a real HTTPS origin), not to ingress.
const onIngress = window.location.pathname.startsWith('/api/hassio_ingress/');
if ('serviceWorker' in navigator && window.isSecureContext && !onIngress) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {
      // A missing or blocked service worker costs offline support, nothing more.
    });
  });
}
