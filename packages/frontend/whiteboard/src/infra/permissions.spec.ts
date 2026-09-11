import { describe, expect, it } from 'vitest';

import { canEditBoardWidgets, isBoardReadonly } from './permissions';

describe('board widget RBAC', () => {
  it('follows Doc_Update via store.readonly and treats lockedBySelf as a soft lock', () => {
    expect(isBoardReadonly({ readonly: true })).toBe(true);
    expect(canEditBoardWidgets({ readonly: false })).toBe(true);
    expect(canEditBoardWidgets({ readonly: true })).toBe(false);
    expect(
      canEditBoardWidgets({ readonly: false }, { lockedBySelf: true })
    ).toBe(false);
    expect(canEditBoardWidgets({ readonly: false }, { lockedBySelf: false })).toBe(
      true
    );
  });
});
