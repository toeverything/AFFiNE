import { ProviderComposer } from '@affine/component/provider-composer';
import { ThemeProvider } from '@affine/component/theme-provider';
import { rootStore } from '@affine/workspace/atom';
import { Provider } from 'jotai';
import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';

export function AffinePluginContext(props: PropsWithChildren) {
  return (
    <ProviderComposer
      contexts={useMemo(
        () =>
          [
            <Provider key="JotaiProvider" store={rootStore} />,
            <ThemeProvider key="ThemeProvider" />,
          ].filter(Boolean),
        []
      )}
    >
      {props.children}
    </ProviderComposer>
  );
}
