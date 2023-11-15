import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { Tooltip } from '@toeverything/components/tooltip';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtomValue } from 'jotai';
import type { CSSProperties } from 'react';
import { useCallback, useEffect } from 'react';

import type { PageMode } from '../../../atoms';
import { currentModeAtom } from '../../../atoms/mode';
import { useBlockSuiteMetaHelper } from '../../../hooks/affine/use-block-suite-meta-helper';
import type { BlockSuiteWorkspace } from '../../../shared';
import { toast } from '../../../utils';
import { StyledEditorModeSwitch, StyledKeyboardItem } from './style';
import { EdgelessSwitchItem, PageSwitchItem } from './switch-items';

export type EditorModeSwitchProps = {
  // todo(himself65): combine these two properties
  blockSuiteWorkspace: BlockSuiteWorkspace;
  pageId: string;
  style?: CSSProperties;
  isPublic?: boolean;
  publicMode?: PageMode;
};
const TooltipContent = () => {
  const t = useAFFiNEI18N();
  return (
    <>
      {t['Switch']()}
      <StyledKeyboardItem>
        {!environment.isServer && environment.isMacOs ? '⌥ + S' : 'Alt + S'}
      </StyledKeyboardItem>
    </>
  );
};
export const EditorModeSwitch = ({
  style,
  blockSuiteWorkspace,
  pageId,
  isPublic,
  publicMode,
}: EditorModeSwitchProps) => {
  const t = useAFFiNEI18N();
  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  assertExists(pageMeta);
  const { trash } = pageMeta;

  const { togglePageMode, switchToEdgelessMode, switchToPageMode } =
    useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const currentMode = useAtomValue(currentModeAtom);

  useEffect(() => {
    if (trash || isPublic) {
      return;
    }
    const keydown = (e: KeyboardEvent) => {
      if (e.code === 'KeyS' && e.altKey) {
        e.preventDefault();
        togglePageMode(pageId);
        toast(
          currentMode === 'page'
            ? t['com.affine.toastMessage.edgelessMode']()
            : t['com.affine.toastMessage.pageMode']()
        );
      }
    };
    document.addEventListener('keydown', keydown, { capture: true });
    return () =>
      document.removeEventListener('keydown', keydown, { capture: true });
  }, [currentMode, isPublic, pageId, t, togglePageMode, trash]);

  const onSwitchToPageMode = useCallback(() => {
    if (currentMode === 'page' || isPublic) {
      return;
    }
    switchToPageMode(pageId);
    toast(t['com.affine.toastMessage.pageMode']());
  }, [currentMode, isPublic, pageId, switchToPageMode, t]);

  const onSwitchToEdgelessMode = useCallback(() => {
    if (currentMode === 'edgeless' || isPublic) {
      return;
    }
    switchToEdgelessMode(pageId);
    toast(t['com.affine.toastMessage.edgelessMode']());
  }, [currentMode, isPublic, pageId, switchToEdgelessMode, t]);

  const shouldHide = useCallback(
    (mode: PageMode) =>
      (trash && currentMode !== mode) || (isPublic && publicMode !== mode),
    [currentMode, isPublic, publicMode, trash]
  );

  const shouldActive = useCallback(
    (mode: PageMode) => (isPublic ? false : currentMode === mode),
    [currentMode, isPublic]
  );

  return (
    <Tooltip
      content={<TooltipContent />}
      options={{
        hidden: isPublic || trash,
      }}
    >
      <StyledEditorModeSwitch
        style={style}
        switchLeft={currentMode === 'page'}
        showAlone={trash || isPublic}
      >
        <PageSwitchItem
          data-testid="switch-page-mode-button"
          active={shouldActive('page')}
          hide={shouldHide('page')}
          trash={trash}
          onClick={onSwitchToPageMode}
        />
        <EdgelessSwitchItem
          data-testid="switch-edgeless-mode-button"
          active={shouldActive('edgeless')}
          hide={shouldHide('edgeless')}
          trash={trash}
          onClick={onSwitchToEdgelessMode}
        />
      </StyledEditorModeSwitch>
    </Tooltip>
  );
};
