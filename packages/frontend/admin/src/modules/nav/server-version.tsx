import { cssVarV2 } from '@toeverything/theme/v2';
import { useCallback } from 'react';

import { Button } from '../../components/ui/button';
import { useServerConfig } from '../common';

export const ServerVersion = () => {
  const serverConfig = useServerConfig();
  const availableUpgrade = serverConfig?.availableUpgrade;
  const version = serverConfig?.version;

  const handleClick = useCallback(() => {
    if (availableUpgrade) {
      window.open(availableUpgrade.url, '_blank');
    }
  }, [availableUpgrade]);

  if (availableUpgrade) {
    return (
      <Button
        variant="outline"
        className="flex items-center justify-center gap-1 text-xs p-2 font-medium w-full overflow-hidden"
        onClick={handleClick}
        title={`New Version ${availableUpgrade.version} Available`}
      >
        <span className="overflow-hidden text-ellipsis space-x-1">
          <span>New Version</span>
          <span>{availableUpgrade.version}</span>
          <span>Available</span>
        </span>
      </Button>
    );
  }
  return (
    <div
      className="inline-flex items-center justify-between pt-2 border-t px-2 text-xs flex-nowrap gap-1"
      style={{
        color: cssVarV2('text/tertiary'),
      }}
    >
      <span>ServerVersion</span>
      <span
        className="overflow-hidden text-ellipsis whitespace-nowrap"
        title={version}
      >
        {`v${version}`}
      </span>
    </div>
  );
};
