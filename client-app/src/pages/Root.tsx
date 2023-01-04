import { Outlet } from 'react-router-dom';
import { TitleBar } from '../components/TitleBar.js';

export function RootLayout() {
  return (
    <>
      <TitleBar />
      <Outlet />
    </>
  );
}
