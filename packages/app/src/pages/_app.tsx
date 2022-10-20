import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import '../../public/globals.css';
import '../../public/variable.css';
import './temporary.css';
import { EditorProvider } from '@/components/editor-provider';
import { ModalProvider } from '@/components/global-modal-provider';

const ThemeProvider = dynamic(() => import('@/styles/themeProvider'), {
  ssr: false,
});

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <ModalProvider>
        <EditorProvider>
          <Component {...pageProps} />
        </EditorProvider>
      </ModalProvider>
    </ThemeProvider>
  );
}

export default MyApp;
