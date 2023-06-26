import '@blocksuite/editor/themes/affine.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

const root = createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <StrictMode>
    <Router />
  </StrictMode>
);
