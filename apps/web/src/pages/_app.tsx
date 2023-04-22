import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';

import { config, setupGlobal } from '@affine/env';
import { createI18n, I18nextProvider } from '@affine/i18n';
import { rootStore } from '@affine/workspace/atom';
import type { EmotionCache } from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import type { EventBasedChannel } from 'async-call-rpc';
import { AsyncCall } from 'async-call-rpc';
import { Provider } from 'jotai';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { PropsWithChildren, ReactElement } from 'react';
import React, { lazy, Suspense, useEffect, useMemo } from 'react';

import { AffineErrorBoundary } from '../components/affine/affine-error-eoundary';
import { ProviderComposer } from '../components/provider-composer';
import { PageLoading } from '../components/pure/loading';
import { MessageCenter } from '../components/pure/message-center';
import { ThemeProvider } from '../providers/ThemeProvider';
import type { NextPageWithLayout } from '../shared';
import createEmotionCache from '../utils/create-emotion-cache';

setupGlobal();

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const EmptyLayout = (page: ReactElement) => page;

const clientSideEmotionCache = createEmotionCache();

const DevTools = lazy(() =>
  import('jotai-devtools').then(m => ({ default: m.DevTools }))
);

export class MessagePortWebChannel implements EventBasedChannel {
  #port: MessagePort | null = null;
  constructor() {}

  #callbackCache = new Set<(data: unknown) => void>();
  #dataCache: unknown[] = [];

  get port(): MessagePort | null {
    return this.#port;
  }

  set port(port: MessagePort | null) {
    if (this.#callbackCache.size > 0) {
      this.#callbackCache.forEach(callback => {
        port!.addEventListener('message', callback);
      });
      this.#callbackCache.clear();
    }
    if (this.#dataCache.length > 0) {
      this.#dataCache.forEach(data => {
        this.port!.postMessage(data);
      });
      this.#dataCache = [];
    }
    this.#port = port;
    this.#port!.start();
  }

  on(listener: (data: unknown) => void) {
    const handlePort = (event: MessageEvent) => {
      listener(event.data);
    };
    if (!this.port) {
      this.#callbackCache.add(listener);
      return () => {
        if (this.#callbackCache.has(listener)) {
          this.#callbackCache.delete(listener);
        } else {
          this.port!.removeEventListener('message', handlePort);
          this.port!.close();
        }
      };
    }
    this.port.addEventListener('message', handlePort);
    this.port.start();
    return () => {
      this.port!.removeEventListener('message', handlePort);
      this.port!.close();
    };
  }

  send(data: unknown): void {
    if (!this.port) {
      this.#dataCache.push(data);
      return;
    }
    this.port.postMessage(data);
  }
}

const channel = new MessagePortWebChannel();
// todo: type support
// @ts-expect-error
globalThis.rpc = AsyncCall(
  {},
  {
    channel,
  }
);

if (typeof window !== 'undefined') {
  console.log('register');
  window.addEventListener('message', event => {
    if (event.source === window && event.data === 'main-world-port') {
      const [port] = event.ports;
      channel.port = port;
    }
  });
}

const DebugProvider = ({ children }: PropsWithChildren): ReactElement => {
  return (
    <>
      <Suspense>{process.env.DEBUG_JOTAI === 'true' && <DevTools />}</Suspense>
      {children}
    </>
  );
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
        <MessageCenter />
        <AffineErrorBoundary router={useRouter()}>
          <Suspense fallback={<PageLoading key="RootPageLoading" />}>
            <ProviderComposer
              contexts={useMemo(
                () =>
                  [
                    <Provider key="JotaiProvider" store={rootStore} />,
                    <DebugProvider key="DebugProvider" />,
                    <ThemeProvider key="ThemeProvider" />,
                  ].filter(Boolean),
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
