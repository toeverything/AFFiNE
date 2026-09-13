import type { WorkspaceInviteLinkSnapshot } from '@affine/realtime';
import { Framework } from '@toeverything/infra';
import { NEVER } from 'rxjs';
import { afterEach, expect, test, vi } from 'vitest';

import { WorkspaceService } from '../../workspace';
import { WorkspaceShareSettingStore } from '../stores/share-setting';
import { WorkspaceShareSetting } from './share-setting';

afterEach(() => {
  vi.useRealTimers();
});

test.each([1000, 2 ** 31 - 1, 29.5 * 86400000])(
  'keeps the invite link until its actual expiry after %i ms',
  async remaining => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    vi.setSystemTime(new Date('2026-09-09T00:00:00Z'));
    const link: WorkspaceInviteLinkSnapshot = {
      link: 'https://example.com/invite',
      expireTime: new Date(Date.now() + remaining).toISOString(),
    };
    const fetchInviteLink = vi.fn().mockResolvedValue(link);
    const framework = new Framework();
    framework
      .service(WorkspaceService, {
        workspace: { id: 'workspace-1' },
      } as WorkspaceService)
      .store(WorkspaceShareSettingStore, {
        fetchInviteLink,
        subscribeInviteLink: () => NEVER,
        subscribeWorkspaceConfig: () => NEVER,
      } as unknown as WorkspaceShareSettingStore)
      .entity(WorkspaceShareSetting, [
        WorkspaceService,
        WorkspaceShareSettingStore,
      ]);
    const setting = framework.provider().createEntity(WorkspaceShareSetting);
    try {
      setting.revalidateInviteLink();
      await vi.advanceTimersByTimeAsync(0);
      expect(setting.inviteLink$.value).toEqual(link);
      expect(setTimeoutSpy).toHaveBeenLastCalledWith(
        expect.any(Function),
        Math.min(remaining, 2 ** 31 - 1)
      );
      await vi.advanceTimersByTimeAsync(remaining - 1);
      expect(setting.inviteLink$.value).toEqual(link);
      await vi.advanceTimersByTimeAsync(1);
      expect(setting.inviteLink$.value).toBeNull();
      expect(vi.getTimerCount()).toBe(0);

      const renewed = {
        ...link,
        expireTime: new Date(Date.now() + remaining).toISOString(),
      };
      fetchInviteLink.mockResolvedValueOnce(renewed);
      setting.revalidateInviteLink();
      await vi.advanceTimersByTimeAsync(0);
      expect(setting.inviteLink$.value).toEqual(renewed);
      fetchInviteLink.mockResolvedValueOnce(null);
      setting.revalidateInviteLink();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
      expect(setting.inviteLink$.value).toBeNull();

      fetchInviteLink.mockResolvedValueOnce(renewed);
      setting.revalidateInviteLink();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);
    } finally {
      setting.dispose();
    }
    expect(vi.getTimerCount()).toBe(0);
  }
);
