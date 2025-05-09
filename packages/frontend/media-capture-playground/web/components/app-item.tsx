import React from 'react';

import type { AppGroup, RecordingStatus } from '../types';
import { formatDuration } from '../utils';

interface AppItemProps {
  app: AppGroup;
  recordings?: RecordingStatus[];
}

export function AppItem({ app, recordings }: AppItemProps) {
  const [imgError, setImgError] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);

  const appName = app.rootApp.name || '';
  const bundleId = app.rootApp.bundleIdentifier || '';
  const firstLetter = appName.charAt(0).toUpperCase();
  const isRunning = app.apps.some(a => a.isRunning);

  const recording = recordings?.find((r: RecordingStatus) =>
    app.apps.some(a => a.processId === r.processId)
  );

  const handleRecordClick = React.useCallback(() => {
    const recordingApp = app.apps.find(a => a.isRunning);
    if (!recordingApp) {
      return;
    }
    if (isRecording) {
      void fetch(`/api/apps/${recordingApp.processId}/stop`, {
        method: 'POST',
      })
        .then(() => setIsRecording(false))
        .catch(error => console.error('Failed to stop recording:', error));
    } else {
      void fetch(`/api/apps/${recordingApp.processId}/record`, {
        method: 'POST',
      })
        .then(() => setIsRecording(true))
        .catch(error => console.error('Failed to start recording:', error));
    }
  }, [app.apps, isRecording]);

  React.useEffect(() => {
    setIsRecording(!!recording);
  }, [recording]);

  const [duration, setDuration] = React.useState(0);

  React.useEffect(() => {
    if (recording) {
      const interval = setInterval(() => {
        setDuration(Date.now() - recording.startTime);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setDuration(0);
    }
    return () => {};
  }, [recording]);

  return (
    <div className="flex items-center h-16 space-x-2 p-3 hover:bg-gray-50 rounded-lg transition-all duration-200 border border-transparent hover:border-gray-100">
      {imgError ? (
        <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-600 font-semibold text-base">
          {firstLetter}
        </div>
      ) : (
        <img
          src={`/api/apps/${app.rootApp.processId}/icon`}
          loading="lazy"
          alt={appName}
          className="w-8 h-8 object-contain rounded-lg bg-gray-50 border border-gray-100"
          onError={() => setImgError(true)}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-1 mb-1">
          {appName ? (
            <span className="text-gray-900 font-medium text-sm truncate">
              {appName}
            </span>
          ) : (
            <span className="text-gray-400 italic font-medium text-sm">
              Unnamed Application
            </span>
          )}
          <span className="text-xs px-1 bg-gray-50 text-gray-500 rounded border border-gray-100">
            PID: {app.rootApp.processId}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium border ${recording ? 'bg-red-50 text-red-600 border-red-100 opacity-100' : 'opacity-0'}`}
          >
            {recording ? formatDuration(duration) : '00:00:00'}
          </span>
        </div>
        <div className="text-xs text-gray-500 font-mono truncate opacity-80">
          {bundleId}
        </div>
      </div>
      {(isRunning || isRecording) && (
        <button
          onClick={handleRecordClick}
          className={`h-8 min-w-[80px] flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-200 ${
            isRecording
              ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
              : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
          }`}
        >
          {isRecording ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-2" />
              <span>Stop</span>
            </>
          ) : (
            <span>Record</span>
          )}
        </button>
      )}
    </div>
  );
}
