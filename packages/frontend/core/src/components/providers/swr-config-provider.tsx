import { notify } from '@affine/component';
import { UserFriendlyError } from '@affine/error';
import type { PropsWithChildren, ReactNode } from 'react';
import { useCallback } from 'react';
import type { SWRConfiguration } from 'swr';
import { SWRConfig } from 'swr';

const swrConfig: SWRConfiguration = {
  suspense: true,
  use: [
    useSWRNext => (key, fetcher, config) => {
      const fetcherWrapper = useCallback(
        async (...args: any[]) => {
          if (!fetcher) {
            throw new Error('fetcher is not found');
          }
          const d = fetcher(...args);
          if (d instanceof Promise) {
            return d.catch(e => {
              const error = UserFriendlyError.fromAny(e);

              notify.error({
                title: error.name,
                message: error.message,
              });

              throw e;
            });
          }
          return d;
        },
        [fetcher]
      );
      return useSWRNext(key, fetcher ? fetcherWrapper : fetcher, config);
    },
  ],
};

export const SWRConfigProvider = (props: PropsWithChildren): ReactNode => {
  return <SWRConfig value={swrConfig}>{props.children}</SWRConfig>;
};
