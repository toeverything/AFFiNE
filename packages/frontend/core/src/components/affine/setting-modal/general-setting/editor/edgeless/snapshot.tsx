import { Skeleton } from '@affine/component';
import type { EditorSettingSchema } from '@affine/core/modules/editor-settting';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import type { EditorHost } from '@blocksuite/affine/block-std';
import { BlockStdScope } from '@blocksuite/affine/block-std';
import type { GfxPrimitiveElementModel } from '@blocksuite/affine/block-std/gfx';
import type { EdgelessRootService } from '@blocksuite/affine/blocks';
import { SpecProvider } from '@blocksuite/affine/blocks';
import { Bound } from '@blocksuite/affine/global/utils';
import type { Block, Doc } from '@blocksuite/affine/store';
import { useFramework } from '@toeverything/infra';
import { isEqual } from 'lodash-es';
import { useCallback, useEffect, useRef } from 'react';
import { map, pairwise } from 'rxjs';

import {
  snapshotContainer,
  snapshotLabel,
  snapshotSkeleton,
  snapshotTitle,
} from '../style.css';
import { type DocName, getDocByName } from './docs';
import { getFrameBlock } from './utils';

interface Props {
  title: string;
  docName: DocName;
  keyName: keyof EditorSettingSchema;
  height?: number;
  getElements: (doc: Doc) => Array<Block | GfxPrimitiveElementModel>;
  firstUpdate?: (doc: Doc, editorHost: EditorHost) => void;
  children?: React.ReactElement;
}

const boundMap = new Map<DocName, Bound>();

export const EdgelessSnapshot = (props: Props) => {
  const {
    title,
    docName,
    keyName,
    height = 180,
    getElements,
    firstUpdate,
    children,
  } = props;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<Doc | null>(null);
  const editorHostRef = useRef<EditorHost | null>(null);
  const framework = useFramework();
  const { editorSetting } = framework.get(EditorSettingService);

  const updateElements = useCallback(() => {
    const editorHost = editorHostRef.current;
    const doc = docRef.current;
    if (!editorHost || !doc) return;
    const edgelessService = editorHost.std.getService(
      'affine:page'
    ) as EdgelessRootService;
    const elements = getElements(doc);
    const props = editorSetting.get(keyName) as any;
    elements.forEach(element => {
      edgelessService.updateElement(element.id, props);
    });
  }, [editorSetting, getElements, keyName]);

  const renderEditor = useCallback(async () => {
    if (!wrapperRef.current) return;
    const doc = await getDocByName(docName);
    if (!doc) return;

    const editorHost = new BlockStdScope({
      doc,
      extensions: SpecProvider.getInstance().getSpec('edgeless:preview').value,
    }).render();
    docRef.current = doc;
    editorHostRef.current = editorHost;

    if (firstUpdate) {
      firstUpdate(doc, editorHost);
    } else {
      updateElements();
    }

    // refresh viewport
    const edgelessService = editorHost.std.getService(
      'affine:page'
    ) as EdgelessRootService;
    edgelessService.specSlots.viewConnected.once(({ component }) => {
      const edgelessBlock = component as any;
      edgelessBlock.editorViewportSelector = 'ref-viewport';
      const frame = getFrameBlock(doc);
      if (frame) {
        boundMap.set(docName, Bound.deserialize(frame.xywh));
        doc.deleteBlock(frame);
      }
      const bound = boundMap.get(docName);
      bound && edgelessService.viewport.setViewportByBound(bound);
    });

    // append to dom node
    wrapperRef.current.append(editorHost);
  }, [docName, firstUpdate, updateElements]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    renderEditor();
    return () => editorHostRef.current?.remove();
  }, [renderEditor]);

  // observe editor settings change
  useEffect(() => {
    const sub = editorSetting.provider
      .watchAll()
      .pipe(
        map(settings => {
          if (typeof settings[keyName] === 'string') {
            return JSON.parse(settings[keyName]);
          }
          return keyName;
        }),
        pairwise()
      )
      .subscribe(([prev, current]) => {
        if (!isEqual(prev, current)) {
          updateElements();
        }
      });
    return () => sub.unsubscribe();
  }, [editorSetting.provider, keyName, updateElements]);

  return (
    <div className={snapshotContainer}>
      <div className={snapshotTitle}>{title}</div>
      <div className={snapshotLabel}>{title}</div>
      <div
        ref={wrapperRef}
        style={{
          position: 'relative',
          pointerEvents: 'none',
          userSelect: 'none',
          overflow: 'hidden',
          height,
        }}
      >
        <Skeleton
          className={snapshotSkeleton}
          variant="rounded"
          height={'100%'}
        />
      </div>
      {children}
    </div>
  );
};
