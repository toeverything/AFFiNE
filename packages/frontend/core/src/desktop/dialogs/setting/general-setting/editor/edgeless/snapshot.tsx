import { Skeleton } from '@affine/component';
import { getViewManager } from '@affine/core/blocksuite/manager/view';
import type { EditorSettingSchema } from '@affine/core/modules/editor-setting';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { EdgelessCRUDIdentifier } from '@blocksuite/affine/blocks/surface';
import { Bound } from '@blocksuite/affine/global/gfx';
import { ViewportElementExtension } from '@blocksuite/affine/shared/services';
import type { EditorHost } from '@blocksuite/affine/std';
import { BlockStdScope } from '@blocksuite/affine/std';
import {
  GfxControllerIdentifier,
  type GfxPrimitiveElementModel,
} from '@blocksuite/affine/std/gfx';
import type { Block, Store } from '@blocksuite/affine/store';
import { useFramework } from '@toeverything/infra';
import clsx from 'clsx';
import { isEqual } from 'lodash-es';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { map, pairwise } from 'rxjs';

import {
  editorWrapper,
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
  getElements: (doc: Store) => Array<Block | GfxPrimitiveElementModel>;
  firstUpdate?: (doc: Store, editorHost: EditorHost) => void;
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
  const docRef = useRef<Store | null>(null);
  const editorHostRef = useRef<EditorHost | null>(null);
  const framework = useFramework();
  const { editorSetting } = framework.get(EditorSettingService);

  const extensions = useMemo(() => {
    const manager = getViewManager()
      .config.init()
      .foundation(framework)
      .theme(framework)
      .database(framework)
      .linkedDoc(framework)
      .codeBlockPreview(framework).value;
    return manager
      .get('preview-edgeless')
      .concat([ViewportElementExtension('.setting-editor-snapshot')]);
  }, [framework]);

  const updateElements = useCallback(() => {
    const editorHost = editorHostRef.current;
    const doc = docRef.current;
    if (!editorHost || !doc) return;
    const crud = editorHost.std.get(EdgelessCRUDIdentifier);
    const elements = getElements(doc);
    const props = editorSetting.get(keyName) as any;
    doc.readonly = false;
    elements.forEach(element => {
      crud.updateElement(element.id, props);
    });
    doc.readonly = true;
  }, [editorSetting, getElements, keyName]);

  const renderEditor = useCallback(async () => {
    if (!wrapperRef.current) return;
    const doc = await getDocByName(docName);
    if (!doc) return;

    const editorHost = new BlockStdScope({
      store: doc,
      extensions,
    }).render();
    docRef.current = doc;
    editorHostRef.current?.remove();
    editorHostRef.current = editorHost;

    if (firstUpdate) {
      firstUpdate(doc, editorHost);
    } else {
      updateElements();
    }

    // refresh viewport
    const gfx = editorHost.std.get(GfxControllerIdentifier);
    const disposable = editorHost.std.view.viewUpdated.subscribe(payload => {
      if (
        payload.type !== 'block' ||
        payload.method !== 'add' ||
        payload.view.model.flavour !== 'affine:page'
      ) {
        return;
      }
      doc.readonly = false;
      const frame = getFrameBlock(doc);
      if (frame && docName !== 'frame') {
        // docName with value 'frame' shouldn't be deleted, it is a part of frame settings
        boundMap.set(docName, Bound.deserialize(frame.xywh));
        doc.deleteBlock(frame);
      }
      const bound = boundMap.get(docName);
      bound && gfx.viewport.setViewportByBound(bound);
      doc.readonly = true;
      disposable.unsubscribe();
    });

    // append to dom node
    wrapperRef.current.append(editorHost);
  }, [docName, extensions, firstUpdate, updateElements]);

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
    <div className={clsx(snapshotContainer, 'setting-editor-snapshot')}>
      <div className={snapshotTitle}>{title}</div>
      <div className={snapshotLabel}>{title}</div>
      <div ref={wrapperRef} className={editorWrapper} style={{ height }}>
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
