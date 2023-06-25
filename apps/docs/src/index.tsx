import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { serve } from 'waku/client';

const App = serve<{ markdown: string }>('App');
const rootElement = (
  <StrictMode>
    <App markdown="" />
  </StrictMode>
);

createRoot(document.getElementById('root') as HTMLElement).render(rootElement);
