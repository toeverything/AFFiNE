import { toReactNode } from '@affine/component';
import { BlockComponent } from '@blocksuite/affine/std';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ActivePeekView } from '../entities/peek-view';
import { PeekViewService } from '../services/peek-view';
import { AIChatBlockPeekView } from './ai-chat-block-peek-view';
import { AttachmentPreviewPeekView } from './attachment-preview';
import { DocPeekPreview } from './doc-preview';
import {
  GenericImagePreviewModalWithClose,
  ImagePreviewPeekView,
} from './image-preview';
import {
  PeekViewModalContainer,
  type PeekViewModalContainerProps,
} from './modal-container';
import {
  AttachmentPeekViewControls,
  DefaultPeekViewControls,
  DocPeekViewControls,
} from './peek-view-controls';

function renderPeekView({ info }: ActivePeekView, animating?: boolean) {
  if (info.type === 'template') {
    return toReactNode(info.template);
  }
  if (info.type === 'doc') {
    return <DocPeekPreview docRef={info.docRef} animating={animating} />;
  }

  if (info.type === 'attachment' && info.docRef.blockIds?.[0]) {
    return (
      <AttachmentPreviewPeekView
        docId={info.docRef.docId}
        blockId={info.docRef.blockIds?.[0]}
      />
    );
  }

  if (info.type === 'image' && info.docRef.blockIds?.[0]) {
    return (
      <ImagePreviewPeekView
        docId={info.docRef.docId}
        blockId={info.docRef.blockIds?.[0]}
      />
    );
  }

  if (info.type === 'image-list') {
    return <GenericImagePreviewModalWithClose {...info.data} />;
  }

  if (info.type === 'ai-chat-block') {
    return <AIChatBlockPeekView model={info.model} host={info.host} />;
  }

  return null; // unreachable
}

const renderControls = ({ info }: ActivePeekView) => {
  if (info.type === 'doc') {
    return <DocPeekViewControls docRef={info.docRef} />;
  }

  if (info.type === 'attachment') {
    return <AttachmentPeekViewControls docRef={info.docRef} />;
  }

  if (info.type === 'image' || info.type === 'image-list') {
    return null; // image controls are rendered in the image preview
  }

  return <DefaultPeekViewControls />;
};

const getMode = (info: ActivePeekView['info']) => {
  if (info.type === 'image' || info.type === 'image-list') {
    return 'full';
  }
  return 'fit';
};

const getRendererProps = (
  activePeekView?: ActivePeekView,
  animating?: boolean
): Partial<PeekViewModalContainerProps> | undefined => {
  if (!activePeekView) {
    return;
  }

  const preview = renderPeekView(activePeekView, animating);
  const controls = renderControls(activePeekView);
  return {
    children: preview,
    controls,
    target:
      activePeekView?.target.element instanceof HTMLElement
        ? activePeekView.target.element
        : undefined,
    mode: getMode(activePeekView.info),
    animation: 'fadeBottom',
    dialogFrame: !['image', 'image-list'].includes(activePeekView.info.type),
  };
};

export const PeekViewManagerModal = () => {
  const peekViewEntity = useService(PeekViewService).peekView;
  const activePeekView = useLiveData(peekViewEntity.active$);
  const show = useLiveData(peekViewEntity.show$);

  const [animating, setAnimating] = useState(false);

  const onAnimationStart = useCallback(() => {
    console.log('onAnimationStart');
    setAnimating(true);
  }, []);

  const onAnimationEnd = useCallback(() => {
    setAnimating(false);
  }, []);

  const renderProps = useMemo(() => {
    if (!activePeekView) {
      return;
    }
    return getRendererProps(activePeekView, animating);
  }, [activePeekView, animating]);

  useEffect(() => {
    const subscription = peekViewEntity.show$.subscribe(() => {
      if (activePeekView?.target.element instanceof BlockComponent) {
        activePeekView.target.element.requestUpdate();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [activePeekView, peekViewEntity]);

  return (
    <PeekViewModalContainer
      {...renderProps}
      animation={show?.animation ? renderProps?.animation : 'none'}
      open={!!show?.value && !!renderProps}
      onOpenChange={open => {
        if (!open) {
          peekViewEntity.close();
        }
      }}
      onAnimationStart={onAnimationStart}
      onAnimationEnd={onAnimationEnd}
    >
      {renderProps?.children}
    </PeekViewModalContainer>
  );
};
