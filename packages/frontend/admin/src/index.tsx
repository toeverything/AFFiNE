import './global.css';
import './setup';

import { createRoot } from 'react-dom/client';

import { App } from './app';

// oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById('app')!).render(<App />);
