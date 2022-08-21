import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './app/i18n';

import App from './app';

const container = document.getElementById('root');
if (!container) {
    throw new Error('No root container found');
}
const root = createRoot(container);
root.render(
    <StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </StrictMode>
);
