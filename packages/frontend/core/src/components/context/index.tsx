import { ConfirmModalProvider, PromptModalProvider } from '@affine/component';
import { ProviderComposer } from '@affine/component/provider-composer';
import { ThemeProvider } from '@affine/core/components/theme-provider';
import { DirectionProvider } from '@radix-ui/react-direction';
import type { createStore } from 'jotai';
import { Provider } from 'jotai';
import type { PropsWithChildren } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { useImageAntialiasing } from '../hooks/use-image-antialiasing';

function useDocumentDir(): 'ltr' | 'rtl' {
  const [dir, setDir] = useState<'ltr' | 'rtl'>(
    () => (document.documentElement.dir as 'ltr' | 'rtl') || 'ltr'
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDir((document.documentElement.dir as 'ltr' | 'rtl') || 'ltr');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['dir'],
    });
    return () => observer.disconnect();
  }, []);
  return dir;
}

export type AffineContextProps = PropsWithChildren<{
  store?: ReturnType<typeof createStore>;
}>;

export function AffineContext(props: AffineContextProps) {
  useImageAntialiasing();
  const dir = useDocumentDir();
  return (
    <ProviderComposer
      contexts={useMemo(
        () =>
          [
            <Provider key="JotaiProvider" store={props.store} />,
            <ThemeProvider key="ThemeProvider" />,
            <DirectionProvider key="DirectionProvider" dir={dir} />,
            <ConfirmModalProvider key="ConfirmModalProvider" />,
            <PromptModalProvider key="PromptModalProvider" />,
          ].filter(Boolean),
        [props.store, dir]
      )}
    >
      {props.children}
    </ProviderComposer>
  );
}
