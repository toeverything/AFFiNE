import type { SettingTab } from '@affine/core/modules/dialogs/constant';

/**
 * 999.14: sections hidden when the full settings menu is embedded in the
 * mobile settings screen -- that screen already has its own profile/sign-in,
 * subscription, about and experimental groups, and keyboard shortcuts are
 * meaningless on a phone. Appearance stays: the desktop panel has far more
 * than the mobile screen's theme/font/language rows.
 */
const MOBILE_HIDDEN_TABS: ReadonlySet<SettingTab> = new Set<SettingTab>([
  'account',
  'plans',
  'billing',
  'about',
  'experimental-features',
  'shortcuts',
]);

export function isTabShownOnMobile(tab: SettingTab): boolean {
  return !MOBILE_HIDDEN_TABS.has(tab);
}
