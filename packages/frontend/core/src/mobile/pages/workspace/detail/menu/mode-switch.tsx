import {
  RadioGroup,
  type RadioItem,
  useMobileMenuController,
} from '@affine/component';
import { EditorService } from '@affine/core/modules/editor';
import track from '@affine/track';
import type { DocMode } from '@blocksuite/affine/model';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

import * as styles from './mode-switch.css';

const EdgelessRadioItem: RadioItem = {
  value: 'edgeless',
  label: 'Edgeless',
  testId: 'switch-edgeless-mode-button',
};
const PageRadioItem: RadioItem = {
  value: 'page',
  label: 'Page',
  testId: 'switch-page-mode-button',
};
const items = [PageRadioItem, EdgelessRadioItem];

export const EditorModeSwitch = () => {
  const { close } = useMobileMenuController();
  const editor = useService(EditorService).editor;
  const trash = useLiveData(editor.doc.trash$);
  const isSharedMode = editor.isSharedMode;
  const currentMode = useLiveData(editor.mode$);

  const onToggle = useCallback(
    (mode: DocMode) => {
      console.warn('[viewport-lifecycle] mobile.mode-switch', {
        from: editor.mode$.value,
        to: mode,
      });
      // Persist primary mode too — view query-string sync defaults to
      // primaryMode, and a Pencil-driven close can race that default and snap
      // the editor back to `page` after a one-frame flash.
      editor.setMode(mode);
      editor.doc.setPrimaryMode(mode);
      editor.setSelector(undefined);
      track.$.header.actions.switchPageMode({ mode });
      // Defer menu teardown until after mode/URL sync settles under Pencil.
      requestAnimationFrame(() => close());
    },
    [close, editor]
  );

  if (trash || isSharedMode) {
    return null;
  }

  return (
    <div className={styles.radioWrapper}>
      <RadioGroup
        itemHeight={44}
        width="100%"
        borderRadius={8}
        padding={2}
        gap={4}
        value={currentMode}
        items={items}
        onChange={onToggle}
      />
    </div>
  );
};
