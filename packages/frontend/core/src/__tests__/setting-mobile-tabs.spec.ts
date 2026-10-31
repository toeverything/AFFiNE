import { describe, expect, it } from 'vitest';

import { isTabShownOnMobile } from '../desktop/dialogs/setting/mobile-tabs';

// 999.14: the full desktop settings menu embedded in mobile settings must not
// repeat what the mobile settings screen already shows (profile/sign-in,
// subscription, about, experimental) or what is useless on a phone (keyboard
// shortcuts). Appearance stays: the desktop panel has much more than mobile's.
describe('isTabShownOnMobile', () => {
  it('hides sections the mobile settings screen already has', () => {
    for (const tab of [
      'account',
      'plans',
      'billing',
      'about',
      'experimental-features',
    ] as const) {
      expect(isTabShownOnMobile(tab)).toBe(false);
    }
  });

  it('hides keyboard shortcuts', () => {
    expect(isTabShownOnMobile('shortcuts')).toBe(false);
  });

  it('keeps appearance, notifications, editor, meetings and every workspace section', () => {
    for (const tab of [
      'appearance',
      'notifications',
      'editor',
      'meetings',
      'workspace:preference',
      'workspace:properties',
      'workspace:members',
      'workspace:storage',
      'workspace:integrations',
      'workspace:billing',
      'workspace:license',
    ] as const) {
      expect(isTabShownOnMobile(tab)).toBe(true);
    }
  });
});
