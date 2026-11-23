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
        className="flex w-full items-center justify-center gap-1 overflow-hidden px-2 py-1.5 text-xs font-medium"
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
    <div className="inline-flex flex-nowrap items-center justify-between gap-1 border-t border-border px-2 pt-2 text-xs text-muted-foreground">
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
