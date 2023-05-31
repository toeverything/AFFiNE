/**
 * @vitest-environment happy-dom
 */
import { render } from '@testing-library/react';
import type React from 'react';
import { createContext, useContext } from 'react';
import { expect, test } from 'vitest';

import { ProviderComposer } from '..';

test('ProviderComposer', async () => {
  const Context = createContext('null');
  const Provider: React.FC<React.PropsWithChildren> = ({ children }) => {
    return <Context.Provider value="test1">{children}</Context.Provider>;
  };
  const ConsumerComponent = () => {
    const value = useContext(Context);
    return <>{value}</>;
  };
  const Component = () => {
    return (
      <ProviderComposer contexts={[<Provider key={1} />]}>
        <ConsumerComponent />
      </ProviderComposer>
    );
  };

  const result = render(<Component />);
  await result.findByText('test1');
  expect(result.asFragment()).toMatchSnapshot();
});
