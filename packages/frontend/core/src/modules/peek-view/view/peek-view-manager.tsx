import { useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

import type { ActivePeekView } from '../entities/peek-view';
import { PeekViewService } from '../services/peek-view';
import { DocPeekViewControls } from './doc-peek-controls';
import { DocPeekView, SurfaceRefPeekView } from './doc-peek-view';
import { PeekViewModalContainer } from './modal-container';

function renderPeekView({ info }: ActivePeekView) {
  if (info.mode === 'edgeless' && info.xywh) {
    return <SurfaceRefPeekView docId={info.docId} xywh={info.xywh} />;
  }

  return (
    <DocPeekView mode={info.mode} docId={info.docId} blockId={info.blockId} />
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

  const preview = useMemo(() => {
    return activePeekView ? renderPeekView(activePeekView) : null;
  }, [activePeekView]);

  const controls = useMemo(() => {
    return activePeekView ? renderControls(activePeekView) : null;
  }, [activePeekView]);

  return (
    <PeekViewModalContainer
      open={show}
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
    >
      {preview}
    </PeekViewModalContainer>
  );
};
