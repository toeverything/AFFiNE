/* eslint-disable filename-rules/match */
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { ThemeProvider } from '@toeverything/components/ui';
import { FeatureFlagsProvider } from '@toeverything/datasource/feature-flags';

import './custom-formatter';
import { LigoVirgoRoutes } from './pages';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
    throw new Error('No root container found');
}
const root = createRoot(container);
root.render(
    <BrowserRouter>
        <ThemeProvider>
            <FeatureFlagsProvider>
                <LigoVirgoRoutes />
            </FeatureFlagsProvider>
        </ThemeProvider>
    </BrowserRouter>
);
