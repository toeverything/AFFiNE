// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import '@queuedash/ui/dist/styles.css';
import './queue.css';

import { QueueDashApp } from '@queuedash/ui';

import { Header } from '../header';

export function QueuePage() {
  return (
    <div className="h-screen flex-1 flex-col flex overflow-hidden">
      <Header title="Queue" />
      <div className="flex-1 overflow-hidden">
        <QueueDashApp
          apiUrl={`${environment.subPath}/api/queue/trpc`}
          basename="/admin/queue"
        />
      </div>
    </div>
  );
}

export { QueuePage as Component };
