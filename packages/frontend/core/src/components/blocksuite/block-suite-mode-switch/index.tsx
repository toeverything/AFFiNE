import { RadioGroup, type RadioItem, toast, Tooltip } from '@affine/component';
import { registerAffineCommand } from '@affine/core/commands';
import { track } from '@affine/core/mixpanel';
import { useI18n } from '@affine/i18n';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import {
  type DocMode,
  DocsService,
  useLiveData,
  useService,
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

export const EditorModeSwitch = ({
  pageId,
  isPublic,
  publicMode,
}: EditorModeSwitchProps) => {
  const t = useI18n();
  const docsService = useService(DocsService);
  const doc = useLiveData(docsService.list.doc$(pageId));
  const trash = useLiveData(doc?.trash$);
  const currentMode = useLiveData(doc?.mode$);

  const togglePage = useCallback(() => {
    if (currentMode === 'page' || isPublic || trash) return;
    doc?.setMode('page');
    toast(t['com.affine.toastMessage.pageMode']());
    track.$.header.actions.switchPageMode({ mode: 'page' });
  }, [currentMode, doc, isPublic, t, trash]);

  const toggleEdgeless = useCallback(() => {
    if (currentMode === 'edgeless' || isPublic || trash) return;
    doc?.setMode('edgeless');
    toast(t['com.affine.toastMessage.edgelessMode']());
    track.$.header.actions.switchPageMode({ mode: 'edgeless' });
  }, [currentMode, doc, isPublic, t, trash]);

  const onModeChange = useCallback(
    (mode: DocMode) => {
      mode === 'page' ? togglePage() : toggleEdgeless();
    },
    [toggleEdgeless, togglePage]
  );

  const shouldHide = useCallback(
    (mode: DocMode) =>
      (trash && currentMode !== mode) || (isPublic && publicMode !== mode),
    [currentMode, isPublic, publicMode, trash]
  );

  useEffect(() => {
    if (trash || isPublic || currentMode === undefined) return;
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
  }, [currentMode, isPublic, onModeChange, t, trash]);

  return (
    <Tooltip
      content={t['Switch']()}
      shortcut={['$alt', 'S']}
      side="bottom"
      options={{ hidden: isPublic || trash }}
    >
      <div>
        <PureEditorModeSwitch
          mode={currentMode}
          setMode={onModeChange}
          hidePage={shouldHide('page')}
          hideEdgeless={shouldHide('edgeless')}
        />
      </div>
    </Tooltip>
  );
};

export interface PureEditorModeSwitchProps {
  mode?: DocMode;
  setMode: (mode: DocMode) => void;
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
