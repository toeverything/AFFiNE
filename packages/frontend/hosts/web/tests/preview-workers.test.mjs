import assert from 'node:assert/strict';
import { test } from 'node:test';

import { installPlaygroundPreviewBridge } from '../../../../../blocksuite/crates/playground/web/preview-workers.js';

function createFakeDom() {
  const children = [];
  const embedLayer = {
    style: {},
    append(el) {
      children.push(el);
    },
  };
  const revoked = [];
  let blobSeq = 0;

  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalWorker = globalThis.Worker;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  const workers = [];
  class FakeWorker {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      this.posted = [];
      this.terminated = false;
      workers.push(this);
    }
    terminate() {
      this.terminated = true;
    }
    addEventListener(type, fn) {
      const list = this.listeners.get(type) || [];
      list.push(fn);
      this.listeners.set(type, list);
    }
    postMessage(msg) {
      this.posted.push(msg);
    }
    emit(type, event) {
      for (const fn of this.listeners.get(type) || []) {
        fn(event);
      }
    }
  }

  globalThis.window = {
    location: { href: 'https://app.affine.test/playground/' },
  };
  globalThis.document = {
    getElementById(id) {
      return id === 'embed-layer' ? embedLayer : null;
    },
    createElement(tag) {
      const attrs = new Map();
      const el = {
        tagName: tag.toUpperCase(),
        style: {},
        src: '',
        setAttribute(k, v) {
          attrs.set(k, String(v));
        },
        getAttribute(k) {
          return attrs.get(k) ?? null;
        },
        remove() {
          const idx = children.indexOf(el);
          if (idx >= 0) children.splice(idx, 1);
        },
      };
      return el;
    },
  };
  globalThis.Worker = FakeWorker;
  URL.createObjectURL = () => `blob:test-${++blobSeq}`;
  URL.revokeObjectURL = url => {
    revoked.push(url);
  };

  return {
    children,
    embedLayer,
    revoked,
    workers,
    restore() {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
      globalThis.Worker = originalWorker;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    },
  };
}

void test('reconcileHtmlEmbeds mounts, updates html blob URLs, shields, and unmounts stale iframes without allow-same-origin', () => {
  const env = createFakeDom();
  try {
    installPlaygroundPreviewBridge({});
    const bridge = globalThis.window.__playgroundPreview;

    bridge.reconcileHtmlEmbeds(
      JSON.stringify([
        {
          id: 'ext-1',
          html: '<p>v1</p>',
          x: 20,
          y: 100,
          w: 300,
          h: 120,
          visible: true,
        },
      ])
    );
    assert.equal(env.children.length, 1);
    const iframe = env.children[0];
    assert.equal(iframe.getAttribute('sandbox'), 'allow-scripts');
    assert.equal(
      iframe.getAttribute('sandbox').includes('allow-same-origin'),
      false
    );
    const firstUrl = iframe.src;
    assert.equal(iframe.style.top, '100px');

    // Scroll + HTML content update revokes old blob URL and refreshes src + position.
    bridge.reconcileHtmlEmbeds([
      {
        id: 'ext-1',
        html: '<p>v2</p>',
        x: 20,
        y: 64,
        w: 300,
        h: 120,
        visible: true,
      },
    ]);
    assert.equal(env.children.length, 1);
    assert.notEqual(iframe.src, firstUrl);
    assert.ok(
      env.revoked.includes(firstUrl),
      'old blob URL must be revoked on HTML change'
    );
    assert.equal(iframe.style.top, '64px');

    // Shield hides layer and disables iframe pointer events.
    bridge.shieldEmbeds(true);
    assert.equal(env.embedLayer.style.visibility, 'hidden');
    assert.equal(iframe.style.pointerEvents, 'none');

    // Switching mode / deleting block reconciles to [] and unmounts + revokes blob URL.
    const secondUrl = iframe.src;
    bridge.reconcileHtmlEmbeds([]);
    assert.equal(env.children.length, 0);
    assert.ok(
      env.revoked.includes(secondUrl),
      'blob URL must be revoked on unmount'
    );
  } finally {
    env.restore();
  }
});

void test('mermaid and typst worker errors fail pending requests instead of stalling in Pending', () => {
  const env = createFakeDom();
  try {
    const errors = [];
    installPlaygroundPreviewBridge({
      deliver_code_preview_error(kind, source, dark, dpr, msg) {
        errors.push({ kind, source, dark, dpr, msg });
      },
    });
    const bridge = globalThis.window.__playgroundPreview;

    bridge.requestCodePreview('mermaid', 'graph TD; A-->B', false, 2);
    assert.equal(env.workers.length, 1);
    env.workers[0].emit('error', new Error('worker crashed'));
    assert.equal(
      env.workers[0].terminated,
      true,
      'crashed mermaid worker must be terminated'
    );
    assert.equal(errors.length, 1);
    assert.equal(errors[0].kind, 'mermaid');

    // Subsequent request after crash must spawn a fresh worker instance (self-healing).
    bridge.requestCodePreview('mermaid', 'graph LR; X-->Y', false, 2);
    assert.equal(
      env.workers.length,
      2,
      'must spawn a fresh mermaid worker after error'
    );
    assert.equal(env.workers[1].terminated, false);
    assert.equal(env.workers[1].posted.length, 1);

    bridge.requestCodePreview('typst', '= Hello', true, 2);
    assert.equal(env.workers.length, 3);
    env.workers[2].emit('messageerror', {});
    assert.equal(
      env.workers[2].terminated,
      true,
      'crashed typst worker must be terminated'
    );
    assert.equal(errors.length, 2);
    assert.equal(errors[1].kind, 'typst');

    bridge.requestCodePreview('typst', '= Retry', true, 2);
    assert.equal(
      env.workers.length,
      4,
      'must spawn a fresh typst worker after messageerror'
    );
    assert.equal(env.workers[3].posted.length, 1);
  } finally {
    env.restore();
  }
});
