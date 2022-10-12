import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import '../../public/globals.css';

const ThemeProvider = dynamic(() => import('@/styles/themeProvider'), {
  ssr: false,
});

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <Component {...pageProps} />
    </ThemeProvider>
  );
}

export default MyApp;
