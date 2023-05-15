// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../electron/layers/preload/preload.d.ts" />

import './index.css';

import { createRoot } from 'react-dom/client';

import { App } from './app';

createRoot(document.getElementById('root')!).render(<App />);
