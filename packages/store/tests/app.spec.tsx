/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { DataCenter, getDataCenter } from '@affine/datacenter';
import {
  createDefaultWorkspace,
  GlobalAppProvider,
  useDataCenter,
  useGlobalState,
} from '@affine/store';
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

describe('App Store', () => {
  test('init', async () => {
    const dataCenterPromise = getDataCenter();
    const dataCenter = await dataCenterPromise;
    await createDefaultWorkspace(dataCenter);
    const Inner = () => {
      const state = useGlobalState();
      const dataCenter = useDataCenter();
      expect(state).toBeTypeOf('object');
      expect(dataCenter).toBeInstanceOf(DataCenter);
      return <div>Test2</div>;
    };

    const App = () => (
      <GlobalAppProvider>
        <div>Test1</div>
        <Inner />
      </GlobalAppProvider>
    );
    const app = render(<App />);
    app.getByText('Test2');
  });
});
