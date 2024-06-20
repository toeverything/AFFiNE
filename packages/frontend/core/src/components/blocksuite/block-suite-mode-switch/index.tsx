import { Tooltip } from '@affine/component/ui/tooltip';
import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useI18n } from '@affine/i18n';
import {
  type DocMode,
  DocService,
  useLiveData,
  useService,
} from '@toeverything/infra';
import type { CSSProperties } from 'react';
import { useCallback, useEffect } from 'react';

import type { DocCollection } from '../../../shared';
import { mixpanel, toast } from '../../../utils';
import { StyledEditorModeSwitch, StyledKeyboardItem } from './style';
import { EdgelessSwitchItem, PageSwitchItem } from './switch-items';

export type EditorModeSwitchProps = {
  // todo(himself65): combine these two properties
  docCollection: DocCollection;
  pageId: string;
  style?: CSSProperties;
  isPublic?: boolean;
  publicMode?: DocMode;
};
const TooltipContent = () => {
  const t = useI18n();
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
  const t = useI18n();
  const pageMeta = useBlockSuiteDocMeta(docCollection).find(
    meta => meta.id === pageId
  );
  const trash = pageMeta?.trash ?? false;
  const doc = useService(DocService).doc;

  const currentMode = useLiveData(doc.mode$);

  useEffect(() => {
    if (trash || isPublic) {
      return;
    }
    const keydown = (e: KeyboardEvent) => {
      if (e.code === 'KeyS' && e.altKey) {
        e.preventDefault();
        doc.toggleMode();
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
  }, [currentMode, isPublic, doc, pageId, t, trash]);

  const onSwitchToPageMode = useCallback(() => {
    mixpanel.track('Button', {
      resolve: 'SwitchToPageMode',
    });
    if (currentMode === 'page' || isPublic) {
      return;
    }
    doc.setMode('page');
    toast(t['com.affine.toastMessage.pageMode']());
  }, [currentMode, isPublic, doc, t]);

  const onSwitchToEdgelessMode = useCallback(() => {
    mixpanel.track('Button', {
      resolve: 'SwitchToEdgelessMode',
    });
    if (currentMode === 'edgeless' || isPublic) {
      return;
    }
    doc.setMode('edgeless');
    toast(t['com.affine.toastMessage.edgelessMode']());
  }, [currentMode, isPublic, doc, t]);

  const shouldHide = useCallback(
    (mode: DocMode) =>
      (trash && currentMode !== mode) || (isPublic && publicMode !== mode),
    [currentMode, isPublic, publicMode, trash]
  );

  const shouldActive = useCallback(
    (mode: DocMode) => (isPublic ? false : currentMode === mode),
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
