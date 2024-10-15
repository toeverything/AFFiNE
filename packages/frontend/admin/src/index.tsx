import './global.css';
import './setup';

import { createRoot } from 'react-dom/client';

import { App } from './app';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById('app')!).render(<App />);
