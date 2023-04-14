import type { createStore } from 'jotai';
import { Provider } from 'jotai';
import type { ReactElement } from 'react';
import { Suspense } from 'react';

import { IndexPage } from './pages';

type AppProps = {
  store: ReturnType<typeof createStore>;
};

export const App = (props: AppProps): ReactElement => {
  return (
    <Provider store={props.store}>
      <Suspense fallback="loading page...">
        <IndexPage />
      </Suspense>
    </Provider>
  );
};
