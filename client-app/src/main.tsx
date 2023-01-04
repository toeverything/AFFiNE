import '@emotion/react';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './pages/routes.js';
import './main.css';

const root = document.querySelector('#react-root');
if (root !== null) {
  ReactDOM.createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
}
