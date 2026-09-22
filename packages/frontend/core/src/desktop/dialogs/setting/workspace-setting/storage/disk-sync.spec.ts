import { describe, expect, it } from 'vitest';

import { shouldReloadDiskSyncSession } from './disk-sync-session';

describe('shouldReloadDiskSyncSession', () => {
  it('does not reload when feature is disabled', () => {
    expect(
      shouldReloadDiskSyncSession(false, '/tmp/folder-a', '/tmp/folder-b')
    ).toBe(false);
  });

  it('does not reload when folder is unchanged', () => {
    expect(
      shouldReloadDiskSyncSession(true, '/tmp/folder-a', '/tmp/folder-a')
    ).toBe(false);
  });

  it('reloads when folder changes while enabled', () => {
    expect(
      shouldReloadDiskSyncSession(true, '/tmp/folder-a', '/tmp/folder-b')
    ).toBe(true);
  });

  it('reloads when clearing folder while enabled', () => {
    expect(shouldReloadDiskSyncSession(true, '/tmp/folder-a', null)).toBe(true);
  });
});
