import '@blocksuite/editor/themes/affine.css';
import '../styles/globals.css';

import { config, setupGlobal } from '@affine/env';
import { createI18n, I18nextProvider } from '@affine/i18n';
import { EmotionCache } from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { Provider } from 'jotai';
import { useAtomsDebugValue } from 'jotai-devtools';
import { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import React, { memo, ReactElement, Suspense, useEffect, useMemo } from 'react';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { SWRConfig, SWRConfiguration } from 'swr';

import { jotaiStore } from '../atoms';
import { AffineErrorBoundary } from '../components/affine/affine-error-eoundary';
import { ProviderComposer } from '../components/provider-composer';
import { PageLoading } from '../components/pure/loading';
import { AffineSWRConfigProvider } from '../providers/AffineSWRConfigProvider';
import { ThemeProvider } from '../providers/ThemeProvider';
import { NextPageWithLayout } from '../shared';
import createEmotionCache from '../utils/create-emotion-cache';

setupGlobal();

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const EmptyLayout = (page: ReactElement) => page;

const DebugAtoms = memo(function DebugAtoms() {
  useAtomsDebugValue();
  return null;
});

const clientSideEmotionCache = createEmotionCache();
const helmetContext = {};

const defaultSWRConfig: SWRConfiguration = {
  suspense: true,
  fetcher: () => {
    const error = new Error(
      'you might forget to warp your page with AffineSWRConfigProvider'
    );
    console.log(error);
    throw error;
  },
};

const App = function App({
  Component,
  pageProps,
  emotionCache = clientSideEmotionCache,
}: AppPropsWithLayout & {
  emotionCache?: EmotionCache;
}) {
  const getLayout = Component.getLayout || EmptyLayout;
  const i18n = useMemo(() => createI18n(), []);

  if (process.env.NODE_ENV === 'development') {
    // I know what I'm doing
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      console.log('Runtime Preset', config);
    }, []);
  }

  return (
    <CacheProvider value={emotionCache}>
      <I18nextProvider i18n={i18n}>
        <DebugAtoms />
        <SWRConfig value={defaultSWRConfig}>
          <AffineErrorBoundary router={useRouter()}>
            <Suspense fallback={<PageLoading key="RootPageLoading" />}>
              <ProviderComposer
                contexts={useMemo(
                  () => [
                    <AffineSWRConfigProvider key="AffineSWRConfigProvider" />,
                    <Provider key="JotaiProvider" store={jotaiStore} />,
                    <ThemeProvider key="ThemeProvider" />,
                  ],
                  []
                )}
              >
                <HelmetProvider key="HelmetProvider" context={helmetContext}>
                  <Helmet>
                    <title>AFFiNE</title>
                    <meta
                      name="viewport"
                      content="initial-scale=1, width=device-width"
                    />
                  </Helmet>
                  {getLayout(<Component {...pageProps} />)}
                </HelmetProvider>
              </ProviderComposer>
            </Suspense>
          </AffineErrorBoundary>
        </SWRConfig>
      </I18nextProvider>
    </CacheProvider>
  );
};

export default App;
