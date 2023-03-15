import React from 'react';
import type { SWRConfiguration } from 'swr';
import { SWRConfig } from 'swr';

import { fetcher } from '../plugins/affine/fetcher';

const config: SWRConfiguration = {
  suspense: true,
  fetcher,
};

export const AffineSWRConfigProvider = React.memo<React.PropsWithChildren>(
  function AffineSWRConfigProvider({ children }) {
    return <SWRConfig value={config}>{children}</SWRConfig>;
  }
);
