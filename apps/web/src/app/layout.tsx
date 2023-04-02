import '../styles/global.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Sidebar } from '../components/sidebar';

export const metadata: Metadata = {
  title: 'AFFiNE',
  description: 'AFFiNE',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body id="affine">
        <Sidebar />
        <main className="affine-main">{children}</main>
      </body>
    </html>
  );
}
