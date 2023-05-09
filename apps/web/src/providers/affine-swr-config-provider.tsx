import type React from 'react';
import { memo } from 'react';
import type { SWRConfiguration } from 'swr';
import { SWRConfig } from 'swr';

import { fetcher } from '../plugins/affine/fetcher';

const config: SWRConfiguration = {
  suspense: true,
  fetcher,
};

export const AffineSwrConfigProvider = memo<React.PropsWithChildren>(
  function AffineSWRConfigProvider({ children }) {
    return <SWRConfig value={config}>{children}</SWRConfig>;
  }
);
