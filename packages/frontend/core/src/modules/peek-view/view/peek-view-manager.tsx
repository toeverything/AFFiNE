import { toReactNode } from '@affine/component';
import { BlockElement } from '@blocksuite/block-std';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useMemo } from 'react';

import type { ActivePeekView } from '../entities/peek-view';
import { PeekViewService } from '../services/peek-view';
import { DocPeekPreview } from './doc-peek-view';
import { PeekViewModalContainer } from './modal-container';
import {
  DefaultPeekViewControls,
  DocPeekViewControls,
} from './peek-view-controls';

function renderPeekView({ info, template }: ActivePeekView) {
  if (template) {
    return toReactNode(template);
  }

  if (!info) {
    return null;
  }

  return (
    <DocPeekPreview
      mode={info.mode}
      xywh={info.xywh}
      docId={info.docId}
      blockId={info.blockId}
    />
  );
}

const renderControls = ({ info }: ActivePeekView) => {
  if (info && 'docId' in info) {
    return (
      <DocPeekViewControls
        mode={info.mode}
        docId={info.docId}
        blockId={info.docId}
      />
    );
  }

  return <DefaultPeekViewControls />;
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
    >
      {preview}
    </PeekViewModalContainer>
  );
};
