import '../styles/globals.css';

import { useTranslation } from '@affine/i18n';
import { useAtomsDebugValue } from 'jotai-devtools';
import { AppProps } from 'next/app';
import Head from 'next/head';
import React, { ReactElement, Suspense, useEffect, useMemo } from 'react';
import { SWRConfig } from 'swr';

import { ProviderComposer } from '../components/provider-composer';
import { PageLoading } from '../components/pure/loading';
import { ModalProvider } from '../providers/ModalProvider';
import { ThemeProvider } from '../providers/ThemeProvider';
import { fetcher, NextPageWithLayout } from '../shared';
import { config } from '../shared/env';

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const EmptyLayout = (page: ReactElement) => page;

const DebugAtoms = () => {
  useAtomsDebugValue();
  return null;
};

function App({ Component }: AppPropsWithLayout) {
  const getLayout = Component.getLayout || EmptyLayout;
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  if (process.env.NODE_ENV === 'development') {
    // I know what I'm doing
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      console.log('Runtime Preset', config);
    }, []);
  }

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
      <DebugAtoms />
      <SWRConfig
        value={{
          suspense: true,
          fetcher,
        }}
      >
        <Suspense fallback={<PageLoading />}>
          <ProviderComposer
            contexts={useMemo(
              () => [
                <ThemeProvider key="ThemeProvider" />,
                <ModalProvider key="ModalProvider" />,
              ],
              []
            )}
          >
            {getLayout(<Component />)}
          </ProviderComposer>
        </Suspense>
      </SWRConfig>
    </>
  );
}

export default App;
