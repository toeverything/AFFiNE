import type { AppProps } from 'next/app';
import { ThemeProvider } from '@/styles';

import '../../public/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <Component {...pageProps} />
    </ThemeProvider>
  );
}

export default MyApp;
