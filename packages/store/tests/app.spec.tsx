/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { DataCenter, getDataCenter } from '@affine/datacenter';
import {
  createDefaultWorkspace,
  DataCenterPreloader,
  GlobalAppProvider,
  useGlobalState,
  useGlobalStateApi,
} from '@affine/store';
import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, test } from 'vitest';

describe('App Store', () => {
  test('init', async () => {
    const dataCenterPromise = getDataCenter();
    const dataCenter = await dataCenterPromise;
    await createDefaultWorkspace(dataCenter);
    const Inner = () => {
      const state = useGlobalState();
      expect(state).toBeTypeOf('object');
      expect(state.dataCenter).toBeInstanceOf(DataCenter);
      expect(state.dataCenterPromise).toBeInstanceOf(Promise);
      state.dataCenterPromise.then(dc => expect(dc).toBe(state.dataCenter));
      return <div>Test2</div>;
    };

    const Loader = ({ children }: React.PropsWithChildren) => {
      const api = useGlobalStateApi();
      if (!api.getState().dataCenter) {
        api.setState({
          dataCenter,
          dataCenterPromise,
        });
      }
      return <>{children}</>;
    };
    const App = () => (
      <GlobalAppProvider>
        <div>Test1</div>
        <Loader>
          <Inner />
        </Loader>
      </GlobalAppProvider>
    );
    const app = render(<App />);
    app.getByText('Test2');
  });
});
