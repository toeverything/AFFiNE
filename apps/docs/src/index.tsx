import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { serve } from 'waku/client';

const App = serve<{ name: string }>('App');
const rootElement = (
  <StrictMode>
    <App name="Waku" />
  </StrictMode>
);

createRoot(document.getElementById('root') as HTMLElement).render(rootElement);
