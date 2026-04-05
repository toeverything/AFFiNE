import { Framework, LiveData, Service } from '@toeverything/infra';
import { describe, expect, test, vi } from 'vitest';

import { CommentPanelService } from './comment-panel-service';

describe('CommentPanelService', () => {
  test('shows pending comment mode when a pending comment is created', () => {
    const openSidebar = vi.fn();
    const activeSidebarTab = vi.fn();
    const pendingComment$ = new LiveData<{
      id: string;
    } | null>(null);
    const framework = new Framework();

    class MockWorkbenchService extends Service {
      workbench = {
        activeView$: new LiveData({
          activeSidebarTab,
        }),
        openSidebar,
      };
    }

    framework
      .service(MockWorkbenchService)
      .service(CommentPanelService, [MockWorkbenchService]);

    const service = framework.provider().get(CommentPanelService);

    const dispose = service.watchForPendingComments({
      pendingComment$,
    } as never);

    pendingComment$.setValue({
      id: 'pending-1',
    });

    expect(service.displayMode$.value).toEqual({
      type: 'pending',
    });
    expect(openSidebar).toHaveBeenCalled();
    expect(activeSidebarTab).toHaveBeenCalledWith('comment');

    dispose();
  });
});
