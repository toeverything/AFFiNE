import './setup';

import { apis, events } from '@affine/electron-api';
import { createI18n, setUpLanguage } from '@affine/i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';

function loadLanguage() {
  const i18n = createI18n();
  document.documentElement.lang = i18n.language;

  setUpLanguage(i18n).catch(console.error);
}

async function main() {
  const handleMaximized = (maximized: boolean | undefined) => {
    document.documentElement.dataset.maximized = String(maximized);
  };
  const handleFullscreen = (fullscreen: boolean | undefined) => {
    document.documentElement.dataset.fullscreen = String(fullscreen);
  };
  const handleActive = (active: boolean | undefined) => {
    document.documentElement.dataset.active = String(active);
  };

  apis?.ui.isMaximized().then(handleMaximized).catch(console.error);
  apis?.ui.isFullScreen().then(handleFullscreen).catch(console.error);
  events?.ui.onMaximized(handleMaximized);
  events?.ui.onFullScreen(handleFullscreen);
  events?.ui.onTabShellViewActiveChange(handleActive);

  loadLanguage();
  mountApp();
}

function mountApp() {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('Root element not found');
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

main().catch(console.error);
