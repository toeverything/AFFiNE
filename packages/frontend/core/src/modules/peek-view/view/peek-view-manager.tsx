import { BlockElement } from '@blocksuite/block-std';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useMemo, useRef } from 'react';

import type { ActivePeekView } from '../entities/peek-view';
import { PeekViewService } from '../services/peek-view';
import { DocPeekViewControls } from './doc-peek-controls';
import type { DocPreviewRef, SurfaceRefPeekViewRef } from './doc-peek-view';
import { DocPeekView, SurfaceRefPeekView } from './doc-peek-view';
import { PeekViewModalContainer } from './modal-container';

function renderPeekView(
  { info }: ActivePeekView,
  refCallback: (editor: SurfaceRefPeekViewRef | DocPreviewRef | null) => void
) {
  if (info.mode === 'edgeless' && info.xywh) {
    return (
      <SurfaceRefPeekView
        ref={refCallback}
        docId={info.docId}
        xywh={info.xywh}
      />
    );
  }

  return (
    <DocPeekView
      ref={refCallback}
      mode={info.mode}
      docId={info.docId}
      blockId={info.blockId}
    />
  );
}

const renderControls = ({ info }: ActivePeekView) => {
  return (
    <DocPeekViewControls
      mode={info.mode}
      docId={info.docId}
      blockId={info.docId}
    />
  );
};

export const PeekViewManagerModal = () => {
  const peekViewEntity = useService(PeekViewService).peekView;
  const activePeekView = useLiveData(peekViewEntity.active$);
  const show = useLiveData(peekViewEntity.show$);
  const peekViewRef = useRef<SurfaceRefPeekViewRef | DocPreviewRef | null>(
    null
  );

  const preview = useMemo(() => {
    return activePeekView
      ? renderPeekView(activePeekView, editor => {
          peekViewRef.current = editor;
        })
      : null;
  }, [activePeekView]);

  const controls = useMemo(() => {
    return activePeekView ? renderControls(activePeekView) : null;
  }, [activePeekView]);

  useEffect(() => {
    const subscription = peekViewEntity.show$.subscribe(() => {
      if (activePeekView?.target instanceof BlockElement) {
        activePeekView.target.requestUpdate();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [activePeekView, peekViewEntity]);

  return (
    <PeekViewModalContainer
      open={show && !!preview}
      target={
        activePeekView?.target instanceof HTMLElement
          ? activePeekView.target
          : undefined
      }
      controls={controls}
      onOpenChange={open => {
        if (!open) {
          peekViewEntity.close();
        }
      }}
      onAnimateEnd={() => {
        peekViewRef.current?.fitViewportToTarget();
      }}
    >
      {preview}
    </PeekViewModalContainer>
  );
};
