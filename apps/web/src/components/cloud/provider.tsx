import { SessionProvider } from 'next-auth/react';
import type { PropsWithChildren, ReactElement } from 'react';
import { useMemo } from 'react';
import type { SWRConfiguration } from 'swr';
import { SWRConfig } from 'swr';

const cloudConfig: SWRConfiguration = {
  suspense: true,
};

export const Provider = (props: PropsWithChildren): ReactElement => {
  if (!runtimeConfig.enableCloud) {
    return <>{props.children}</>;
  }
  return (
    <SWRConfig
      value={
        // This is a safe conditional hook
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useMemo(
          () => ({
            ...cloudConfig,
          }),
          []
        )
      }
    >
      <SessionProvider>{props.children}</SessionProvider>
    </SWRConfig>
  );
};
