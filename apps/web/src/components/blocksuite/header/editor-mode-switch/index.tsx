import { EdgelessIcon, PaperIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { CSSProperties } from 'react';

import {
  usePageMeta,
  usePageMetaHelper,
} from '../../../../hooks/use-page-meta';
import { BlockSuiteWorkspace } from '../../../../shared';
import { StyledEditorModeSwitch, StyledSwitchItem } from './style';

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
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const pageMeta = usePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  assertExists(pageMeta);
  const { trash, mode = 'page' } = pageMeta;

  return (
    <StyledEditorModeSwitch
      style={style}
      switchLeft={mode === 'page'}
      showAlone={trash}
    >
      <StyledSwitchItem
        data-testid="switch-page-mode-button"
        active={mode === 'page'}
        hide={trash && mode !== 'page'}
        onClick={() => {
          setPageMeta(pageId, { mode: 'page' });
        }}
      >
        <PaperIcon />
      </StyledSwitchItem>
      <StyledSwitchItem
        data-testid="switch-edgeless-mode-button"
        active={mode === 'edgeless'}
        hide={trash && mode !== 'edgeless'}
        onClick={() => {
          setPageMeta(pageId, { mode: 'edgeless' });
        }}
      >
        <EdgelessIcon />
      </StyledSwitchItem>
    </StyledEditorModeSwitch>
  );
};
