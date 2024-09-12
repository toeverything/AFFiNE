import { ProviderComposer } from '@affine/component/provider-composer';
import { ThemeProvider } from '@affine/component/theme-provider';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import type { createStore } from 'jotai';
import { Provider } from 'jotai';
import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';

import { ConfirmModalProvider } from '../../ui/modal';

export type AffineContextProps = PropsWithChildren<{
  store?: ReturnType<typeof createStore>;
}>;

export function AffineContext(props: AffineContextProps) {
  return (
    <ProviderComposer
      contexts={useMemo(
        () =>
          [
            <Provider key="JotaiProvider" store={props.store} />,
            <ThemeProvider key="ThemeProvider" />,
            <ConfirmModalProvider key="ConfirmModalProvider" />,
            // @ts-expect-error children is provided by the composer
            <TooltipProvider key="TooltipProvider" />,
          ].filter(Boolean),
        [props.store]
      )}
    >
      {props.children}
    </ProviderComposer>
  );
}
