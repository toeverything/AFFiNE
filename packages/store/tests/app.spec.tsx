/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { DataCenter } from '@affine/datacenter';
import {
  DataCenterPreloader,
  GlobalAppProvider,
  useGlobalState,
} from '@affine/store';
import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, test } from 'vitest';

describe('App Store', () => {
  test('init', async () => {
    const Inner = () => {
      const state = useGlobalState();
      console.log('state', state);
      expect(state).toBeTypeOf('object');
      expect(state.dataCenter).toBeInstanceOf(DataCenter);
      expect(state.dataCenterPromise).toBeInstanceOf(Promise);
      state.dataCenterPromise.then(dc => expect(dc).toBe(state.dataCenter));
      return null;
    };
    const App = () => (
      <GlobalAppProvider>
        <DataCenterPreloader>
          <Inner />
        </DataCenterPreloader>
      </GlobalAppProvider>
    );
    const result = render(<App />);
  });
});
