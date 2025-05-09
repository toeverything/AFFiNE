import { useCallback, useEffect, useState } from 'react';

import { socket } from '../utils';

export function GlobalRecordButton() {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    function handleRecordingStatus(data: {
      recordings: Array<{ processId: number }>;
    }) {
      // Global recording uses processId -1
      setIsRecording(data.recordings.some(r => r.processId === -1));
    }

    socket.on('apps:recording', handleRecordingStatus);
    return () => {
      socket.off('apps:recording', handleRecordingStatus);
    };
  }, []);

  const handleClick = useCallback(() => {
    setIsLoading(true);
    const endpoint = isRecording ? '/api/global/stop' : '/api/global/record';
    fetch(endpoint, { method: 'POST' })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to toggle global recording');
        }
      })
      .catch(error => {
        console.error('Error toggling global recording:', error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isRecording]);

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`
        px-4 py-2 rounded-lg font-medium text-sm
        transition-colors duration-200
        ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
        ${
          isRecording
            ? 'bg-red-100 text-red-700 hover:bg-red-200'
            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
        }
      `}
    >
      <div className="flex items-center gap-2">
        {isRecording ? (
          <>
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Stop Global Recording
          </>
        ) : (
          <>
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            Record System Audio
          </>
        )}
      </div>
    </button>
  );
}
