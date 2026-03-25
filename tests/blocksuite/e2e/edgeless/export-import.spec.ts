import { expect, type Page } from '@playwright/test';
import JSZip from 'jszip';

import {
  embedPngMetadata,
  extractPngMetadata,
} from '../../../../blocksuite/affine/shared/src/utils/png-metadata.ts';
import {
  createConnectorElement,
  createShapeElement,
  edgelessCommonSetup,
  selectElementsByService,
  toViewCoord,
} from '../utils/actions/edgeless.js';
import { pressEnter, type } from '../utils/actions/keyboard.js';
import {
  enterPlaygroundRoom,
  focusRichText,
  initEmptyParagraphState,
  resetHistory,
  waitNextFrame,
} from '../utils/actions/misc.js';
import { test } from '../utils/playwright.js';

const BASE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/xcAAgIB/6v3+QAAAABJRU5ErkJggg==';

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}

function toArrayBufferFromUint8(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
}

async function createFrameWithContent(page: Page) {
  await edgelessCommonSetup(page);
  const frameId = await page.evaluate(async () => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const { Bound } =
      await import('/@fs/workspace/AFFiNE/blocksuite/framework/global/src/gfx/model/bound.ts');
    const { EdgelessFrameManagerIdentifier } =
      await import('/@fs/workspace/AFFiNE/blocksuite/affine/blocks/frame/src/frame-manager.ts');
    const frameManager = root.service.std.getOptional(
      EdgelessFrameManagerIdentifier
    );
    if (!frameManager) throw new Error('frame manager not found');
    const frame = frameManager.createFrameOnBound(new Bound(0, 0, 400, 260));
    return frame?.id as string | undefined;
  });
  await waitNextFrame(page, 200);
  if (!frameId) throw new Error('frameId not found');
  await createShapeElement(page, [40, 40], [120, 120]);
  await page.mouse.click(10, 10);
  await waitNextFrame(page, 200);
  await selectElementsByService(page, [frameId]);
  const [vx, vy] = await toViewCoord(page, [200, 130]);
  await page.mouse.click(vx, vy);
  return frameId;
}

async function buildFramePngData(page: Page, frameId: string) {
  const result = await page.evaluate(async id => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const doc = (window as any).doc;
    const { EdgelessFrameManagerIdentifier } =
      await import('/@fs/workspace/AFFiNE/blocksuite/affine/blocks/frame/src/frame-manager.ts');
    const host = root.service.std.host ?? root.host;
    const rootModelId = host?.store?.root?.id;
    const rootComponent = rootModelId
      ? host?.view?.getBlock?.(rootModelId)
      : null;
    if (
      rootComponent &&
      !rootComponent.querySelector('.affine-block-children-container')
    ) {
      const container = document.createElement('div');
      container.className = 'affine-block-children-container';
      container.style.backgroundColor = 'white';
      rootComponent.append(container);
    }
    const debug: Record<string, unknown> = {
      hasStd: Boolean(root.service?.std),
      hasGfx: Boolean(root.gfx),
      hasGfxStd: Boolean(root.gfx?.std),
      hasStdHost: Boolean(host),
      hasRootComponent: Boolean(rootComponent),
      hasSurfaceComponent: Boolean(root.gfx?.surfaceComponent),
      hasBlockChildrenContainer: Boolean(
        rootComponent?.querySelector?.('.affine-block-children-container') ||
        document.querySelector('.affine-block-children-container')
      ),
      rendererName: root.gfx?.surfaceComponent?.renderer?.constructor?.name,
      hasFrameManager: Boolean(
        root.service.std.getOptional(EdgelessFrameManagerIdentifier)
      ),
    };
    let frame =
      root.service.std.store.getModelById(id) ?? doc?.getModelById?.(id);
    if (!frame) {
      const frames =
        root.service.std.store.getBlocksByFlavour('affine:frame') ??
        doc?.getBlocksByFlavour?.('affine:frame') ??
        [];
      const normalized = frames.map((value: any) => value?.model ?? value);
      frame = normalized[normalized.length - 1];
    }
    if (!frame) {
      const elements = root.service.elements ?? [];
      frame = elements.find(
        (el: any) => el?.flavour === 'affine:frame' || el?.type === 'frame'
      );
    }
    if (!frame) {
      frame = root.gfx?.getElementById?.(id);
    }
    if (!frame) {
      const frameManager = root.service.std.getOptional(
        EdgelessFrameManagerIdentifier
      );
      const managedFrames = frameManager?.frames ?? [];
      debug.frameManagerFrames = managedFrames.length;
      frame = managedFrames[managedFrames.length - 1];
    }
    if (!frame) {
      const domFrame = document.querySelector('affine-frame') as HTMLElement;
      const domFrameId = domFrame?.dataset?.blockId;
      if (domFrameId) {
        frame = root.gfx?.getElementById?.(domFrameId);
      }
    }
    if (!frame) throw new Error('frame not found');
    const { buildFramePngPayload } =
      await import('/@fs/workspace/AFFiNE/blocksuite/affine/blocks/frame/src/metadata.ts');
    const payload = await buildFramePngPayload(
      root.service.std,
      frame,
      root.gfx?.std
    );
    if (!payload) return { error: 'payload-null', debug };
    const buffer = await payload.blob.arrayBuffer();
    return {
      fileName: payload.fileName,
      buffer: Array.from(new Uint8Array(buffer)),
    };
  }, frameId);
  if (!result) throw new Error('frame png payload not found');
  if ('error' in result) {
    throw new Error(`frame png payload not found: ${JSON.stringify(result)}`);
  }
  return result;
}

async function exportPageFromDebugMenu(page: Page, label: 'markdown' | 'html') {
  const result = await page.evaluate(async menuLabel => {
    const menu = document.querySelector('starter-debug-menu') as any;
    if (!menu) throw new Error('starter debug menu not found');
    const {
      docLinkBaseURLMiddleware,
      HtmlAdapterFactoryIdentifier,
      MarkdownAdapterFactoryIdentifier,
      embedSyncedDocMiddleware,
      titleMiddleware,
    } =
      await import('/@fs/workspace/AFFiNE/blocksuite/affine/shared/src/adapters/index.ts');
    const { buildFramePngPayload } =
      await import('/@fs/workspace/AFFiNE/blocksuite/affine/blocks/frame/src/metadata.ts');
    const { createAssetsArchive } =
      await import('/@fs/workspace/AFFiNE/blocksuite/affine/widgets/linked-doc/src/transformers/index.ts');
    const { sha } =
      await import('/@fs/workspace/AFFiNE/blocksuite/framework/global/src/utils/crypto.ts');

    const doc = menu.editor.doc;
    const std = menu.editor.std;
    const root = document.querySelector('affine-edgeless-root') as any;
    const host = root?.service?.std?.host ?? root?.host;
    const rootModelId = host?.store?.root?.id;
    const rootComponent = rootModelId
      ? host?.view?.getBlock?.(rootModelId)
      : null;
    if (
      rootComponent &&
      !rootComponent.querySelector('.affine-block-children-container')
    ) {
      const container = document.createElement('div');
      container.className = 'affine-block-children-container';
      container.style.backgroundColor = 'white';
      rootComponent.append(container);
    }

    const transformer = doc.getTransformer([
      docLinkBaseURLMiddleware(menu.collection.id),
      titleMiddleware(menu.collection.meta.docMetas),
      embedSyncedDocMiddleware('content'),
    ]);
    const frames = doc
      .getBlocksByFlavour('affine:frame')
      .map((block: any) => block?.model ?? block)
      .filter((model: any) => model?.flavour === 'affine:frame');
    const referencedFrameIds = doc
      .getBlocksByFlavour('affine:surface-ref')
      .map((block: any) => block?.model ?? block)
      .filter((model: any) => model?.props?.refFlavour === 'affine:frame')
      .map((model: any) => model?.props?.reference)
      .filter(Boolean);
    const frameAssets: { id: string; frameId: string; name: string }[] = [];
    for (const frame of frames) {
      const payload = await buildFramePngPayload(std, frame);
      if (!payload) continue;
      const buffer = await payload.blob.arrayBuffer();
      const blobId = await sha(buffer);
      const file = new File([buffer], payload.fileName, { type: 'image/png' });
      transformer.assets.set(blobId, file);
      frameAssets.push({
        id: blobId,
        frameId: frame.id,
        name: payload.fileName,
      });
    }
    if (frameAssets.length > 0) {
      const imageMap = Object.fromEntries(
        frameAssets.map(asset => [asset.frameId, asset])
      );
      transformer.adapterConfigs.set(
        'frame:export:image-map',
        JSON.stringify(imageMap)
      );
      transformer.adapterConfigs.set(
        'frame:export:surface-ref-ids',
        JSON.stringify(referencedFrameIds)
      );
      transformer.adapterConfigs.set('surface:exportFramesAsImages', 'true');
    }
    const identifier =
      menuLabel === 'markdown'
        ? MarkdownAdapterFactoryIdentifier
        : HtmlAdapterFactoryIdentifier;
    const adapterFactory = menu.editor.std.provider.get(identifier);
    const adapter = adapterFactory.get(transformer);
    const result = await adapter.fromDoc(doc);
    if (
      !result ||
      (!result.file && !result.assetsIds.length && !frameAssets.length)
    ) {
      return null;
    }

    const docTitle = doc.meta?.title || 'Untitled';
    const config =
      menuLabel === 'markdown'
        ? {
            fileExtension: '.md',
            contentType: 'text/plain',
            indexFileName: 'index.md',
          }
        : {
            fileExtension: '.html',
            contentType: 'text/html',
            indexFileName: 'index.html',
          };
    const contentBlob = new Blob([result.file], { type: config.contentType });
    const assetsIds = [
      ...new Set([...result.assetsIds, ...frameAssets.map(asset => asset.id)]),
    ];
    let downloadBlob: Blob;
    let name: string;

    if (assetsIds.length > 0) {
      if (!transformer.assets) {
        throw new Error('No assets found');
      }
      const zip = await createAssetsArchive(transformer.assets, assetsIds);
      await zip.file(config.indexFileName, contentBlob);
      downloadBlob = await zip.generate();
      name = `${docTitle}.zip`;
    } else {
      downloadBlob = contentBlob;
      name = `${docTitle}${config.fileExtension}`;
    }

    const buffer = Array.from(new Uint8Array(await downloadBlob.arrayBuffer()));
    return { name, buffer };
  }, label);
  if (!result) {
    throw new Error('export returned empty result');
  }
  return result;
}

async function addSurfaceRefToFrame(page: Page, frameId: string) {
  await page.evaluate(id => {
    const doc = (window as any).doc;
    if (!doc) throw new Error('doc not found');
    const notes = doc.getBlocksByFlavour?.('affine:note') ?? [];
    let note = notes[0]?.model ?? notes[0] ?? null;
    if (!note) {
      const rootId = doc.root?.id;
      if (!rootId) throw new Error('doc root not found');
      const noteId = doc.addBlock('affine:note', {}, rootId);
      doc.addBlock('affine:paragraph', {}, noteId);
      note = doc.getModelById(noteId);
    }
    if (!note) throw new Error('note not found');
    doc.addBlock(
      'affine:surface-ref',
      {
        reference: id,
        refFlavour: 'affine:frame',
        caption: '',
      },
      note.id
    );
    doc.captureSync();
  }, frameId);
}

async function getZipPngBuffers(zip: JSZip) {
  const pngEntries = Object.values(zip.files).filter(file =>
    file.name.toLowerCase().endsWith('.png')
  );
  const buffers = await Promise.all(
    pngEntries.map(entry => entry.async('nodebuffer'))
  );
  return buffers;
}

async function insertImageWithMetadata(page: Page, payload: string) {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await page.evaluate(() => {
    window.showOpenFilePicker = undefined;
  });

  await type(page, '/', 100);
  await resetHistory(page);
  await type(page, 'image', 100);

  const fileChooser = page.waitForEvent('filechooser');
  await pressEnter(page);
  const chooser = await fileChooser;

  const png = Buffer.from(BASE_PNG, 'base64');
  const enriched = embedPngMetadata(toArrayBuffer(png), 'affine', payload);

  await chooser.setFiles({
    name: 'frame.png',
    mimeType: 'image/png',
    buffer: Buffer.from(toArrayBufferFromUint8(enriched)),
  });
}

test.describe('export and import', () => {
  test('frame PNG export embeds metadata', async ({ page }) => {
    const frameId = await createFrameWithContent(page);
    const payload = await buildFramePngData(page, frameId);
    const buffer = Buffer.from(payload.buffer);
    const metadataText = extractPngMetadata(toArrayBuffer(buffer), 'affine');
    expect(metadataText).toBeTruthy();
    const parsed = JSON.parse(metadataText!);
    expect(parsed?.affine?.type).toBe('frame');
    expect(Array.isArray(parsed?.affine?.snapshot)).toBe(true);
  });

  test('frame PNG import applies metadata', async ({ page }) => {
    const frameId = await createFrameWithContent(page);
    const metadata = {
      affine: {
        type: 'frame',
        version: 1,
        frame: { xywh: '[0,0,200,120]' },
        frameBound: { x: 0, y: 0, w: 200, h: 120 },
        elementsBound: { x: 0, y: 0, w: 0, h: 0 },
        snapshot: [],
      },
    };
    const png = Buffer.from(BASE_PNG, 'base64');
    const enriched = embedPngMetadata(
      toArrayBuffer(png),
      'affine',
      JSON.stringify(metadata)
    );
    const encoded = Buffer.from(toArrayBufferFromUint8(enriched)).toString(
      'base64'
    );

    const updated = await page.evaluate(
      async ({ fileBase64, id }) => {
        const root = document.querySelector('affine-edgeless-root') as any;
        if (!root) throw new Error('edgeless root not found');
        const doc = (window as any).doc;
        let frame =
          root.service.std.store.getModelById(id) ?? doc?.getModelById?.(id);
        if (!frame) {
          const frames =
            root.service.std.store.getBlocksByFlavour('affine:frame') ??
            doc?.getBlocksByFlavour?.('affine:frame') ??
            [];
          const normalized = frames.map((value: any) => value?.model ?? value);
          frame = normalized[normalized.length - 1];
        }
        if (!frame) {
          const elements = root.service.elements ?? [];
          frame = elements.find(
            (el: any) => el?.flavour === 'affine:frame' || el?.type === 'frame'
          );
        }
        if (!frame) {
          frame = root.gfx?.getElementById?.(id);
        }
        if (!frame) {
          const { EdgelessFrameManagerIdentifier } =
            await import('/@fs/workspace/AFFiNE/blocksuite/affine/blocks/frame/src/frame-manager.ts');
          const frameManager = root.service.std.getOptional(
            EdgelessFrameManagerIdentifier
          );
          const managedFrames = frameManager?.frames ?? [];
          frame = managedFrames[managedFrames.length - 1];
        }
        if (!frame) {
          const domFrame = document.querySelector(
            'affine-frame'
          ) as HTMLElement;
          const domFrameId = domFrame?.dataset?.blockId;
          if (domFrameId) {
            frame = root.gfx?.getElementById?.(domFrameId);
          }
        }
        if (!frame) throw new Error('frame not found');
        const { importFramePng } =
          await import('/@fs/workspace/AFFiNE/blocksuite/affine/blocks/frame/src/metadata.ts');
        const std = root.service.std;
        const store = std.store;
        const host = std.host ?? root.host;
        window.showOpenFilePicker = async () => [
          {
            getFile: async () => {
              const binary = atob(fileBase64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i);
              }
              return new File([bytes], 'frame.png', { type: 'image/png' });
            },
          },
        ];

        await importFramePng({ std, store, host } as any, frame);
        return frame.xywh;
      },
      { fileBase64: encoded, id: frameId }
    );

    expect(updated).toContain('200');
  });

  test('importing image with metadata prompts frame conversion', async ({
    page,
  }) => {
    const payload = JSON.stringify({
      affine: { type: 'frame', version: 1, snapshot: [] },
    });
    await insertImageWithMetadata(page, payload);

    const confirmButton = page.getByTestId('confirm-modal-confirm');
    const toastMessage = page.getByText(
      'Frame metadata detected for this image.'
    );
    await Promise.race([
      confirmButton.waitFor({ state: 'visible' }),
      toastMessage.waitFor({ state: 'visible' }),
    ]);

    if (await confirmButton.count()) {
      await expect(page.getByText('Frame metadata detected')).toBeVisible();
      await expect(
        page.getByText('Convert this image to an editable Frame?')
      ).toBeVisible();
      await page.getByTestId('confirm-modal-cancel').click();
    } else {
      await expect(toastMessage).toBeVisible();
    }
  });

  test('imported diagram reconstructs shapes and connectors', async ({
    page,
  }) => {
    const frameId = await createFrameWithContent(page);
    await createShapeElement(page, [200, 40], [280, 120]);
    await createConnectorElement(page, [60, 60], [240, 80]);
    await waitNextFrame(page, 200);
    await page.evaluate(async id => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('edgeless root not found');
      const { EdgelessFrameManagerIdentifier } =
        await import('/@fs/workspace/AFFiNE/blocksuite/affine/blocks/frame/src/frame-manager.ts');
      const frameManager = root.service.std.getOptional(
        EdgelessFrameManagerIdentifier
      );
      if (!frameManager) throw new Error('frame manager not found');
      const frame =
        root.service.std.store.getModelById(id) ??
        root.gfx?.getElementById?.(id);
      if (!frame) throw new Error('frame not found');
      const elements = frameManager.getElementsInFrameBound(frame);
      frameManager.addElementsToFrame(frame, elements);
    }, frameId);

    await selectElementsByService(page, [frameId]);
    const payload = await buildFramePngData(page, frameId);
    const metadataText = extractPngMetadata(
      toArrayBuffer(Buffer.from(payload.buffer)),
      'affine'
    );
    expect(metadataText).toBeTruthy();
    const parsed = JSON.parse(metadataText!);
    expect(Array.isArray(parsed?.affine?.snapshot)).toBe(true);
    expect(parsed?.affine?.snapshot?.length ?? 0).toBeGreaterThan(0);
    const payloadBase64 = Buffer.from(payload.buffer).toString('base64');

    await page.evaluate(() => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('edgeless root not found');
      const shapes = root.service.crud.getElementsByType('shape');
      const connectors = root.service.crud.getElementsByType('connector');
      [...shapes, ...connectors].forEach((el: any) =>
        root.service.crud.removeElement(el.id)
      );
    });

    await page.evaluate(
      async ({ fileBase64, fileName, frameId }) => {
        const root = document.querySelector('affine-edgeless-root') as any;
        if (!root) throw new Error('edgeless root not found');
        const doc = (window as any).doc;
        let frame =
          root.service.std.store.getModelById(frameId) ??
          doc?.getModelById?.(frameId);
        if (!frame) {
          const frames =
            root.service.std.store.getBlocksByFlavour('affine:frame') ??
            doc?.getBlocksByFlavour?.('affine:frame') ??
            [];
          const normalized = frames.map((value: any) => value?.model ?? value);
          frame = normalized[normalized.length - 1];
        }
        if (!frame) {
          const elements = root.service.elements ?? [];
          frame = elements.find(
            (el: any) => el?.flavour === 'affine:frame' || el?.type === 'frame'
          );
        }
        if (!frame) {
          frame = root.gfx?.getElementById?.(frameId);
        }
        if (!frame) {
          const { EdgelessFrameManagerIdentifier } =
            await import('/@fs/workspace/AFFiNE/blocksuite/affine/blocks/frame/src/frame-manager.ts');
          const frameManager = root.service.std.getOptional(
            EdgelessFrameManagerIdentifier
          );
          const managedFrames = frameManager?.frames ?? [];
          frame = managedFrames[managedFrames.length - 1];
        }
        if (!frame) {
          const domFrame = document.querySelector(
            'affine-frame'
          ) as HTMLElement;
          const domFrameId = domFrame?.dataset?.blockId;
          if (domFrameId) {
            frame = root.gfx?.getElementById?.(domFrameId);
          }
        }
        if (!frame) throw new Error('frame not found');
        const { importFramePng } =
          await import('/@fs/workspace/AFFiNE/blocksuite/affine/blocks/frame/src/metadata.ts');
        const std = root.service.std;
        const store = std.store;
        const host = std.host ?? root.host;
        window.showOpenFilePicker = async () => [
          {
            getFile: async () => {
              const binary = atob(fileBase64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i);
              }
              return new File([bytes], fileName, { type: 'image/png' });
            },
          },
        ];
        await importFramePng({ std, store, host } as any, frame);
      },
      { fileBase64: payloadBase64, fileName: payload.fileName, frameId }
    );
    await waitNextFrame(page, 200);

    const counts = await page.evaluate(id => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('edgeless root not found');
      const frame =
        root.service.std.store.getModelById(id) ??
        root.gfx?.getElementById?.(id);
      if (!frame) throw new Error('frame not found');
      const children = frame.childElements ?? [];
      return {
        total: children.length,
        shapes: children.filter((el: any) => el?.type === 'shape').length,
        connectors: children.filter((el: any) => el?.type === 'connector')
          .length,
      };
    }, frameId);
    expect(counts.total).toBeGreaterThan(0);
    expect(counts.shapes + counts.connectors).toBeGreaterThan(0);
  });

  test('page export includes frame PNG with metadata (markdown)', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const frameId = await createFrameWithContent(page);
    await addSurfaceRefToFrame(page, frameId);
    const exportResult = await exportPageFromDebugMenu(page, 'markdown');
    expect(exportResult.name.endsWith('.zip')).toBe(true);
    const zip = await JSZip.loadAsync(Buffer.from(exportResult.buffer));
    const pngBuffers = await getZipPngBuffers(zip);
    expect(pngBuffers.length).toBeGreaterThan(0);

    const hasMetadata = pngBuffers.some(buffer =>
      Boolean(extractPngMetadata(toArrayBuffer(buffer), 'affine'))
    );
    expect(hasMetadata).toBe(true);
  });

  test('page export includes frame PNG with metadata (html)', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const frameId = await createFrameWithContent(page);
    await addSurfaceRefToFrame(page, frameId);
    const exportResult = await exportPageFromDebugMenu(page, 'html');
    expect(exportResult.name.endsWith('.zip')).toBe(true);
    const zip = await JSZip.loadAsync(Buffer.from(exportResult.buffer));
    const pngBuffers = await getZipPngBuffers(zip);
    expect(pngBuffers.length).toBeGreaterThan(0);

    const hasMetadata = pngBuffers.some(buffer =>
      Boolean(extractPngMetadata(toArrayBuffer(buffer), 'affine'))
    );
    expect(hasMetadata).toBe(true);
  });

  test('page import from markdown zip restores frame images', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const frameId = await createFrameWithContent(page);
    await addSurfaceRefToFrame(page, frameId);
    const exportResult = await exportPageFromDebugMenu(page, 'markdown');
    expect(exportResult.name.endsWith('.zip')).toBe(true);

    const beforeDocIds = await page.evaluate(() =>
      Array.from(window.collection.docs.keys())
    );

    await page.evaluate(
      async ({ fileBase64, fileName }) => {
        const menu = document.querySelector('starter-debug-menu') as any;
        if (!menu) throw new Error('starter debug menu not found');
        const { MarkdownTransformer } =
          await import('/@fs/workspace/AFFiNE/blocksuite/affine/widgets/linked-doc/src/transformers/markdown.ts');
        const binary = atob(fileBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const file = new File([bytes], fileName, { type: 'application/zip' });
        const extensions = menu._getStoreManager?.().get('store');
        await MarkdownTransformer.importMarkdownZip({
          collection: menu.collection,
          schema: menu.editor.doc.schema,
          imported: file,
          extensions,
        });
      },
      {
        fileBase64: Buffer.from(exportResult.buffer).toString('base64'),
        fileName: exportResult.name,
      }
    );

    await waitNextFrame(page, 500);

    const imported = await page.evaluate(prevIds => {
      const docIds = Array.from(window.collection.docs.keys());
      const newId = docIds.find(id => !prevIds.includes(id));
      if (!newId) return { images: 0 };
      const doc = window.collection.getDoc(newId)?.getStore();
      const images = doc?.getBlocksByFlavour?.('affine:image') ?? [];
      return { images: images.length };
    }, beforeDocIds);

    expect(imported.images).toBeGreaterThan(0);
  });
});
