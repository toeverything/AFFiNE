import React from 'react';
import useSWRSubscription from 'swr/subscription';

import type { App, AppGroup, RecordingStatus } from '../types';
import { socket } from '../utils';
import { AppItem } from './app-item';

export function AppList() {
  const { data: apps = [] } = useSWRSubscription('apps', (_key, { next }) => {
    let apps: App[] = [];
    // Initial apps fetch
    fetch('/api/apps')
      .then(res => res.json())
      .then(data => {
        apps = data.apps;
        next(null, apps);
      })
      .catch(err => next(err));

    // Subscribe to app updates
    socket.on('apps:all', data => {
      next(null, data.apps);
      apps = data.apps;
    });
    socket.on('apps:state-changed', data => {
      const index = apps.findIndex(a => a.processId === data.processId);
      console.log('apps:state-changed', data, index);
      if (index !== -1) {
        next(
          null,
          apps.toSpliced(index, 1, {
            ...apps[index],
            isRunning: data.isRunning,
          })
        );
      }
    });
    socket.on('connect', () => {
      // Refetch on reconnect
      fetch('/api/apps')
        .then(res => res.json())
        .then(data => next(null, data.apps))
        .catch(err => next(err));
    });

    return () => {
      socket.off('apps:all');
      socket.off('apps:state-changed');
      socket.off('connect');
    };
  });

  const { data: recordings = [] } = useSWRSubscription<RecordingStatus[]>(
    'recordings',
    (
      _key: string,
      { next }: { next: (err: Error | null, data?: RecordingStatus[]) => void }
    ) => {
      // Subscribe to recording updates
      socket.on('apps:recording', (data: { recordings: RecordingStatus[] }) => {
        next(null, data.recordings);
      });

      return () => {
        socket.off('apps:recording');
      };
    }
  );

  const appGroups: AppGroup[] = React.useMemo(() => {
    const mapping = apps.reduce((acc: Record<number, AppGroup>, app: App) => {
      if (!acc[app.processGroupId]) {
        acc[app.processGroupId] = {
          processGroupId: app.processGroupId,
          apps: [],
          rootApp:
            apps.find((a: App) => a.processId === app.processGroupId) || app,
        };
      }
      acc[app.processGroupId].apps.push(app);
      return acc;
    }, {});
    return Object.values(mapping);
  }, [apps]);

  const runningApps = (appGroups || []).filter(app =>
    app.apps.some(a => a.isRunning)
  );
  const notRunningApps = (appGroups || []).filter(
    app => !app.apps.some(a => a.isRunning)
  );

  return (
    <div className="h-full flex flex-col divide-y divide-gray-100">
      <div className="p-4 relative">
        <div className="flex items-center justify-between sticky top-0 bg-white z-10 mb-2">
          <h2 className="text-sm font-semibold text-gray-900">
            Active Applications
          </h2>
          <span className="text-xs px-2 py-1 bg-blue-50 rounded-full text-blue-600 font-medium">
            {runningApps.length} listening
          </span>
        </div>
        <div className="space-y-2">
          {runningApps.map(app => (
            <AppItem
              key={app.processGroupId}
              app={app}
              recordings={recordings}
            />
          ))}
          {runningApps.length === 0 && (
            <div className="text-sm text-gray-500 italic bg-gray-50 rounded-xl p-4 text-center">
              No applications are currently listening
            </div>
          )}
        </div>
      </div>
      <div className="p-4 flex-1 relative">
        <div className="flex items-center justify-between sticky top-0 bg-white z-10 mb-2">
          <h2 className="text-sm font-semibold text-gray-900">
            Other Applications
          </h2>
          <span className="text-xs px-2 py-1 bg-gray-50 rounded-full text-gray-600 font-medium">
            {notRunningApps.length} available
          </span>
        </div>
        <div className="space-y-2">
          {notRunningApps.map(app => (
            <AppItem
              key={app.processGroupId}
              app={app}
              recordings={recordings}
            />
          ))}
          {notRunningApps.length === 0 && (
            <div className="text-sm text-gray-500 italic bg-gray-50 rounded-xl p-4 text-center">
              No other applications found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
