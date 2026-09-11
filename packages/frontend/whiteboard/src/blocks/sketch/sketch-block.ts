import { I18n } from '@affine/i18n';
import { BlockComponent, BlockSelection } from '@blocksuite/affine/std';
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx';
import { html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import type { Root } from 'react-dom/client';

import {
  publishWidgetEditing,
  remoteOwnsLiveEditor,
} from '../../collab/awareness';
import { detach } from '../../detach';
import { replacedSnapshotId } from '../../infra/blob-gc';
import { importWhiteboardFile } from '../../infra/import';
import { canEditBoardWidgets } from '../../infra/permissions';
import {
  tryLive,
  whiteboardPerfPolicy,
  xywhCenterDistance,
} from '../../perf/policy';
import { whiteboardTelemetry } from '../../perf/telemetry';
import {
  collectSceneAssets,
  readSketchAssets,
  sameSketchAssets,
  writeSketchAssets,
} from './assets';
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
  type SketchAwarenessPayload,
  type SketchPointerButton,
  type SketchRemoteCursor,
  throttle,
} from './cursors';
import { sceneToExportedSvg } from './export';
import { sketchSceneFromImport } from './import';
import { getSketchLodLevel, liveSketchBudget } from './live-budget';
import type { SketchBlockModel } from './model';
import { createEmptyScene, serializeScene } from './scene';
import { sketchBlockStyles } from './styles';
import type { SketchCollab } from './subdoc';
import { openSketchCollab } from './subdoc';
import { svgToDataUrl } from './svg';
import type { SketchScene } from './types';
import { reconcileSketchY } from './y-binding';

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
  private _persistedScene?: string;
  private _snapshotGeneration?: string;

  protected get titleText() {
    const title = this.model.props.title;
    const value = typeof title === 'string' ? title : title?.toString();
    return value || I18n['com.affine.whiteboard.sketch.title']();
  }

  private get zoom() {
    return this.gfxController()?.viewport.zoom ?? 1;
  }

  private get lod() {
    return getSketchLodLevel(this.zoom, this.selected, this.hovered);
  }

  private canUseLive() {
    if (!this.intersecting) return false;
    if (remoteOwnsLiveEditor(this.std.store, this.model.id)) return false;
    return this.lod === 'l2';
  }

  /**
   * Not named `gfx`: the `toGfxBlockComponent` mixin defines a `gfx` getter on a
   * more derived prototype, which would shadow this method at runtime.
   */
  private gfxController() {
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
    const gfx = this.gfxController();
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
    const viewport = this.gfxController()?.viewport;
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
    publishWidgetEditing(
      this.std.store,
      this.model.flavour,
      on ? this.model.id : null
    );
  }

  private readEditors() {
    const awareness = this.awareness();
    const states = awareness?.getStates?.();
    if (!awareness || !states) {
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

  /** One throttle for both pointer sources: DOM moves and Excalidraw (§6.6). */
  private readonly publishPointer = throttle(
    (x: number, y: number, button: SketchPointerButton) => {
      if (!this.editing) return;
      this.setEditingPresence(true, { x, y, button });
    },
    40
  );

  private reportPointer(event: PointerEvent) {
    if (!this.editing) return;
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    this.publishPointer(
      event.clientX - rect.left,
      event.clientY - rect.top,
      event.buttons ? 'down' : 'up'
    );
  }

  private scheduleSnapshot() {
    if (this._snapshotTimer) window.clearTimeout(this._snapshotTimer);
    this._snapshotTimer = window.setTimeout(() => {
      this._snapshotTimer = undefined;
      detach(this.persist(this._scene, false));
    }, 1000);
  }

  private async persist(scene = this._scene, writeY = true) {
    if (!canEditBoardWidgets(this.std.store, this.model)) return;
    if (writeY && this._collab && !this._collab.applyingRemote) {
      this._collab.applyScene(scene);
    }
    this._scene = this._collab ? this._collab.toScene() : scene;
    const serialized = serializeScene(this._scene);
    if (serialized === this._persistedScene && this.model.props.sceneBlobId) {
      await this.refreshSnapshot();
      return;
    }
    const previousScene = this.model.props.sceneBlobId;
    const previousSvg = this.model.props.snapshotSvgBlobId;
    const previousAssets = readSketchAssets(this.model.props.assets);
    const assets = await collectSceneAssets(
      this.model.store,
      this._scene,
      previousAssets
    );
    const sceneId = await saveScene(this.model.store, this._scene);
    const svgId = await saveSvg(
      this.model.store,
      await sceneToExportedSvg(this._scene)
    );
    this.model.store.captureSync();
    replacedSnapshotId(previousScene, sceneId);
    replacedSnapshotId(previousSvg, svgId);
    this.model.props.sceneBlobId = sceneId;
    this.model.props.snapshotSvgBlobId = svgId;
    if (!sameSketchAssets(previousAssets, assets)) {
      this.model.props.assets = writeSketchAssets(
        this.model.props.assets,
        assets
      );
    }
    this.model.props.revision = (this.model.props.revision ?? 0) + 1;
    this._persistedScene = serialized;
    whiteboardTelemetry.noteSnapshotWritten();
    await this.refreshSnapshot();
  }

  /**
   * `revision` plus the scene epoch identify the current snapshot, so repeated
   * persists and prop updates do not rebuild the same SVG (§6.4).
   */
  private async refreshSnapshot() {
    const generation = `${this.model.props.revision ?? 0}:${this.sceneEpoch}`;
    if (this.snapshotUrl && this._snapshotGeneration === generation) return;
    this._snapshotGeneration = generation;
    revokeObjectUrl(this._objectUrl);
    this._objectUrl = undefined;
    const src = await resolveBlobSrc(
      this.model.store,
      this.model.props.snapshotSvgBlobId
    );
    this._objectUrl = src?.startsWith('blob:') ? src : undefined;
    this.snapshotUrl =
      src ?? svgToDataUrl(await sceneToExportedSvg(this._scene));
  }

  private enterEdit() {
    this.selectSelf();
    if (!canEditBoardWidgets(this.std.store, this.model)) return;
    if (!this.intersecting) return;
    if (remoteOwnsLiveEditor(this.std.store, this.model.id)) return;
    const viewport = this.gfxController()?.viewport;
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
    const viewport = this.gfxController()?.viewport;
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
        detach(this.persist(this._scene, false));
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
        onPointerUpdate: (pointer: {
          x: number;
          y: number;
          button?: SketchPointerButton;
        }) => {
          this.publishPointer(pointer.x, pointer.y, pointer.button ?? 'up');
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
    if (kind === 'excalidraw') {
      downloadBlob(
        new Blob([serializeScene(this._scene)], {
          type: 'application/vnd.excalidraw+json',
        }),
        'sketch.excalidraw'
      );
      return;
    }
    const svg = await sceneToExportedSvg(this._scene);
    if (kind === 'svg') {
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'sketch.svg');
      return;
    }
    const png = await svgToPngBlob(svg);
    if (png) downloadBlob(png, 'sketch.png');
  }

  /** `.excalidraw`, draw.io XML and Miro CSV all land here (§6.8). */
  async importFile(file: File) {
    if (!canEditBoardWidgets(this.std.store, this.model)) return;
    const payload = await importWhiteboardFile(this.model.store, file);
    if (!payload) return;
    const scene = sketchSceneFromImport(payload, this._scene);
    if (!scene) return;
    await this.persist(scene);
    this.requestUpdate();
  }

  async copyScene() {
    const text = serializeScene(this._scene);
    try {
      const png = await svgToPngBlob(await sceneToExportedSvg(this._scene));
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
    detach(navigator.clipboard?.writeText(text));
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
          ${
            live
              ? html`<div class="wb-sketch__host"></div>`
              : this.snapshotUrl
                ? html`<img
                    class="wb-sketch__snapshot"
                    src=${this.snapshotUrl}
                    alt=${this.titleText}
                  />`
                : html`<div class="wb-sketch__placeholder">
                    ${I18n['com.affine.whiteboard.sketch.empty']()}
                  </div>`
          }
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
          ${
            this.editors.length
              ? html`<div class="wb-sketch__banner">
                  ${I18n['com.affine.whiteboard.sketch.drawing']({
                    name: this.editors.join(', '),
                  })}
                </div>`
              : nothing
          }
        </div>
      </div>
    `;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.add(
      this.model.propsUpdated.subscribe(() => {
        detach(this.refreshScene());
        this.requestUpdate();
      })
    );

    const gfx = this.gfxController();
    if (gfx) {
      this.disposables.add(
        gfx.selection.slots.updated.subscribe(() => {
          this.selected = gfx.selection.has(this.model.id);
          if (!this.selected && this.editing) detach(this.exitEdit());
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
          if (!this.selected && this.editing) detach(this.exitEdit());
          this.syncLive();
        })
      );
    }

    const onKey = (event: KeyboardEvent) => {
      if (!this.editing) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        detach(this.exitEdit());
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
    detach(this.attachCollab());
  }

  private async attachCollab() {
    let collab: SketchCollab;
    try {
      collab = await openSketchCollab(this.model);
    } catch {
      // Subdoc unavailable (e.g. no workspace sync): stay on the blob scene.
      await this.refreshScene();
      return;
    }
    if (!this.isConnected) {
      collab.dispose();
      return;
    }
    this._collab = collab;
    this._scene = this._collab.toScene();
    const stop = this._collab.observe(() => {
      if (!this._collab) return;
      const started = performance.now();
      this._collab.applyingRemote = true;
      reconcileSketchY(this._collab.doc, this._scene.elements);
      this._scene = this._collab.toScene();
      this.sceneEpoch++;
      this._collab.applyingRemote = false;
      whiteboardTelemetry.noteYjsApply(performance.now() - started);
      if (!this.editing) detach(this.refreshSnapshot());
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
    if (this._live) detach(this.mountHost());
    else this.teardownHost();
  }

  override disconnectedCallback() {
    if (this._snapshotTimer) window.clearTimeout(this._snapshotTimer);
    this.publishPointer.cancel();
    if (this.editing) {
      this.setViewportLocked(false);
      this.setEditingPresence(false);
      detach(this.persist(this._scene, false));
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
