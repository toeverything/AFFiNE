import { RadioGroup, type RadioItem } from '@affine/component';
import { registerAffineCommand } from '@affine/core/commands';
import { EditorService } from '@affine/core/modules/editor';
import { ViewService, WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import type { DocMode } from '@blocksuite/affine/model';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import {
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import { useCallback, useEffect, useMemo } from 'react';

import { switchItem } from './style.css';
import { EdgelessSwitchItem, PageSwitchItem } from './switch-items';

export interface EditorModeSwitchProps {
  pageId: string;
  isPublic?: boolean;
  publicMode?: DocMode;
}

const EdgelessRadioItem: RadioItem = {
  value: 'edgeless',
  label: <EdgelessSwitchItem />,
  testId: 'switch-edgeless-mode-button',
  className: switchItem,
};
const PageRadioItem: RadioItem = {
  value: 'page',
  label: <PageSwitchItem />,
  testId: 'switch-page-mode-button',
  className: switchItem,
};

export const EditorModeSwitch = () => {
  const t = useI18n();
  const editor = useService(EditorService).editor;
  const trash = useLiveData(editor.doc.trash$);
  const isSharedMode = editor.isSharedMode;
  const currentMode = useLiveData(editor.mode$);
  const view = useServiceOptional(ViewService)?.view;
  const workbench = useServiceOptional(WorkbenchService)?.workbench;
  const activeView = useLiveData(workbench?.activeView$);
  const isActiveView = activeView?.id && activeView?.id === view?.id;

  const togglePage = useCallback(() => {
    if (currentMode === 'page' || isSharedMode || trash) return;
    editor.setMode('page');
    editor.setSelector(undefined);
    track.$.header.actions.switchPageMode({ mode: 'page' });
  }, [currentMode, editor, isSharedMode, trash]);

  const toggleEdgeless = useCallback(() => {
    if (currentMode === 'edgeless' || isSharedMode || trash) return;
    editor.setMode('edgeless');
    editor.setSelector(undefined);
    track.$.header.actions.switchPageMode({ mode: 'edgeless' });
  }, [currentMode, editor, isSharedMode, trash]);

  const onModeChange = useCallback(
    (mode: DocMode) => {
      mode === 'page' ? togglePage() : toggleEdgeless();
    },
    [toggleEdgeless, togglePage]
  );

  const shouldHide = useCallback(
    (mode: DocMode) => (trash || isSharedMode) && currentMode !== mode,
    [currentMode, isSharedMode, trash]
  );

  useEffect(() => {
    if (trash || isSharedMode || currentMode === undefined || !isActiveView)
      return;
    return registerAffineCommand({
      id: 'affine:doc-mode-switch',
      category: 'editor:page',
      label:
        currentMode === 'page'
          ? t['com.affine.cmdk.switch-to-edgeless']()
          : t['com.affine.cmdk.switch-to-page'](),
      icon: currentMode === 'page' ? <EdgelessIcon /> : <PageIcon />,
      keyBinding: {
        binding: 'Alt+KeyS',
        capture: true,
      },
      run: () => onModeChange(currentMode === 'edgeless' ? 'page' : 'edgeless'),
    });
  }, [currentMode, isActiveView, isSharedMode, onModeChange, t, trash]);

  return (
    <PureEditorModeSwitch
      mode={currentMode}
      setMode={onModeChange}
      hidePage={shouldHide('page')}
      hideEdgeless={shouldHide('edgeless')}
    />
  );
};

export interface PureEditorModeSwitchProps {
  mode?: DocMode;
  setMode?: (mode: DocMode) => void;
  hidePage?: boolean;
  hideEdgeless?: boolean;
}

export const PureEditorModeSwitch = ({
  mode,
  setMode,
  hidePage,
  hideEdgeless,
}: PureEditorModeSwitchProps) => {
  const items = useMemo(
    () => [
      ...(hidePage ? [] : [PageRadioItem]),
      ...(hideEdgeless ? [] : [EdgelessRadioItem]),
    ],
    [hideEdgeless, hidePage]
  );
  return (
    <RadioGroup
      iconMode
      itemHeight={24}
      borderRadius={8}
      padding={4}
      gap={8}
      value={mode}
      items={items}
      onChange={setMode}
    />
  );
};
