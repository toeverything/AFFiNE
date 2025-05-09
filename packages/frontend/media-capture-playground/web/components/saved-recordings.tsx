import useSWRSubscription from 'swr/subscription';

import type { SavedRecording } from '../types';
import { socket } from '../utils';
import { SavedRecordingItem } from './saved-recording-item';

export function SavedRecordings(): React.ReactElement {
  const { data: recordings = [] } = useSWRSubscription<SavedRecording[]>(
    'saved-recordings',
    (
      _key: string,
      { next }: { next: (err: Error | null, data?: SavedRecording[]) => void }
    ) => {
      // Subscribe to saved recordings updates
      socket.on('apps:saved', (data: { recordings: SavedRecording[] }) => {
        next(null, data.recordings);
      });

      fetch('/api/apps/saved')
        .then(res => res.json())
        .then(data => next(null, data.recordings))
        .catch(err => next(err));

      return () => {
        socket.off('apps:saved');
      };
    }
  );

  if (recordings.length === 0) {
    return <p className="text-gray-500 italic text-sm">No saved recordings</p>;
  }

  return (
    <div className="space-y-1">
      {recordings.map(recording => (
        <SavedRecordingItem key={recording.wav} recording={recording} />
      ))}
    </div>
  );
}
