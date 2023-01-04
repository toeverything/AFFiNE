import { createBrowserRouter } from 'react-router-dom';
import { AffineBasicPage } from './AFFiNE/index.js';
import { LandingPage } from './Landing/index.js';
import { RootLayout } from './Root.js';

export const routes = [
  {
    path: '/',
    name: 'Landing Page',
    element: <LandingPage />,
  },
  {
    path: '/affine',
    name: 'AFFiNE Basic',
    element: <AffineBasicPage />,
  },
];
export const router = createBrowserRouter([
  { path: '/', element: <RootLayout />, children: routes },
]);
