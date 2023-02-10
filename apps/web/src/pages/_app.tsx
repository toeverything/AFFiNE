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
import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import type { NextPage } from 'next';
import { AppStateProvider } from '@/providers/app-state-provider';
import ConfirmProvider from '@/providers/ConfirmProvider';
import { ModalProvider } from '@/store/globalModal';
// import AppStateProvider2 from '@/providers/app-state-provider2/provider';

import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useAppState } from '@/providers/app-state-provider';
import { PageLoading } from '@/components/loading';
import Head from 'next/head';
import '@affine/i18n';
import { useTranslation } from '@affine/i18n';
import React from 'react';

const ThemeProvider = dynamic(() => import('@/providers/ThemeProvider'), {
  ssr: false,
});

export type NextPageWithLayout<P = Record<string, unknown>, IP = P> = NextPage<
  P,
  IP
> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const App = ({ Component, pageProps }: AppPropsWithLayout) => {
  const getLayout = Component.getLayout || (page => page);
  const { i18n } = useTranslation();

  React.useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <>
      <Head>
        <meta name="theme-color" content="#fafafa" />
        <link rel="manifest" href="/manifest.json" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/icons/apple-touch-icon.png"
        />
        <title>AFFiNE</title>
      </Head>
      <Logger />
      <ProviderComposer
        contexts={[
          <ThemeProvider key="ThemeProvider" />,
          <AppStateProvider key="appStateProvider" />,
          <ModalProvider key="ModalProvider" />,
          <ConfirmProvider key="ConfirmProvider" />,
        ]}
      >
        <AppDefender>{getLayout(<Component {...pageProps} />)}</AppDefender>
      </ProviderComposer>
    </>
  );
};

const AppDefender = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  const { synced } = useAppState();

  useEffect(() => {
    if (['/index.html', '/'].includes(router.asPath)) {
      router.replace('/workspace');
    }
  }, [router]);

  // if you visit /404, you will see the children directly
  if (router.route === '/404') {
    return <div>{children}</div>;
  }

  return <div>{synced ? children : <PageLoading />}</div>;
};

export default App;
