import { DomRenderer } from '@blocksuite/affine-block-surface';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { getSurface } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

function hasConnectorPath(
  surfaceView: ReturnType<typeof getSurface>,
  connectorId: string
) {
  const connector = surfaceView.model.getElementById(connectorId);
  if (!connector || !('path' in connector)) return false;

  const { path } = connector as { path: unknown };
  return Array.isArray(path) && path.length >= 2;
}

async function waitForConnectorElement(
  surfaceView: ReturnType<typeof getSurface>,
  connectorId: string,
  timeout = 5000
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    if (!hasConnectorPath(surfaceView, connectorId)) {
      await wait(50);
      continue;
    }

    const root = surfaceView.renderRoot.querySelector('.dom-renderer-root');
    if (!root) {
      await wait(50);
      continue;
    }

    const connectorElement = root.querySelector<HTMLElement>(
      `[data-element-id="${connectorId}"]`
    );

    if (connectorElement) return connectorElement;

    await wait(50);
  }

  return null;
}

async function waitForConnectorElementRemoval(
  surfaceView: ReturnType<typeof getSurface>,
  connectorId: string,
  timeout = 5000
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const root = surfaceView.renderRoot.querySelector('.dom-renderer-root');
    if (!root) return true;

    const connectorElement = root.querySelector(
      `[data-element-id="${connectorId}"]`
    );

    if (!connectorElement) return true;

    await wait(50);
  }

  return false;
}

describe('Connector rendering with DOM renderer', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless', [], {
      enableDomRenderer: true,
    });
    return cleanup;
  });

  test('should use DomRenderer when enable_dom_renderer flag is true', async () => {
    const surface = getSurface(doc, editor);
    expect(surface).not.toBeNull();
    expect(surface?.renderer).toBeInstanceOf(DomRenderer);
  });

  test('should remove connector DOM node when element is deleted', async () => {
    const surfaceView = getSurface(window.doc, window.editor);
    const surfaceModel = surfaceView.model;

    expect(surfaceView.renderer).toBeInstanceOf(DomRenderer);

    const connectorProps = {
      type: 'connector',
      source: { position: [50, 50] },
      target: { position: [150, 150] },
    };
    const connectorId = surfaceModel.addElement(connectorProps);

    let connectorElement = await waitForConnectorElement(
      surfaceView,
      connectorId
    );
    expect(connectorElement).not.toBeNull();

    surfaceModel.deleteElement(connectorId);

    const removed = await waitForConnectorElementRemoval(
      surfaceView,
      connectorId
    );
    expect(removed).toBe(true);
  });
});
