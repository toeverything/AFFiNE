import { toReactNode } from '@affine/component';
import { AIChatBlockPeekViewTemplate } from '@affine/core/blocksuite/presets/ai';
import { BlockComponent } from '@blocksuite/block-std';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useMemo } from 'react';

import type { ActivePeekView } from '../entities/peek-view';
import { PeekViewService } from '../services/peek-view';
import { DocPeekPreview } from './doc-preview';
import { ImagePreviewPeekView } from './image-preview';
import {
  PeekViewModalContainer,
  type PeekViewModalContainerProps,
} from './modal-container';
import {
  DefaultPeekViewControls,
  DocPeekViewControls,
} from './peek-view-controls';

function renderPeekView({ info }: ActivePeekView) {
  if (info.type === 'template') {
    return toReactNode(info.template);
  }
  if (info.type === 'doc') {
    return (
      <DocPeekPreview
        mode={info.mode}
        xywh={info.xywh}
        docId={info.docId}
        blockIds={info.blockIds}
        elementIds={info.elementIds}
      />
    );
  }

  if (info.type === 'image') {
    return (
      <ImagePreviewPeekView docId={info.docId} blockId={info.blockIds[0]} />
    );
  }

  if (info.type === 'ai-chat-block') {
    const template = AIChatBlockPeekViewTemplate(info.model, info.host);
    return toReactNode(template);
  }

  return null; // unreachable
}

const renderControls = ({ info }: ActivePeekView) => {
  if (info.type === 'doc') {
    return (
      <DocPeekViewControls
        mode={info.mode}
        docId={info.docId}
        blockIds={info.blockIds}
        elementIds={info.elementIds}
      />
    );
  }

  if (info.type === 'image') {
    return null; // image controls are rendered in the image preview
  }

  return <DefaultPeekViewControls />;
};

const getMode = (info: ActivePeekView['info']) => {
  if (info.type === 'image') {
    return 'full';
  }
  return 'fit';
};

const getRendererProps = (
  activePeekView?: ActivePeekView
): Partial<PeekViewModalContainerProps> | undefined => {
  if (!activePeekView) {
    return;
  }

  const preview = renderPeekView(activePeekView);
  const controls = renderControls(activePeekView);
  return {
    children: preview,
    controls,
    target:
      activePeekView?.target instanceof HTMLElement
        ? activePeekView.target
        : undefined,
    mode: getMode(activePeekView.info),
    dialogFrame: activePeekView.info.type !== 'image',
  };
};

export const PeekViewManagerModal = () => {
  const peekViewEntity = useService(PeekViewService).peekView;
  const activePeekView = useLiveData(peekViewEntity.active$);
  const show = useLiveData(peekViewEntity.show$);

  const renderProps = useMemo(() => {
    if (!activePeekView) {
      return;
    }
    return getRendererProps(activePeekView);
  }, [activePeekView]);

  useEffect(() => {
    const subscription = peekViewEntity.show$.subscribe(() => {
      if (activePeekView?.target instanceof BlockComponent) {
        activePeekView.target.requestUpdate();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [activePeekView, peekViewEntity]);

  return (
    <PeekViewModalContainer
      {...renderProps}
      open={!!show?.value && !!renderProps}
      animation={show?.animation || 'none'}
      onOpenChange={open => {
        if (!open) {
          peekViewEntity.close();
        }
      }}
    >
      {renderProps?.children}
    </PeekViewModalContainer>
  );
};
