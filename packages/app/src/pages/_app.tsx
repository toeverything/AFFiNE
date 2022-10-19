import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import '../../public/globals.css';
import '../../public/variable.css';
import './temporary.css';
import { EditorProvider } from '@/components/editor-provider';
import { Logger } from '@toeverything/pathfinder-logger';

const ThemeProvider = dynamic(() => import('@/styles/themeProvider'), {
  ssr: false,
});

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Logger />
      <ThemeProvider>
        <EditorProvider>
          <Component {...pageProps} />
        </EditorProvider>
      </ThemeProvider>
    </>
  );
}

export default MyApp;
