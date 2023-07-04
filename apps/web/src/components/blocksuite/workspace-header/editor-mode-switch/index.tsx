import { Tooltip } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtom } from 'jotai';
import type { CSSProperties } from 'react';
import { useEffect } from 'react';

import { pageSettingFamily } from '../../../../atoms';
import type { BlockSuiteWorkspace } from '../../../../shared';
import { toast } from '../../../../utils';
import { StyledEditorModeSwitch } from './style';
import { EdgelessSwitchItem, PageSwitchItem } from './switch-items';

export type EditorModeSwitchProps = {
  // todo(himself65): combine these two properties
  blockSuiteWorkspace: BlockSuiteWorkspace;
  pageId: string;
  style?: CSSProperties;
};

export const EditorModeSwitch = ({
  style,
  blockSuiteWorkspace,
  pageId,
}: EditorModeSwitchProps) => {
  const [setting, setSetting] = useAtom(pageSettingFamily(pageId));
  const currentMode = setting?.mode ?? 'page';
  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  const t = useAFFiNEI18N();
  assertExists(pageMeta);
  const { trash } = pageMeta;
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.key === 's' && e.metaKey) || (e.key === 's' && e.altKey)) {
        e.preventDefault();
        setSetting(setting => {
          if (setting?.mode !== 'page') {
            toast(t['com.affine.pageMode']());
            return { ...setting, mode: 'page' };
          } else {
            toast(t['com.affine.edgelessMode']());
            return { ...setting, mode: 'edgeless' };
          }
        });
      }
    };
    document.addEventListener('keydown', keydown, { capture: true });
    return () =>
      document.removeEventListener('keydown', keydown, { capture: true });
  }, [setSetting, t]);
  return (
    <Tooltip content={'Switch ⌘ + S'}>
      <StyledEditorModeSwitch
        style={style}
        switchLeft={currentMode === 'page'}
        showAlone={trash}
      >
        <PageSwitchItem
          data-testid="switch-page-mode-button"
          active={currentMode === 'page'}
          hide={trash && currentMode !== 'page'}
          onClick={() => {
            setSetting(setting => {
              if (setting?.mode !== 'page') {
                toast(t['com.affine.pageMode']());
              }
              return { ...setting, mode: 'page' };
            });
          }}
        />
        <EdgelessSwitchItem
          data-testid="switch-edgeless-mode-button"
          active={currentMode === 'edgeless'}
          hide={trash && currentMode !== 'edgeless'}
          onClick={() => {
            setSetting(setting => {
              if (setting?.mode !== 'edgeless') {
                toast(t['com.affine.edgelessMode']());
              }
              return { ...setting, mode: 'edgeless' };
            });
          }}
        />
      </StyledEditorModeSwitch>
    </Tooltip>
  );
};
