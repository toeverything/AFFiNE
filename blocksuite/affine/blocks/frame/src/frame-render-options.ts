import type { Store } from '@blocksuite/store';
import { html } from 'lit';

type FrameRenderOptions = {
  showInnerFrames?: boolean;
  showGrid?: boolean;
  showNotes?: boolean;
};

type ModelWithRenderOptions = {
  props: { frameRenderOptions?: FrameRenderOptions };
};

/**
 * The frame's render options as shown in an embed of it: grid and inner
 * frames off, notes on, unless set. Shared by the in-page embed's and the
 * edgeless frame's "Frame size" menus, so both edit the same options.
 */
export function resolveFrameRenderOptions(
  options: FrameRenderOptions | undefined
): Required<FrameRenderOptions> {
  return {
    showInnerFrames: options?.showInnerFrames ?? false,
    showGrid: options?.showGrid ?? false,
    showNotes: options?.showNotes ?? true,
  };
}

/**
 * A "Show" section with Grid / Inner frames / Notes toggles for a frame's
 * render options. `model` is the frame itself, or (for an embed of something
 * other than a frame) the embed, which then keeps its own options.
 */
export function renderFrameRenderOptionToggles(
  store: Store,
  model: ModelWithRenderOptions
) {
  const current = resolveFrameRenderOptions(model.props.frameRenderOptions);
  const toggle = (key: keyof FrameRenderOptions) => (event: Event) => {
    event.stopPropagation();
    store.captureSync();
    store.updateBlock(model as never, {
      frameRenderOptions: { ...current, [key]: !current[key] },
    });
  };
  const item = (
    key: keyof FrameRenderOptions,
    label: string,
    name = label.toLowerCase()
  ) =>
    html`<editor-menu-action
      aria-label=${`Show ${name}`}
      aria-pressed=${current[key] ? 'true' : 'false'}
      @click=${toggle(key)}
      style=${`padding:0 6px;height:24px;white-space:nowrap;${current[key] ? 'background-color:var(--affine-hover-color);' : ''}`}
    >
      ${label}
    </editor-menu-action>`;

  return html`<div
      class="custom"
      style="font-size:12px;color:var(--affine-text-secondary-color);padding:6px 8px 2px;font-weight:500;"
    >
      Show
    </div>
    <div
      class="custom"
      style="display:flex;align-items:center;gap:6px;padding:2px 8px 6px;"
    >
      ${item('showGrid', 'Grid')}
      ${item('showInnerFrames', 'Frames', 'inner frames')}
      ${item('showNotes', 'Notes')}
    </div>`;
}
