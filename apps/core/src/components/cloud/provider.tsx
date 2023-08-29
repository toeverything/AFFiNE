import { pushNotificationAtom } from '@affine/component/notification-center';
import { assertExists } from '@blocksuite/global/utils';
import { GraphQLError } from 'graphql';
import { useSetAtom } from 'jotai';
import type { PropsWithChildren, ReactElement } from 'react';
import { useCallback } from 'react';
import type { SWRConfiguration } from 'swr';
import { SWRConfig } from 'swr';

const cloudConfig: SWRConfiguration = {
  suspense: true,
  use: [
    useSWRNext => (key, fetcher, config) => {
      const pushNotification = useSetAtom(pushNotificationAtom);
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
                pushNotification({
                  title: 'GraphQL Error',
                  message: graphQLError.toString(),
                  key: Date.now().toString(),
                  type: 'error',
                });
              } else {
                pushNotification({
                  title: 'Error',
                  message: e.toString(),
                  key: Date.now().toString(),
                  type: 'error',
                });
              }
              throw e;
            });
          }
          return d;
        },
        [fetcher, pushNotification]
      );
      return useSWRNext(key, fetcher ? fetcherWrapper : fetcher, config);
    },
  ],
};

export const Provider = (props: PropsWithChildren): ReactElement => {
  if (!runtimeConfig.enableCloud) {
    return <>{props.children}</>;
  }

  return <SWRConfig value={cloudConfig}>{props.children}</SWRConfig>;
};
