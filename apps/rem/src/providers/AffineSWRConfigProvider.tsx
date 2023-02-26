import React from 'react';
import { SWRConfig } from 'swr';

import { fetcher } from '../plugins/affine/fetcher';

export const AffineSWRConfigProvider = React.memo<React.PropsWithChildren>(
  function AffineSWRConfigProvider({ children }) {
    return (
      <SWRConfig
        value={{
          suspense: true,
          fetcher,
        }}
      >
        {children}
      </SWRConfig>
    );
  }
);
