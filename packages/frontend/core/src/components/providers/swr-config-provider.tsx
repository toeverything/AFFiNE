import { notify } from '@affine/component';
import { GraphQLError } from '@affine/graphql';
import { assertExists } from '@blocksuite/affine/global/utils';
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
          assertExists(fetcher);
          const d = fetcher(...args);
          if (d instanceof Promise) {
            return d.catch(e => {
              if (
                e instanceof GraphQLError ||
                (Array.isArray(e) && e[0] instanceof GraphQLError)
              ) {
                const graphQLError = e instanceof GraphQLError ? e : e[0];
                notify.error({
                  title: 'GraphQL Error',
                  message: graphQLError.toString(),
                });
              } else {
                notify.error({
                  title: 'Error',
                  message: e.toString(),
                });
              }
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
