import { Tooltip } from '@affine/component/ui/tooltip';
import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  Doc,
  type PageMode,
  useLiveData,
  useService,
} from '@toeverything/infra';
import type { CSSProperties } from 'react';
import { useCallback, useEffect } from 'react';

import type { DocCollection } from '../../../shared';
import { toast } from '../../../utils';
import { StyledEditorModeSwitch, StyledKeyboardItem } from './style';
import { EdgelessSwitchItem, PageSwitchItem } from './switch-items';

export type EditorModeSwitchProps = {
  // todo(himself65): combine these two properties
  docCollection: DocCollection;
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
  docCollection,
  pageId,
  isPublic,
  publicMode,
}: EditorModeSwitchProps) => {
  const t = useAFFiNEI18N();
  const pageMeta = useBlockSuiteDocMeta(docCollection).find(
    meta => meta.id === pageId
  );
  const trash = pageMeta?.trash ?? false;
  const page = useService(Doc);

  const currentMode = useLiveData(page.mode);

  useEffect(() => {
    if (trash || isPublic) {
      return;
    }
    const keydown = (e: KeyboardEvent) => {
      if (e.code === 'KeyS' && e.altKey) {
        e.preventDefault();
        page.toggleMode();
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
  }, [currentMode, isPublic, page, pageId, t, trash]);

  const onSwitchToPageMode = useCallback(() => {
    if (currentMode === 'page' || isPublic) {
      return;
    }
    page.setMode('page');
    toast(t['com.affine.toastMessage.pageMode']());
  }, [currentMode, isPublic, page, t]);

  const onSwitchToEdgelessMode = useCallback(() => {
    if (currentMode === 'edgeless' || isPublic) {
      return;
    }
    page.setMode('edgeless');
    toast(t['com.affine.toastMessage.edgelessMode']());
  }, [currentMode, isPublic, page, t]);

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
