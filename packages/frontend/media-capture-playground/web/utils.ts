import { io } from 'socket.io-client';

// Create a singleton socket instance
export const socket = io('http://localhost:6544');

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${hours.toString().padStart(2, '0')}:${(minutes % 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

// Helper function to convert timestamp (MM:SS.mmm) to seconds
export function timestampToSeconds(timestamp: string): number {
  const [minutes, seconds] = timestamp.split(':').map(parseFloat);
  return minutes * 60 + seconds;
}
