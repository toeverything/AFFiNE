import { Framework, LiveData } from '@toeverything/infra';
import { describe, expect, test, vi } from 'vitest';

import { WorkbenchService } from '../../workbench/services/workbench';
import { CommentPanelService } from './comment-panel-service';

describe('CommentPanelService', () => {
  test('shows pending comment mode when a pending comment is created', () => {
    const openSidebar = vi.fn();
    const activeSidebarTab = vi.fn();
    const pendingComment$ = new LiveData<{
      id: string;
    } | null>(null);
    const framework = new Framework();

    framework
      .service(WorkbenchService, {
        workbench: {
          activeView$: new LiveData({
            activeSidebarTab,
          }),
          openSidebar,
        },
      } as unknown as WorkbenchService)
      .service(CommentPanelService, [WorkbenchService]);

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
