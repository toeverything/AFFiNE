import { OnEvent, Service } from '@toeverything/infra';
import { distinctUntilChanged } from 'rxjs';

import type { FeatureFlagService } from '../../feature-flag';
import { ApplicationStarted } from '../../lifecycle';
import { setMermaidWasmNativeRendererEnabled } from '../runtime-config';

@OnEvent(ApplicationStarted, e => e.syncFlag)
export class PreviewRendererFeatureSyncService extends Service {
  constructor(private readonly featureFlagService: FeatureFlagService) {
    super();
  }

  syncFlag() {
    const mermaidFlag =
      this.featureFlagService.flags.enable_mermaid_wasm_native_renderer;

    setMermaidWasmNativeRendererEnabled(!!mermaidFlag.value);
    const subscription = mermaidFlag.$.pipe(distinctUntilChanged()).subscribe(
      enabled => {
        setMermaidWasmNativeRendererEnabled(!!enabled);
      }
    );
    this.disposables.push(() => subscription.unsubscribe());
  }
}
