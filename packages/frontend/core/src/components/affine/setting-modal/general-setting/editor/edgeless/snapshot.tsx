import type { EditorSettingSchema } from '@affine/core/modules/editor-settting';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import type { EditorHost } from '@blocksuite/block-std';
import { BlockStdScope } from '@blocksuite/block-std';
import type { SurfaceBlockModel } from '@blocksuite/block-std/gfx';
import type { EdgelessRootService, FrameBlockModel } from '@blocksuite/blocks';
import { SpecProvider } from '@blocksuite/blocks';
import { Bound } from '@blocksuite/global/utils';
import type { Doc } from '@blocksuite/store';
import { useFramework } from '@toeverything/infra';
import { isEqual } from 'lodash-es';
import { useCallback, useEffect, useRef } from 'react';
import { map, pairwise } from 'rxjs';

import { snapshotContainer, snapshotTitle } from '../style.css';
import { type DocName, getDocByName } from './docs';

interface Props {
  title: string;
  docName: DocName;
  flavour: BlockSuite.EdgelessModelKeys;
  keyName: keyof EditorSettingSchema;
  height?: number;
}

export function getSurfaceBlock(doc: Doc) {
  const blocks = doc.getBlocksByFlavour('affine:surface');
  return blocks.length !== 0 ? (blocks[0].model as SurfaceBlockModel) : null;
}

function getFrameBlock(doc: Doc) {
  const blocks = doc.getBlocksByFlavour('affine:frame');
  return blocks.length !== 0 ? (blocks[0].model as FrameBlockModel) : null;
}

const boundMap = new Map<DocName, Bound>();

export const EdgelessSnapshot = (props: Props) => {
  const { title, docName, flavour, keyName, height = 180 } = props;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<Doc | null>(null);
  const editorHostRef = useRef<EditorHost | null>(null);
  const framework = useFramework();
  const { editorSetting } = framework.get(EditorSettingService);

  const updateElement = useCallback(
    (props: Record<string, unknown>) => {
      const editorHost = editorHostRef.current;
      const doc = docRef.current;
      if (!editorHost || !doc) return;
      const edgelessService = editorHost.std.getService(
        'affine:page'
      ) as EdgelessRootService;
      const blocks = doc.getBlocksByFlavour(flavour);
      const surface = getSurfaceBlock(doc);
      const elements = surface?.getElementsByType(flavour) || [];
      [...blocks, ...elements].forEach(ele => {
        edgelessService.updateElement(ele.id, props);
      });
    },
    [flavour]
  );

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
    const settings = editorSetting.get(keyName);
    updateElement(settings as any);

    // refresh viewport
    const edgelessService = editorHost.std.getService(
      'affine:page'
    ) as EdgelessRootService;
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

    // append to dom node
    wrapperRef.current.append(editorHost);
  }, [docName, editorSetting, keyName, updateElement]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    renderEditor();
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
          updateElement(current);
        }
      });
    return () => sub.unsubscribe();
  }, [editorSetting.provider, flavour, keyName, updateElement]);

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
