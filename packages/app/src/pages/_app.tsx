import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import '../../public/globals.css';
import '../../public/variable.css';
import './temporary.css';
import { Logger } from '@toeverything/pathfinder-logger';
import '@fontsource/space-mono';
import '@fontsource/poppins';
import '../utils/print-build-info';
import ProviderComposer from '@/components/provider-composer';
import type { ReactElement, ReactNode } from 'react';
import type { NextPage } from 'next';

const ThemeProvider = dynamic(() => import('@/providers/themeProvider'), {
  ssr: false,
});

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

function MyApp({ Component, pageProps }: AppPropsWithLayout) {
  const getLayout = Component.getLayout || (page => page);

  return (
    <>
      <Logger />
      <ProviderComposer contexts={[<ThemeProvider key="ThemeProvider" />]}>
        {getLayout(<Component {...pageProps} />)}
      </ProviderComposer>
    </>
  );
}

export default MyApp;
