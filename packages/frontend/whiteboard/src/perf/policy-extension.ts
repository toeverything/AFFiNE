import { GfxExtension } from '@blocksuite/affine/std/gfx';

import { registerScopedPerfPolicy, WhiteboardPerfPolicy } from './policy';
import { whiteboardTelemetry } from './telemetry';

/**
 * Scopes the live-widget policy of plan §6.5 to one editor: the widgets of a
 * closed document stop competing for live slots instead of holding them until
 * the tab is reloaded.
 */
export class WhiteboardPerfPolicyExtension extends GfxExtension {
  static override key = 'whiteboardPerfPolicy';

  readonly policy: WhiteboardPerfPolicy = new WhiteboardPerfPolicy();

  private unregister: (() => void) | null = null;

  override mounted() {
    this.unregister = registerScopedPerfPolicy({
      policy: this.policy,
      owns: id => this.std.store.hasBlock(id),
    });
  }

  override unmounted() {
    this.unregister?.();
    this.unregister = null;
    for (const candidate of this.policy.list()) {
      whiteboardTelemetry.forgetWidget(candidate.id);
    }
    this.policy.reset();
  }
}
