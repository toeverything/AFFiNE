import { assertExists } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtomValue, useSetAtom } from 'jotai';
import type { CSSProperties } from 'react';

import { workspacePreferredModeAtom } from '../../../../atoms';
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
  const currentMode =
    useAtomValue(workspacePreferredModeAtom)[pageId] ?? 'page';
  const setMode = useSetAtom(workspacePreferredModeAtom);
  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  assertExists(pageMeta);
  const { trash } = pageMeta;

  return (
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
          setMode(mode => ({ ...mode, [pageMeta.id]: 'page' }));
          toast('Page mode');
        }}
      />
      <EdgelessSwitchItem
        data-testid="switch-edgeless-mode-button"
        active={currentMode === 'edgeless'}
        hide={trash && currentMode !== 'edgeless'}
        onClick={() => {
          setMode(mode => ({ ...mode, [pageMeta.id]: 'edgeless' }));
          toast('Edgeless mode');
        }}
      />
    </StyledEditorModeSwitch>
  );
};
