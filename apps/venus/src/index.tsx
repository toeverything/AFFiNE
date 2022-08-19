import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app';
import './app/i18n/lang';

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
