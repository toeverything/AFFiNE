import { BlockStdScope } from '@blocksuite/block-std';
import type { EdgelessRootService, FrameBlockModel } from '@blocksuite/blocks';
import { SpecProvider } from '@blocksuite/blocks';
import { Bound } from '@blocksuite/global/utils';
import type { Doc } from '@blocksuite/store';
import { useCallback, useEffect, useRef } from 'react';

import { snapshotContainer, snapshotTitle } from '../style.css';
import { type DocName, getDocByName } from './docs';

interface Props {
  title: string;
  docName: DocName;
  height?: number;
}

function getFrameBlock(doc: Doc) {
  const blocks = doc.getBlocksByFlavour('affine:frame');
  return blocks.length !== 0 ? (blocks[0].model as FrameBlockModel) : null;
}

const boundMap = new Map<DocName, Bound>();

export const EdgelessSnapshot = (props: Props) => {
  const { title, docName, height = 180 } = props;
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const renderEditor = useCallback(async () => {
    if (!wrapperRef.current) return;
    const doc = await getDocByName(docName);
    if (!doc) return;

    const editorHost = new BlockStdScope({
      doc,
      extensions: SpecProvider.getInstance().getSpec('edgeless:preview').value,
    }).render();

    const edgelessService = editorHost.std.getService(
      'affine:page'
    ) as EdgelessRootService;

    // refresh viewport
    edgelessService.specSlots.viewConnected.once(({ component }) => {
      const edgelessBlock = component as any;
      edgelessBlock.editorViewportSelector = 'ref-viewport';
      edgelessBlock.service.viewport.sizeUpdated.once(() => {
        const frame = getFrameBlock(doc);
        if (frame) {
          boundMap.set(docName, Bound.deserialize(frame.xywh));
          doc.deleteBlock(frame);
        }
        const bound = boundMap.get(docName);
        bound && edgelessService.viewport.setViewportByBound(bound);
      });
    });

    wrapperRef.current.append(editorHost);
  }, [docName]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    renderEditor();
  }, [renderEditor]);

  return (
    <div className={snapshotContainer}>
      <div className={snapshotTitle}>{title}</div>
      <div
        ref={wrapperRef}
        style={{
          position: 'relative',
          pointerEvents: 'none',
          userSelect: 'none',
          overflow: 'hidden',
          height,
        }}
      ></div>
    </div>
  );
};
