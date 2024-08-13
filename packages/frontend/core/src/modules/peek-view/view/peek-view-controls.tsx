import { IconButton } from '@affine/component';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { useI18n } from '@affine/i18n';
import {
  CloseIcon,
  ExpandFullIcon,
  OpenInNewIcon,
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
import * as styles from './peek-view-controls.css';
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
    <IconButton
      variant="solid"
      tooltip={name}
      data-testid="peek-view-control"
      data-action-name={nameKey}
      size="20"
      onClick={handleClick}
      icon={icon}
      className={styles.button}
    />
  );
};

type DocPeekViewControlsProps = HTMLAttributes<HTMLDivElement> & {
  docId: string;
  blockId?: string;
  mode?: DocMode;
};

export const DefaultPeekViewControls = ({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) => {
  const peekView = useService(PeekViewService).peekView;
  const t = useI18n();
  const controls = useMemo(() => {
    return [
      {
        icon: <CloseIcon />,
        nameKey: 'close',
        name: t['com.affine.peek-view-controls.close'](),
        onClick: () => peekView.close(),
      },
    ].filter((opt): opt is ControlButtonProps => Boolean(opt));
  }, [peekView, t]);
  return (
    <div {...rest} className={clsx(styles.root, className)}>
      {controls.map(option => (
        <ControlButton key={option.nameKey} {...option} />
      ))}
    </div>
  );
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
  const t = useI18n();
  const { doc, workspace } = useDoc(docId);
  const controls = useMemo(() => {
    return [
      {
        icon: <CloseIcon />,
        nameKey: 'close',
        name: t['com.affine.peek-view-controls.close'](),
        onClick: () => peekView.close(),
      },
      {
        icon: <ExpandFullIcon />,
        name: t['com.affine.peek-view-controls.open-doc'](),
        nameKey: 'open',
        onClick: () => {
          // TODO(@Peng): for frame blocks, we should mimic "view in edgeless" button behavior
          blockId
            ? jumpToPageBlock(workspace.id, docId, blockId)
            : workbench.openDoc(docId);
          if (mode) {
            doc?.setMode(mode);
          }
          peekView.close('none');
        },
      },
      {
        icon: <OpenInNewIcon />,
        nameKey: 'new-tab',
        name: t['com.affine.peek-view-controls.open-doc-in-new-tab'](),
        onClick: () => {
          workbench.openDoc(docId, { at: 'new-tab' });
          peekView.close('none');
        },
      },
      environment.isDesktop && {
        icon: <SplitViewIcon />,
        nameKey: 'split-view',
        name: t['com.affine.peek-view-controls.open-doc-in-split-view'](),
        onClick: () => {
          workbench.openDoc(docId, { at: 'beside' });
          peekView.close('none');
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
