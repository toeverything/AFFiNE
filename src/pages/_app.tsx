import type { AppProps } from 'next/app';
import { ThemeProvider } from '@emotion/react';
import { theme } from '../styles';

import '../../public/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider theme={theme}>
      <Component {...pageProps} />
    </ThemeProvider>
  );
}

export default MyApp;
