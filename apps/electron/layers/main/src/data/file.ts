import type { WatchListener } from 'fs-extra';
import fs from 'fs-extra';

export function watchFile(path: string, callback: WatchListener<string>) {
  // todo: consider using chokidar instead
  const watcher = fs.watch(path, callback);
  return () => watcher.close();
}
