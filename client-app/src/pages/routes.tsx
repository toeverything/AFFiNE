import { createBrowserRouter } from 'react-router-dom';
import { AffineBasicPage, AffineDevPage } from './AFFiNE/index.js';
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
  {
    path: '/affine-dev',
    name: 'AFFiNE Dev',
    element: <AffineDevPage />,
  },
];
export const router = createBrowserRouter([
  { path: '/', element: <RootLayout />, children: routes },
]);
