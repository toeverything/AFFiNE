import { AppProps } from 'next/app';
import { Suspense } from 'react';
import { SWRConfig } from 'swr';

function App({ Component }: AppProps) {
  return (
    <SWRConfig
      value={{
        suspense: true,
      }}
    >
      <Suspense fallback="loading">
        <Component />
      </Suspense>
    </SWRConfig>
  );
}

export default App;
