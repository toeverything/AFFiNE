import '../styles/globals.css';

import { config, setupGlobal } from '@affine/env';
import { createI18n, I18nextProvider } from '@affine/i18n';
import type { EmotionCache } from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { Provider } from 'jotai';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { ReactElement } from 'react';
import React, { Suspense, useEffect, useMemo } from 'react';

import { jotaiStore } from '../atoms';
import { AffineErrorBoundary } from '../components/affine/affine-error-eoundary';
import { ProviderComposer } from '../components/provider-composer';
import { PageLoading } from '../components/pure/loading';
import { MessageCenter } from '../components/pure/message-center';
import { AffineSWRConfigProvider } from '../providers/AffineSWRConfigProvider';
import { ThemeProvider } from '../providers/ThemeProvider';
import type { NextPageWithLayout } from '../shared';
import createEmotionCache from '../utils/create-emotion-cache';

setupGlobal();

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const EmptyLayout = (page: ReactElement) => page;

const clientSideEmotionCache = createEmotionCache();

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
        <MessageCenter />
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
              <Head>
                <title>AFFiNE</title>
                <meta
                  name="viewport"
                  content="initial-scale=1, width=device-width"
                />
              </Head>
              {getLayout(<Component {...pageProps} />)}
            </ProviderComposer>
          </Suspense>
        </AffineErrorBoundary>
      </I18nextProvider>
    </CacheProvider>
  );
};

export default App;
