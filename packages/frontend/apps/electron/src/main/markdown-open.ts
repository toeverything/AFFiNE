import type { App } from 'electron';
import { Subject } from 'rxjs';

import {
  isMarkdownFilePath,
  type MarkdownOpenRequest,
  MarkdownOpenRequestQueue,
} from './markdown-open-queue';
import type { MainEventRegister } from './type';
import { showMainWindow } from './windows-manager';

const queue = new MarkdownOpenRequestQueue();
const request$ = new Subject<MarkdownOpenRequest>();

function toMarkdownOpenRequest(request: MarkdownOpenRequest) {
  return {
    requestId: String(request.requestId),
    filePath: String(request.filePath),
  } satisfies MarkdownOpenRequest;
}

function markdownPathsFromCommandLine(commandLine: string[]) {
  return commandLine.filter(isMarkdownFilePath);
}

function enqueueRequest(filePath: string) {
  const request = queue.enqueue(filePath);
  if (!request) {
    return false;
  }
  request$.next(toMarkdownOpenRequest(request));
  return true;
}

export function setupMarkdownOpen(app: App) {
  const enqueueAndReveal = (filePath: string) => {
    if (!enqueueRequest(filePath)) {
      return false;
    }
    void app
      .whenReady()
      .then(showMainWindow)
      .catch(error => {
        console.error('Failed to show AFFiNE for Markdown file:', error);
      });
    return true;
  };

  app.on('open-file', (event, filePath) => {
    if (enqueueAndReveal(filePath)) {
      event.preventDefault();
    }
  });

  app.on('second-instance', (_event, commandLine) => {
    markdownPathsFromCommandLine(commandLine).forEach(enqueueAndReveal);
  });

  app.on('ready', () => {
    markdownPathsFromCommandLine(process.argv).forEach(enqueueAndReveal);
  });
}

export const markdownOpenHandlers = {
  getPending: async (_event: Electron.IpcMainInvokeEvent) =>
    queue.pending().map(toMarkdownOpenRequest),
  complete: async (_event: Electron.IpcMainInvokeEvent, requestId: string) => {
    return queue.complete(requestId);
  },
};

export const markdownOpenEvents = {
  onOpenRequest: ((callback: (request: MarkdownOpenRequest) => void) => {
    const subscription = request$.subscribe(callback);
    return () => subscription.unsubscribe();
  }) satisfies MainEventRegister,
};
