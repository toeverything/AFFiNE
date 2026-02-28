import { IconButton, notify } from '@affine/component';
import { copyTextToClipboard } from '@affine/core/utils/clipboard';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import type { DocMode } from '@blocksuite/affine/model';
import {
  CloseIcon,
  ExpandFullIcon,
  InformationIcon,
  LinkIcon,
  OpenInNewIcon,
  SplitViewIcon,
} from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { clsx } from 'clsx';
import {
  type HTMLAttributes,
  type MouseEventHandler,
  type ReactElement,
  type SVGAttributes,
  useCallback,
  useEffect,
  useMemo,
} from 'react';

import { ServerService } from '../../cloud';
import { WorkspaceDialogService } from '../../dialogs';
import { DocsService } from '../../doc/services/docs';
import { toDocSearchParams } from '../../navigation';
import { WorkbenchService } from '../../workbench';
import type {
  AttachmentPeekViewInfo,
  DocReferenceInfo,
} from '../entities/peek-view';
import { PeekViewService } from '../services/peek-view';
import * as styles from './peek-view-controls.css';

type ControlButtonProps = {
  nameKey: string;
  icon: ReactElement<SVGAttributes<SVGElement>>;
  name: string;
  onClick: () => void;
  enabled: boolean;
};

const filterByEnabled = (props: ControlButtonProps) => props.enabled;

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
  mode?: DocMode;
  docRef: DocReferenceInfo;
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
        nameKey: 'close',
        name: t['com.affine.peek-view-controls.close'](),
        icon: <CloseIcon />,
        onClick: () => peekView.close(),
        enabled: true,
      },
    ].filter(filterByEnabled);
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
  docRef,
  className,
  ...rest
}: DocPeekViewControlsProps) => {
  const peekView = useService(PeekViewService).peekView;
  const workbench = useService(WorkbenchService).workbench;
  const t = useI18n();
  const workspaceDialogService = useService(WorkspaceDialogService);
  const serverService = useService(ServerService);
  const docsService = useService(DocsService);
  const controls = useMemo(() => {
    return [
      {
        nameKey: 'close',
        name: t['com.affine.peek-view-controls.close'](),
        icon: <CloseIcon />,
        onClick: () => peekView.close(),
        enabled: true,
      },
      {
        nameKey: 'open',
        name: t['com.affine.peek-view-controls.open-doc'](),
        icon: <ExpandFullIcon />,
        onClick: () => {
          workbench.openDoc(docRef);
          peekView.close(false);
        },
        enabled: true,
      },
      {
        nameKey: 'new-tab',
        name: t['com.affine.peek-view-controls.open-doc-in-new-tab'](),
        icon: <OpenInNewIcon />,
        onClick: () => {
          workbench.openDoc(docRef, { at: 'new-tab' });
          peekView.close(false);
        },
        enabled: true,
      },
      {
        nameKey: 'split-view',
        name: t['com.affine.peek-view-controls.open-doc-in-split-view'](),
        icon: <SplitViewIcon />,
        onClick: () => {
          workbench.openDoc(docRef, { at: 'beside' });
          peekView.close(false);
        },
        enabled: BUILD_CONFIG.isElectron,
      },
      {
        nameKey: 'copy-link',
        name: t['com.affine.peek-view-controls.copy-link'](),
        icon: <LinkIcon />,
        onClick: async () => {
          const preferredMode = docsService.list.getPrimaryMode(docRef.docId);
          const search = toDocSearchParams({
            mode: docRef.mode || preferredMode,
            blockIds: docRef.blockIds,
            elementIds: docRef.elementIds,
            xywh: docRef.xywh,
          });
          const url = new URL(
            workbench.basename$.value + '/' + docRef.docId,
            serverService.server.baseUrl
          );
          if (search?.size) url.search = search.toString();
          await copyTextToClipboard(url.toString());
          notify.success({ title: t['Copied link to clipboard']() });
        },
        enabled: true,
      },
      {
        nameKey: 'info',
        name: t['com.affine.peek-view-controls.open-info'](),
        icon: <InformationIcon />,
        onClick: () => {
          workspaceDialogService.open('doc-info', { docId: docRef.docId });
        },
        enabled: true,
      },
    ].filter(filterByEnabled);
  }, [
    t,
    peekView,
    workbench,
    docRef,
    docsService.list,
    serverService.server.baseUrl,
    workspaceDialogService,
  ]);
  return (
    <div {...rest} className={clsx(styles.root, className)}>
      {controls.map(option => (
        <ControlButton key={option.nameKey} {...option} />
      ))}
    </div>
  );
};

type AttachmentPeekViewControls = HTMLAttributes<HTMLDivElement> & {
  mode?: DocMode;
  docRef: AttachmentPeekViewInfo['docRef'];
};

export const AttachmentPeekViewControls = ({
  docRef,
  className,
  ...rest
}: AttachmentPeekViewControls) => {
  const { docId, blockIds: [blockId] = [], filetype: type } = docRef;
  const peekView = useService(PeekViewService).peekView;
  const workbench = useService(WorkbenchService).workbench;
  const t = useI18n();

  const controls = useMemo(() => {
    const controls = [
      {
        nameKey: 'close',
        name: t['com.affine.peek-view-controls.close'](),
        icon: <CloseIcon />,
        onClick: () => peekView.close(),
        enabled: true,
      },
    ];
    if (!type) return controls;

    return [
      ...controls,
      // TODO(@fundon): needs to be implemented on mobile
      {
        nameKey: 'open',
        name: t['com.affine.peek-view-controls.open-attachment'](),
        icon: <ExpandFullIcon />,
        onClick: () => {
          workbench.openAttachment(docId, blockId);
          peekView.close(false);

          track.$.attachment.$.openAttachmentInFullscreen({ type });
        },
        enabled: BUILD_CONFIG.isDesktopEdition,
      },
      {
        nameKey: 'new-tab',
        name: t['com.affine.peek-view-controls.open-attachment-in-new-tab'](),
        icon: <OpenInNewIcon />,
        onClick: () => {
          workbench.openAttachment(docId, blockId, { at: 'new-tab' });
          peekView.close(false);

          track.$.attachment.$.openAttachmentInNewTab({ type });
        },
        enabled: true,
      },
      {
        nameKey: 'split-view',
        name: t[
          'com.affine.peek-view-controls.open-attachment-in-split-view'
        ](),
        icon: <SplitViewIcon />,
        onClick: () => {
          workbench.openAttachment(docId, blockId, { at: 'beside' });
          peekView.close(false);

          track.$.attachment.$.openAttachmentInSplitView({ type });
        },
        enabled: BUILD_CONFIG.isElectron,
      },
    ].filter(filterByEnabled);
  }, [t, peekView, workbench, docId, blockId, type]);

  useEffect(() => {
    if (type === undefined) return;

    track.$.attachment.$.openAttachmentInPeekView({ type });
  }, [type]);

  return (
    <div {...rest} className={clsx(styles.root, className)}>
      {controls.map(option => (
        <ControlButton key={option.nameKey} {...option} />
      ))}
    </div>
  );
};
