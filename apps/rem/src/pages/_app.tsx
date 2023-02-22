import '../styles/globals.css';

import { AppProps } from 'next/app';
import { Suspense, useMemo } from 'react';
import { SWRConfig } from 'swr';

import { ProviderComposer } from '../components/ProviderComposer';
import { PageLoading } from '../components/pure/loading';
import { ModalProvider } from '../providers/ModalProvider';
import { ThemeProvider } from '../providers/ThemeProvider';
import { fetcher } from '../shared';

function App({ Component }: AppProps) {
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
          <Component />
        </ProviderComposer>
      </Suspense>
    </SWRConfig>
  );
}

export default App;
