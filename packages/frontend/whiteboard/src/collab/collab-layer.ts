import { I18n } from '@affine/i18n';
import {
  CommentProviderIdentifier,
  FeatureFlagService,
} from '@blocksuite/affine/shared/services';
import { GfxExtension } from '@blocksuite/affine/std/gfx';

import { parseXywhRect } from '../perf/l0-scene';
import {
  getDocAwareness,
  patchCollabAwareness,
  readLocalPayload,
} from './awareness';
import { pinsForBlock, type CommentPin } from './comment-anchor';
import { WhiteboardPresenceBar } from './presence-bar';
import {
  ATTENTION_TTL_MS,
  POINTER_THROTTLE_MS,
  VIEWPORT_THROTTLE_MS,
  followViewport,
  isAttentionActive,
  makeAttention,
  readPeers,
  shouldPublish,
  type WhiteboardPeer,
} from './protocol';

/**
 * Presence, follow, attention pulse and gfx comment pins (plan §6.6).
 */
export class WhiteboardCollabLayerExtension extends GfxExtension {
  static override key = 'whiteboardCollabLayer';

  private readonly overlay: HTMLDivElement = document.createElement('div');
  private bar: WhiteboardPresenceBar | null = null;
  private lastPointer = 0;
  private lastViewport = 0;
  private following: number | null = null;
  private attentionTimer = 0;
  private readonly unsubs: Array<() => void> = [];

  private readonly onPointerMove = (event: Event) => {
    if (!(event instanceof PointerEvent)) return;
    const now = Date.now();
    if (!shouldPublish(this.lastPointer, now, POINTER_THROTTLE_MS)) return;
    this.lastPointer = now;
    const [x, y] = this.gfx.viewport.toModelCoordFromClientCoord([
      event.clientX,
      event.clientY,
    ]);
    patchCollabAwareness(this.awareness(), { pointer: { x, y } });
  };

  override mounted() {
    if (!this.flagEnabled()) return;
    this.overlay.className = 'wb-collab-overlay';
    this.overlay.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:2;';
    const mount =
      document.querySelector('.affine-edgeless-viewport') ?? this.std.host;
    mount.append(this.overlay);

    if (!customElements.get('wb-presence-bar')) {
      customElements.define('wb-presence-bar', WhiteboardPresenceBar);
    }
    this.bar = document.createElement('wb-presence-bar');
    this.bar.onFollow = clientId => this.setFollow(clientId);
    this.bar.onAttention = () => this.publishAttention();
    document.body.append(this.bar);

    const element = this.gfx.viewport.element ?? mount;
    element.addEventListener('pointermove', this.onPointerMove);
    const viewport = this.gfx.viewport.viewportUpdated.subscribe(() => {
      this.publishViewport();
      this.draw();
    });
    const awareness = this.awareness();
    const onChange = () => this.onAwareness();
    awareness?.on?.('change', onChange);
    this.unsubs.push(
      () => viewport.unsubscribe(),
      () => awareness?.off?.('change', onChange),
      () => element.removeEventListener('pointermove', this.onPointerMove)
    );
    this.publishViewport();
    this.onAwareness();
  }

  override unmounted() {
    if (this.attentionTimer) window.clearTimeout(this.attentionTimer);
    for (const unsub of this.unsubs.splice(0)) unsub();
    this.bar?.remove();
    this.bar = null;
    this.overlay.remove();
    patchCollabAwareness(this.awareness(), {
      pointer: undefined,
      followClientId: null,
      attention: undefined,
    });
  }

  private awareness() {
    return getDocAwareness(this.std.store);
  }

  private flagEnabled() {
    try {
      const service =
        this.std.getOptional(FeatureFlagService) ??
        this.std.store.get(FeatureFlagService);
      return !!service.getFlag('enable_whiteboard_collab');
    } catch {
      return true;
    }
  }

  private setFollow(clientId: number | null) {
    this.following = clientId;
    patchCollabAwareness(this.awareness(), { followClientId: clientId });
    this.applyFollow();
    this.syncBar();
  }

  private publishViewport() {
    const now = Date.now();
    if (!shouldPublish(this.lastViewport, now, VIEWPORT_THROTTLE_MS)) return;
    this.lastViewport = now;
    const viewport = this.gfx.viewport;
    patchCollabAwareness(this.awareness(), {
      viewport: {
        x: viewport.centerX,
        y: viewport.centerY,
        zoom: viewport.zoom,
      },
    });
  }

  private publishAttention() {
    const bound = this.gfx.viewport.viewportBounds;
    patchCollabAwareness(this.awareness(), {
      attention: makeAttention({
        x: bound.x,
        y: bound.y,
        w: bound.w,
        h: bound.h,
      }),
    });
    if (this.attentionTimer) window.clearTimeout(this.attentionTimer);
    this.attentionTimer = window.setTimeout(() => {
      patchCollabAwareness(this.awareness(), { attention: undefined });
      this.draw();
    }, ATTENTION_TTL_MS);
    this.draw();
  }

  private onAwareness() {
    if (this.following != null) this.applyFollow();
    this.syncBar();
    this.draw();
  }

  private applyFollow() {
    const states = this.awareness()?.getStates?.();
    if (!states || this.following == null) return;
    const viewport = followViewport(
      states as never,
      this.following
    );
    if (!viewport) return;
    this.gfx.viewport.setViewport(viewport.zoom, [viewport.x, viewport.y]);
  }

  private syncBar() {
    if (!this.bar) return;
    const awareness = this.awareness();
    const states = awareness?.getStates?.();
    this.bar.peers = states
      ? readPeers(states as never, awareness?.clientID)
      : [];
    this.bar.following =
      this.following ?? readLocalPayload(awareness)?.followClientId ?? null;
    this.bar.requestUpdate();
  }

  private commentPins(): CommentPin[] {
    const pins: CommentPin[] = [];
    for (const model of this.gfx.layer.blocks) {
      const rect = parseXywhRect(model.xywh);
      if (!rect) continue;
      const comments = (
        model as { comments?: Record<string, boolean>; props?: { comments?: Record<string, boolean> } }
      ).comments ?? (model as { props?: { comments?: Record<string, boolean> } }).props
        ?.comments;
      pins.push(...pinsForBlock(model.id, rect, comments));
    }
    return pins;
  }

  private draw() {
    const camera = this.gfx.viewport;
    const scale = camera.zoom * camera.viewScale;
    const toView = (x: number, y: number) => ({
      x: (x - camera.viewportX) * scale,
      y: (y - camera.viewportY) * scale,
    });
    const awareness = this.awareness();
    const peers: WhiteboardPeer[] = awareness?.getStates?.()
      ? readPeers(awareness.getStates() as never, awareness.clientID)
      : [];
    const pulses = peers
      .map(peer => peer.attention)
      .filter(bound => isAttentionActive(bound));
    const local = readLocalPayload(awareness)?.attention;
    if (isAttentionActive(local)) pulses.push(local);

    const pins = this.commentPins();
    this.overlay.replaceChildren();
    for (const pulse of pulses) {
      if (!pulse) continue;
      const topLeft = toView(pulse.x, pulse.y);
      const node = document.createElement('div');
      node.className = 'wb-collab-pulse';
      node.style.cssText = `position:absolute;left:${topLeft.x}px;top:${topLeft.y}px;width:${pulse.w * scale}px;height:${pulse.h * scale}px;border:2px solid var(--affine-primary-color);border-radius:8px;box-shadow:0 0 0 6px color-mix(in srgb, var(--affine-primary-color) 25%, transparent);pointer-events:none;`;
      this.overlay.append(node);
    }
    for (const pin of pins) {
      const view = toView(pin.x, pin.y);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wb-collab-pin';
      button.setAttribute(
        'aria-label',
        I18n['com.affine.whiteboard.collab.comment-pin']()
      );
      button.style.cssText = `position:absolute;left:${view.x - 8}px;top:${view.y - 8}px;width:16px;height:16px;border:0;border-radius:50%;background:var(--affine-primary-color);pointer-events:auto;cursor:pointer;`;
      button.addEventListener('click', event => {
        event.stopPropagation();
        this.std
          .getOptional(CommentProviderIdentifier)
          ?.highlightComment(pin.commentId);
      });
      this.overlay.append(button);
    }
  }
}
