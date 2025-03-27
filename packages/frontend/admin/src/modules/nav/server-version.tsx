import { cssVarV2 } from '@toeverything/theme/v2';
import { useCallback } from 'react';

import { Button } from '../../components/ui/button';
import { useServerConfig } from '../common';

export const ServerVersion = () => {
  const serverConfig = useServerConfig();
  const availableUpgrade = serverConfig?.availableUpgrade;
  const version = serverConfig?.version;

  const handleClick = useCallback(() => {
    window.open(availableUpgrade.url, '_blank');
  }, [availableUpgrade]);

  if (availableUpgrade) {
    return (
      <Button
        variant="outline"
        className="flex items-center justify-center gap-1 text-xs p-2 font-medium w-full overflow-hidden"
        onClick={handleClick}
        title={`New Version ${availableUpgrade.version} Available`}
      >
        <span className="overflow-hidden text-ellipsis">
          New Version
          <span>{availableUpgrade.version}</span>
          Available
        </span>
      </Button>
    );
  }
  return (
    <div
      className="flex items-center justify-between pt-2 border-t px-2 text-xs"
      style={{
        color: cssVarV2('text/tertiary'),
      }}
    >
      ServerVersion<span>v{version}</span>
    </div>
  );
};
