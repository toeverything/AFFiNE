import { I18n } from '@affine/i18n';
import { BlockComponent, BlockSelection } from '@blocksuite/affine/std';
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx';
import { html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import type { Root } from 'react-dom/client';

import {
  downloadBlob,
  loadScene,
  resolveBlobSrc,
  revokeObjectUrl,
  saveScene,
  saveSvg,
  svgToPngBlob,
} from './blob';
import {
  colorForClient,
  readSketchCursors,
  SKETCH_AWARENESS_KEY,
  throttle,
  type SketchAwarenessPayload,
  type SketchRemoteCursor,
} from './cursors';
import {
  tryLive,
  whiteboardPerfPolicy,
  xywhCenterDistance,
} from '../../perf/policy';
import { whiteboardTelemetry } from '../../perf/telemetry';
import { getSketchLodLevel, liveSketchBudget } from './live-budget';
import type { SketchBlockModel } from './model';
import { createEmptyScene, parseExcalidrawJson, serializeScene } from './scene';
import { sketchBlockStyles } from './styles';
import type { SketchCollab } from './subdoc';
import { openSketchCollab } from './subdoc';
import { sceneToSvg, svgToDataUrl } from './svg';
import type { SketchScene } from './types';

export class SketchBlockComponent extends BlockComponent<SketchBlockModel> {
  static override styles = sketchBlockStyles;

  @state()
  accessor selected = false;

  @state()
  accessor hovered = false;

  @state()
  accessor intersecting = true;

  @state()
  accessor editing = false;

  @state()
  accessor snapshotUrl: string | undefined;

  @state()
  accessor editors: string[] = [];

  @state()
  accessor cursors: SketchRemoteCursor[] = [];

  @state()
  accessor sceneEpoch = 0;

  private _scene: SketchScene = createEmptyScene();
  private _live = false;
  private _root: Root | null = null;
  private _objectUrl?: string;
  private _viewportWasLocked = false;
  private _collab?: SketchCollab;
  private _snapshotTimer?: number;

  protected get titleText() {
    const title = this.model.props.title;
    const value = typeof title === 'string' ? title : title?.toString();
    return value || I18n['com.affine.whiteboard.sketch.title']();
  }

  private get zoom() {
    return this.std.getOptional(GfxControllerIdentifier)?.viewport.zoom ?? 1;
  }

  private get lod() {
    return getSketchLodLevel(this.zoom, this.selected, this.hovered);
  }

  private canUseLive() {
    if (!this.intersecting) return false;
    return this.lod === 'l2';
  }

  private gfx() {
    return this.std.getOptional(GfxControllerIdentifier);
  }

  private awareness() {
    return (
      this.model.store as {
        awarenessStore?: {
          awareness?: {
            clientID?: number;
            on?: (event: string, listener: () => void) => void;
            off?: (event: string, listener: () => void) => void;
            setLocalStateField?: (key: string, value: unknown) => void;
            getStates?: () => Map<
              number,
              {
                user?: { name?: string };
                [SKETCH_AWARENESS_KEY]?: SketchAwarenessPayload;
              }
            >;
          };
        };
      }
    ).awarenessStore?.awareness;
  }

  private selectSelf() {
    const gfx = this.gfx();
    if (gfx) {
      gfx.selection.set({
        elements: [this.model.id],
        editing: true,
      });
    } else {
      this.std.selection.setGroup('note', [
        new BlockSelection({
          blockId: this.model.id,
        }),
      ]);
    }
    this.selected = true;
  }

  private setViewportLocked(locked: boolean) {
    const viewport = this.gfx()?.viewport;
    if (!viewport) return;
    if (locked) {
      this._viewportWasLocked = viewport.locked;
      viewport.locked = true;
    } else {
      viewport.locked = this._viewportWasLocked;
    }
  }

  private setEditingPresence(
    on: boolean,
    pointer?: SketchAwarenessPayload['pointer']
  ) {
    const clientId = this.awareness()?.clientID ?? 0;
    this.awareness()?.setLocalStateField?.(SKETCH_AWARENESS_KEY, {
      flavour: this.model.flavour,
      blockId: on ? this.model.id : undefined,
      pointer: on ? pointer : undefined,
      color: colorForClient(clientId),
    } satisfies SketchAwarenessPayload);
  }

  private readEditors() {
    const awareness = this.awareness();
    const states = awareness?.getStates?.();
    if (!states) {
      this.editors = [];
      this.cursors = [];
      return;
    }
    const { editors, cursors } = readSketchCursors(
      states,
      this.model.id,
      awareness.clientID
    );
    this.editors = editors;
    this.cursors = cursors;
  }

  private readonly reportPointer = throttle((event: PointerEvent) => {
    if (!this.editing) return;
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    this.setEditingPresence(true, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      button: event.buttons ? 'down' : 'up',
    });
  }, 40);

  private scheduleSnapshot() {
    if (this._snapshotTimer) window.clearTimeout(this._snapshotTimer);
    this._snapshotTimer = window.setTimeout(() => {
      this._snapshotTimer = undefined;
      void this.persist(this._scene, false);
    }, 1000);
  }

  private async persist(scene = this._scene, writeY = true) {
    if (writeY && this._collab && !this._collab.applyingRemote) {
      this._collab.applyScene(scene);
    }
    this._scene = this._collab ? this._collab.toScene() : scene;
    const sceneId = await saveScene(this.model.store, this._scene);
    const svg = sceneToSvg(this._scene);
    const svgId = await saveSvg(this.model.store, svg);
    this.model.store.captureSync();
    this.model.props.sceneBlobId = sceneId;
    this.model.props.snapshotSvgBlobId = svgId;
    this.model.props.revision = (this.model.props.revision ?? 0) + 1;
    await this.refreshSnapshot();
  }

  private async refreshSnapshot() {
    revokeObjectUrl(this._objectUrl);
    this._objectUrl = undefined;
    const src = await resolveBlobSrc(
      this.model.store,
      this.model.props.snapshotSvgBlobId
    );
    this._objectUrl = src?.startsWith('blob:') ? src : undefined;
    this.snapshotUrl = src ?? svgToDataUrl(sceneToSvg(this._scene));
  }

  private enterEdit() {
    this.selectSelf();
    if (!this.intersecting) return;
    const viewport = this.gfx()?.viewport;
    if (
      !tryLive(liveSketchBudget, {
        id: this.model.id,
        kind: 'sketch',
        selected: true,
        hovered: this.hovered,
        intersecting: this.intersecting,
        distanceToCenter: xywhCenterDistance(
          this.model.xywh,
          viewport?.center.x ?? 0,
          viewport?.center.y ?? 0
        ),
        exempt: !!this.model.props.liveBudgetExempt,
      })
    ) {
      return;
    }
    this._live = true;
    this.editing = true;
    this.setViewportLocked(true);
    this.setEditingPresence(true);
    this.readEditors();
    this.requestUpdate();
  }

  private async exitEdit() {
    if (!this.editing) return;
    this.editing = false;
    this.setViewportLocked(false);
    this.setEditingPresence(false);
    await this.persist(this._scene, false);
    this.syncLive();
  }

  private syncLive() {
    const want = this.canUseLive();
    const had = liveSketchBudget.has(this.model.id);
    const viewport = this.gfx()?.viewport;
    if (
      want &&
      tryLive(liveSketchBudget, {
        id: this.model.id,
        kind: 'sketch',
        selected: this.selected,
        hovered: this.hovered,
        intersecting: this.intersecting,
        distanceToCenter: xywhCenterDistance(
          this.model.xywh,
          viewport?.center.x ?? 0,
          viewport?.center.y ?? 0
        ),
        exempt: !!this.model.props.liveBudgetExempt,
      })
    ) {
      this._live = true;
      if (!had) this.requestUpdate();
      return;
    }
    if (had || this._live || this.editing) {
      if (this.editing) {
        this.editing = false;
        this.setViewportLocked(false);
        this.setEditingPresence(false);
        void this.persist(this._scene, false);
      }
      this._live = false;
      liveSketchBudget.release(this.model.id);
      this.teardownHost();
      this.requestUpdate();
    }
  }

  private teardownHost() {
    this._root?.unmount();
    this._root = null;
  }

  private async mountHost() {
    const host = this.renderRoot.querySelector('.wb-sketch__host');
    if (!this._live || !host) {
      this.teardownHost();
      return;
    }
    const [{ createElement }, { SketchRuntime }, { createRoot }] =
      await Promise.all([
        import('react'),
        import('./sketch-runtime'),
        import('react-dom/client'),
      ]);
    if (!this._root) this._root = createRoot(host);
    this._root.render(
      createElement(SketchRuntime, {
        scene: this._scene,
        editing: this.editing,
        sceneEpoch: this.sceneEpoch,
        collaborators: this.cursors,
        onPointerUpdate: (pointer: { x: number; y: number }) => {
          this.setEditingPresence(true, { ...pointer, button: 'up' });
        },
        onChange: scene => {
          if (this._collab?.applyingRemote) return;
          this._collab?.applyElements(
            scene.elements,
            scene.appState,
            scene.files
          );
          this._scene = scene;
          this.scheduleSnapshot();
        },
      })
    );
  }

  async exportSketch(kind: 'png' | 'svg' | 'excalidraw') {
    const svg = sceneToSvg(this._scene);
    if (kind === 'svg') {
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'sketch.svg');
      return;
    }
    if (kind === 'png') {
      const png = await svgToPngBlob(svg);
      if (png) downloadBlob(png, 'sketch.png');
      return;
    }
    downloadBlob(
      new Blob([serializeScene(this._scene)], {
        type: 'application/vnd.excalidraw+json',
      }),
      'sketch.excalidraw'
    );
  }

  async importExcalidraw(file: File) {
    const scene = parseExcalidrawJson(await file.text());
    await this.persist(scene);
    this.requestUpdate();
  }

  async copyScene() {
    const text = serializeScene(this._scene);
    try {
      const png = await svgToPngBlob(sceneToSvg(this._scene));
      if (png && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'image/png': png,
          }),
        ]);
        return;
      }
    } catch {
      // text/plain is enough for Phase 1 clipboard export
    }
    void navigator.clipboard?.writeText(text);
  }

  protected renderFrame() {
    const live = this._live;
    const kicker = this.editing
      ? this.editors.length
        ? I18n['com.affine.whiteboard.sketch.collab']()
        : I18n['com.affine.whiteboard.sketch.editing']()
      : this.lod === 'l0'
        ? I18n['com.affine.whiteboard.sketch.lod-l0']()
        : this.lod === 'l1'
          ? I18n['com.affine.whiteboard.sketch.lod-l1']()
          : I18n['com.affine.whiteboard.sketch.kicker']();

    return html`
      <div
        class="wb-sketch ${this.editing ? 'wb-sketch--editing' : ''}"
        @pointerenter=${() => {
          this.hovered = true;
          this.syncLive();
        }}
        @pointerleave=${() => {
          this.hovered = false;
          this.syncLive();
        }}
        @dblclick=${(event: MouseEvent) => {
          event.stopPropagation();
          this.enterEdit();
        }}
      >
        <div class="wb-sketch__header">
          <div class="wb-sketch__title">${this.titleText}</div>
          <div class="wb-sketch__kicker">${kicker}</div>
        </div>
        <div
          class="wb-sketch__body"
          @pointerdown=${(event: PointerEvent) => {
            if (this.editing) event.stopPropagation();
          }}
          @pointermove=${(event: PointerEvent) => this.reportPointer(event)}
          @wheel=${(event: WheelEvent) => {
            if (this.editing) event.stopPropagation();
          }}
        >
          ${live
            ? html`<div class="wb-sketch__host"></div>`
            : this.snapshotUrl
              ? html`<img
                  class="wb-sketch__snapshot"
                  src=${this.snapshotUrl}
                  alt=${this.titleText}
                />`
              : html`<div class="wb-sketch__placeholder">
                  ${I18n['com.affine.whiteboard.sketch.empty']()}
                </div>`}
          ${this.cursors.map(
            cursor => html`<div
              class="wb-sketch__cursor"
              style="left:${cursor.x}px;top:${cursor.y}px;--wb-sketch-cursor:${cursor.color}"
              title=${cursor.name}
            >
              <span class="wb-sketch__cursor-dot"></span>
              <span class="wb-sketch__cursor-name">${cursor.name}</span>
            </div>`
          )}
          ${this.editors.length
            ? html`<div class="wb-sketch__banner">
                ${I18n['com.affine.whiteboard.sketch.drawing']({
                  name: this.editors.join(', '),
                })}
              </div>`
            : nothing}
        </div>
      </div>
    `;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.add(
      this.model.propsUpdated.subscribe(() => {
        void this.refreshScene();
        this.requestUpdate();
      })
    );

    const gfx = this.gfx();
    if (gfx) {
      this.disposables.add(
        gfx.selection.slots.updated.subscribe(() => {
          this.selected = gfx.selection.has(this.model.id);
          if (!this.selected && this.editing) void this.exitEdit();
          this.syncLive();
        })
      );
      this.disposables.add(
        gfx.viewport.viewportUpdated.subscribe(() => this.syncLive())
      );
      this.selected = gfx.selection.has(this.model.id);
    } else {
      this.disposables.add(
        this.std.selection.slots.changed.subscribe(() => {
          this.selected = this.std.selection
            .filter(BlockSelection)
            .some(selection => selection.blockId === this.model.id);
          if (!this.selected && this.editing) void this.exitEdit();
          this.syncLive();
        })
      );
    }

    const onKey = (event: KeyboardEvent) => {
      if (!this.editing) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        void this.exitEdit();
        return;
      }
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || key !== 'z') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) this._collab?.redo();
      else this._collab?.undo();
      this._scene = this._collab?.toScene() ?? this._scene;
      this.sceneEpoch++;
      this.requestUpdate();
    };
    window.addEventListener('keydown', onKey);
    this.disposables.add(() => window.removeEventListener('keydown', onKey));

    const awareness = this.awareness();
    if (awareness?.on) {
      const onChange = () => this.readEditors();
      awareness.on('change', onChange);
      this.disposables.add(() => awareness.off?.('change', onChange));
    }
    this.readEditors();
    void this.attachCollab();
  }

  private async attachCollab() {
    this._collab = await openSketchCollab(this.model);
    this._scene = this._collab.toScene();
    const stop = this._collab.observe(() => {
      if (!this._collab) return;
      this._collab.applyingRemote = true;
      this._scene = this._collab.toScene();
      this.sceneEpoch++;
      this._collab.applyingRemote = false;
      if (!this.editing) void this.refreshSnapshot();
      this.requestUpdate();
    });
    this.disposables.add(() => {
      stop();
      this._collab?.dispose();
      this._collab = undefined;
    });
    await this.refreshSnapshot();
  }

  private async refreshScene() {
    if (this.editing) return;
    if (this._collab) {
      this._scene = this._collab.toScene();
      await this.refreshSnapshot();
      return;
    }
    const loaded = await loadScene(
      this.model.store,
      this.model.props.sceneBlobId
    );
    if (loaded) this._scene = loaded;
    await this.refreshSnapshot();
  }

  override firstUpdated() {
    const observer = new IntersectionObserver(
      entries => {
        this.intersecting = entries.some(entry => entry.isIntersecting);
        this.syncLive();
      },
      { rootMargin: '200px' }
    );
    observer.observe(this);
    this.disposables.add(() => observer.disconnect());
    this.syncLive();
  }

  override updated() {
    this.syncLive();
    if (this._live) void this.mountHost();
    else this.teardownHost();
  }

  override disconnectedCallback() {
    if (this._snapshotTimer) window.clearTimeout(this._snapshotTimer);
    this.reportPointer.cancel();
    if (this.editing) {
      this.setViewportLocked(false);
      this.setEditingPresence(false);
      void this.persist(this._scene, false);
    }
    this.teardownHost();
    liveSketchBudget.release(this.model.id);
    whiteboardPerfPolicy.forget(this.model.id);
    whiteboardTelemetry.forgetWidget(this.model.id);
    revokeObjectUrl(this._objectUrl);
    super.disconnectedCallback();
  }

  override renderBlock() {
    return this.renderFrame();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wb-sketch': SketchBlockComponent;
  }
}
