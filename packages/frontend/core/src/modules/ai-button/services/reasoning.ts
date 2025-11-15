import {
  createSignalFromObservable,
  type Signal,
} from '@blocksuite/affine/shared/utils';
import { LiveData, Service } from '@toeverything/infra';

import type { GlobalStateService } from '../../storage';

const AI_REASONING_KEY = 'AIReasoning';

export class AIReasoningService extends Service {
  constructor(private readonly globalStateService: GlobalStateService) {
    super();

    const { signal: enabled, cleanup: enabledCleanup } =
      createSignalFromObservable<boolean | undefined>(
        this._enabled$,
        undefined
      );
    this.enabled = enabled;
    this.disposables.push(enabledCleanup);
  }

  enabled: Signal<boolean | undefined>;

  private readonly _enabled$ = LiveData.from(
    this.globalStateService.globalState.watch<boolean>(AI_REASONING_KEY),
    undefined
  );

  setEnabled = (enabled: boolean) => {
    this.globalStateService.globalState.set(AI_REASONING_KEY, enabled);
  };
}
