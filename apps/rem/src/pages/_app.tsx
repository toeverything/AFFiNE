import '../styles/globals.css';

import { useTranslation } from '@affine/i18n';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { useAtomsDebugValue } from 'jotai-devtools';
import { AppProps } from 'next/app';
import React, { memo, ReactElement, Suspense, useEffect, useMemo } from 'react';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { SWRConfig, SWRConfiguration } from 'swr';

import { ProviderComposer } from '../components/provider-composer';
import { PageLoading } from '../components/pure/loading';
import { ModalProvider } from '../providers/ModalProvider';
import { ThemeProvider } from '../providers/ThemeProvider';
import { NextPageWithLayout } from '../shared';
import { config } from '../shared/env';

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const EmptyLayout = (page: ReactElement) => page;

const DebugAtoms = memo(function DebugAtoms() {
  useAtomsDebugValue();
  return null;
});

const helmetContext = {};

const defaultSWRConfig: SWRConfiguration = {
  suspense: true,
  fetcher: () => {
    throw new Error(
      'you might forget to warp your page with AffineSWRConfigProvider'
    );
  },
};

const cache = createCache({ key: 'affine' });

function App({ Component, pageProps }: AppPropsWithLayout) {
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
    <CacheProvider value={cache}>
      <DebugAtoms />
      <SWRConfig value={defaultSWRConfig}>
        <Suspense fallback={<PageLoading key="RootPageLoading" />}>
          <ProviderComposer
            contexts={useMemo(
              () => [
                <ThemeProvider key="ThemeProvider" />,
                <ModalProvider key="ModalProvider" />,
              ],
              []
            )}
          >
            <HelmetProvider key="HelmetProvider" context={helmetContext}>
              <Helmet>
                <title>AFFiNE</title>
              </Helmet>
              {getLayout(<Component {...pageProps} />)}
            </HelmetProvider>
          </ProviderComposer>
        </Suspense>
      </SWRConfig>
    </CacheProvider>
  );
}

export default App;
