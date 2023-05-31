import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { serve } from 'waku/client';

const root = createRoot(document.getElementById('root')!);

const App = serve('App');
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
