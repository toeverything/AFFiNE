import '../styles/globals.css';

import { AppProps } from 'next/app';
import { ReactElement, Suspense, useMemo } from 'react';
import { SWRConfig } from 'swr';

import { ProviderComposer } from '../components/ProviderComposer';
import { PageLoading } from '../components/pure/loading';
import { ModalProvider } from '../providers/ModalProvider';
import { ThemeProvider } from '../providers/ThemeProvider';
import { fetcher, NextPageWithLayout } from '../shared';

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const EmptyLayout = (page: ReactElement) => page;

function App({ Component }: AppPropsWithLayout) {
  const getLayout = Component.getLayout || EmptyLayout;
  return (
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
  );
}

export default App;
