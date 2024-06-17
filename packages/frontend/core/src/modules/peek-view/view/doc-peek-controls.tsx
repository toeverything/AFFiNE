import { IconButton, Tooltip } from '@affine/component';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  CloseIcon,
  DualLinkIcon,
  ExpandFullIcon,
  SplitViewIcon,
} from '@blocksuite/icons/rc';
import { type DocMode, useService } from '@toeverything/infra';
import { clsx } from 'clsx';
import {
  type HTMLAttributes,
  type MouseEventHandler,
  type ReactElement,
  useCallback,
  useMemo,
} from 'react';

import { WorkbenchService } from '../../workbench';
import { PeekViewService } from '../services/peek-view';
import * as styles from './doc-peek-controls.css';
import { useDoc } from './utils';

type ControlButtonProps = {
  nameKey: string;
  icon: ReactElement;
  name: string;
  onClick: () => void;
};

export const ControlButton = ({
  icon,
  nameKey,
  name,
  onClick,
}: ControlButtonProps) => {
  const handleClick: MouseEventHandler = useCallback(
    e => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    },
    [onClick]
  );

  return (
    <Tooltip content={name}>
      <IconButton
        data-testid="peek-view-control"
        data-action-name={nameKey}
        size="large"
        type="default"
        onClick={handleClick}
        icon={icon}
        className={styles.button}
        withoutHoverStyle
      />
    </Tooltip>
  );
};

type DocPeekViewControlsProps = HTMLAttributes<HTMLDivElement> & {
  docId: string;
  blockId?: string;
  mode?: DocMode;
};

export const DocPeekViewControls = ({
  docId,
  blockId,
  mode,
  className,
  ...rest
}: DocPeekViewControlsProps) => {
  const peekView = useService(PeekViewService).peekView;
  const workbench = useService(WorkbenchService).workbench;
  const { jumpToPageBlock } = useNavigateHelper();
  const t = useAFFiNEI18N();
  const { doc, workspace } = useDoc(docId);
  const controls = useMemo(() => {
    return [
      {
        icon: <CloseIcon />,
        nameKey: 'close',
        name: t['com.affine.peek-view-controls.close'](),
        onClick: peekView.close,
      },
      {
        icon: <ExpandFullIcon />,
        name: t['com.affine.peek-view-controls.open-doc'](),
        nameKey: 'open',
        onClick: () => {
          // todo: for frame blocks, we should mimic "view in edgeless" button behavior
          blockId
            ? jumpToPageBlock(workspace.id, docId, blockId)
            : workbench.openPage(docId);
          if (mode) {
            doc?.setMode(mode);
          }
          peekView.close();
        },
      },
      environment.isDesktop && {
        icon: <SplitViewIcon />,
        nameKey: 'split-view',
        name: t['com.affine.peek-view-controls.open-doc-in-split-view'](),
        onClick: () => {
          workbench.openPage(docId, { at: 'beside' });
          peekView.close();
        },
      },
      !environment.isDesktop && {
        icon: <DualLinkIcon />,
        nameKey: 'new-tab',
        name: t['com.affine.peek-view-controls.open-doc-in-new-tab'](),
        onClick: () => {
          window.open(
            `/workspace/${workspace.id}/${docId}#${blockId ?? ''}`,
            '_blank'
          );
          peekView.close();
        },
      },
    ].filter((opt): opt is ControlButtonProps => Boolean(opt));
  }, [
    blockId,
    doc,
    docId,
    jumpToPageBlock,
    mode,
    peekView,
    t,
    workbench,
    workspace.id,
  ]);
  return (
    <div {...rest} className={clsx(styles.root, className)}>
      {controls.map(option => (
        <ControlButton key={option.nameKey} {...option} />
      ))}
    </div>
  );
};
