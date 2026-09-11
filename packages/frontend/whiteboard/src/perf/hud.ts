import { I18n } from '@affine/i18n';
import { css, html, LitElement } from 'lit';
import { state } from 'lit/decorators.js';

import { startRttProbe, whiteboardTelemetry } from './telemetry';

export class WhiteboardPerfHud extends LitElement {
  static override styles = css`
    :host {
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 20;
      pointer-events: none;
      font: 11px/1.4 var(--affine-font-family, sans-serif);
    }

    .wb-perf-hud {
      min-width: 180px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--affine-border-color);
      background: var(--affine-background-overlay-panel-color);
      color: var(--affine-text-primary-color);
      box-shadow: var(--affine-shadow-1);
    }

    .wb-perf-hud__title {
      font-weight: 600;
      margin-bottom: 4px;
    }

    dt {
      color: var(--affine-text-secondary-color);
    }

    dl {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 2px 12px;
      margin: 0;
    }
  `;

  @state()
  accessor frameTime = 0;

  @state()
  accessor liveWidgetCount = 0;

  @state()
  accessor cullRatio = 0;

  @state()
  accessor wsRtt = 0;

  @state()
  accessor l0SpriteCount = 0;

  @state()
  accessor l0Backend = 'off';

  @state()
  accessor echartsInitMs = 0;

  @state()
  accessor snapshotAgeS = 0;

  @state()
  accessor droppedFrames = 0;

  @state()
  accessor boardObjectCount = 0;

  @state()
  accessor liveCollaborators = 0;

  @state()
  accessor yjsApplyMs = 0;

  @state()
  accessor wsPayloadBytes = 0;

  private _timer = 0;

  private _stopRttProbe: (() => void) | null = null;

  override connectedCallback() {
    super.connectedCallback();
    whiteboardTelemetry.start();
    this._stopRttProbe = startRttProbe();
    this.tick();
    this._timer = window.setInterval(() => this.tick(), 500);
  }

  override disconnectedCallback() {
    window.clearInterval(this._timer);
    this._stopRttProbe?.();
    this._stopRttProbe = null;
    whiteboardTelemetry.stop();
    super.disconnectedCallback();
  }

  private tick() {
    const snap = whiteboardTelemetry.snapshot();
    this.frameTime = snap.frameTime;
    this.liveWidgetCount = snap.liveWidgetCount;
    this.cullRatio = snap.cullRatio;
    this.wsRtt = snap.wsRtt;
    this.l0SpriteCount = snap.l0SpriteCount;
    this.l0Backend = snap.l0Backend;
    this.echartsInitMs = snap.echartsInitMs;
    this.snapshotAgeS = snap.snapshotAgeS;
    this.droppedFrames = snap.droppedFrames;
    this.boardObjectCount = snap.boardObjectCount;
    this.liveCollaborators = snap.liveCollaborators;
    this.yjsApplyMs = snap.yjsApplyMs;
    this.wsPayloadBytes = snap.wsPayloadBytes;
  }

  override render() {
    return html`
      <div class="wb-perf-hud" data-wb-perf-hud>
        <div class="wb-perf-hud__title">
          ${I18n['com.affine.whiteboard.perf.hud-title']()}
        </div>
        <dl>
          <dt>${I18n['com.affine.whiteboard.perf.frame-time']()}</dt>
          <dd>${this.frameTime.toFixed(1)} ms</dd>
          <dt>${I18n['com.affine.whiteboard.perf.live-widgets']()}</dt>
          <dd>${this.liveWidgetCount}</dd>
          <dt>${I18n['com.affine.whiteboard.perf.cull-ratio']()}</dt>
          <dd>${(this.cullRatio * 100).toFixed(0)}%</dd>
          <dt>${I18n['com.affine.whiteboard.perf.ws-rtt']()}</dt>
          <dd>${this.wsRtt ? `${this.wsRtt.toFixed(0)} ms` : '—'}</dd>
          <dt>${I18n['com.affine.whiteboard.perf.l0-sprites']()}</dt>
          <dd>${this.l0SpriteCount}</dd>
          <dt>${I18n['com.affine.whiteboard.perf.l0-backend']()}</dt>
          <dd>${this.l0Backend}</dd>
          <dt>${I18n['com.affine.whiteboard.perf.echarts-init']()}</dt>
          <dd>${this.echartsInitMs.toFixed(0)} ms</dd>
          <dt>${I18n['com.affine.whiteboard.perf.snapshot-age']()}</dt>
          <dd>${this.snapshotAgeS.toFixed(0)} s</dd>
          <dt>${I18n['com.affine.whiteboard.perf.dropped-frames']()}</dt>
          <dd>${this.droppedFrames}</dd>
          <dt>${I18n['com.affine.whiteboard.perf.board-objects']()}</dt>
          <dd>${this.boardObjectCount}</dd>
          <dt>${I18n['com.affine.whiteboard.perf.collaborators']()}</dt>
          <dd>${this.liveCollaborators}</dd>
          <dt>${I18n['com.affine.whiteboard.perf.yjs-apply']()}</dt>
          <dd>${this.yjsApplyMs.toFixed(1)} ms</dd>
          <dt>${I18n['com.affine.whiteboard.perf.ws-payload']()}</dt>
          <dd>${this.wsPayloadBytes} B</dd>
        </dl>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wb-perf-hud': WhiteboardPerfHud;
  }
}
