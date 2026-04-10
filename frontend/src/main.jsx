import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

function syncAppHeight() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${viewportHeight}px`);
}

syncAppHeight();
window.addEventListener('resize', syncAppHeight);
window.visualViewport?.addEventListener('resize', syncAppHeight);

window.addEventListener('error', (event) => {
  console.error('[global-error]', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandled-rejection]', event.reason);
});

try {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (error) {
  console.error('[render-error]', error);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const isNativeCapacitor = window.location.protocol === 'capacitor:';

      if (isNativeCapacitor) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        return;
      }

      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration is optional. App still works without it.
      });
    } catch {
      // Ignore SW API edge-cases on embedded webviews.
    }
  });
}
