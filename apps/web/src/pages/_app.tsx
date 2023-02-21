import '../../public/globals.css';
import './temporary.css';
import '@fontsource/space-mono';
import '@fontsource/poppins';
import '../utils/print-build-info';
import '@affine/i18n';

import { useTranslation } from '@affine/i18n';
import { DataCenterPreloader } from '@affine/store';
import { Logger } from '@toeverything/pathfinder-logger';
import type { NextPage } from 'next';
import type { AppProps } from 'next/app';
import Head from 'next/head';
// import AppStateProvider2 from '@/providers/app-state-provider2/provider';
import type { ReactElement, ReactNode } from 'react';
import { Suspense } from 'react';
import React from 'react';

import { PageLoading } from '@/components/loading';
import { MessageCenterHandler } from '@/components/message-center-handler';
import ProviderComposer from '@/components/provider-composer';
import ConfirmProvider from '@/providers/ConfirmProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { GlobalAppProvider } from '@/store/app';
import { ModalProvider } from '@/store/globalModal';

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
          <GlobalAppProvider key="GlobalAppProvider" />,
          <ThemeProvider key="ThemeProvider" />,
          <ModalProvider key="ModalProvider" />,
          <ConfirmProvider key="ConfirmProvider" />,
        ]}
      >
        <Suspense fallback={<PageLoading />}>
          <DataCenterPreloader>
            <MessageCenterHandler>
              {getLayout(<Component {...pageProps} />)}
            </MessageCenterHandler>
          </DataCenterPreloader>
        </Suspense>
      </ProviderComposer>
    </>
  );
};

export default App;
