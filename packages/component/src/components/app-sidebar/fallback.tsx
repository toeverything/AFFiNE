import { Skeleton } from '@mui/material';
import type { ReactElement } from 'react';

import { fallbackHeaderStyle, fallbackStyle } from './fallback.css';
import { AppSidebar } from './index';

export const AppSidebarFallback = (): ReactElement | null => {
  return (
    <AppSidebar>
      <div className={fallbackStyle}>
        <div className={fallbackHeaderStyle}>
          <Skeleton variant="circular" width={40} height={40} />
          <Skeleton variant="rectangular" width={150} height={40} />
        </div>
      </div>
    </AppSidebar>
  );
};
