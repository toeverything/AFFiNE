import { describe, expect, test } from 'vitest';

import { resolveShareTargetWorkspace } from './resolve-share-workspace';

const workspaces = [
  { id: 'duplicate', flavour: 'local', name: 'Local' },
  { id: 'duplicate', flavour: 'cloud', name: 'Cloud' },
  { id: 'only', flavour: 'local', name: 'Only' },
];

describe('resolveShareTargetWorkspace', () => {
  test('requires flavour when a preferred ID is ambiguous', () => {
    expect(
      resolveShareTargetWorkspace({
        workspaces,
        preferredId: 'duplicate',
      })
    ).toBeNull();
  });

  test('selects the requested flavour for duplicate IDs', () => {
    expect(
      resolveShareTargetWorkspace({
        workspaces,
        preferredId: 'duplicate',
        preferredFlavour: 'cloud',
      })
    ).toEqual({ id: 'duplicate', flavour: 'cloud', name: 'Cloud' });
  });

  test('does not fall back when a preferred workspace is missing', () => {
    expect(
      resolveShareTargetWorkspace({
        currentFlavour: 'local',
        currentId: 'only',
        preferredId: 'missing',
        workspaces,
      })
    ).toBeNull();
  });

  test('uses current workspace and then first workspace without a preference', () => {
    expect(
      resolveShareTargetWorkspace({
        currentFlavour: 'local',
        currentId: 'only',
        workspaces,
      })
    ).toEqual({ id: 'only', flavour: 'local', name: 'Only' });
    expect(resolveShareTargetWorkspace({ workspaces })).toEqual(workspaces[0]);
  });
});
