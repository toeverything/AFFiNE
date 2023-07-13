import { assertExists } from '@blocksuite/global/utils';
import { currentPageIdAtom } from '@toeverything/plugin-infra/manager';
import { atom } from 'jotai/vanilla';

import { pageSettingFamily } from './index';

export const currentModeAtom = atom<'page' | 'edgeless'>(get => {
  const pageId = get(currentPageIdAtom);
  assertExists(pageId);
  return get(pageSettingFamily(pageId))?.mode ?? 'page';
});
