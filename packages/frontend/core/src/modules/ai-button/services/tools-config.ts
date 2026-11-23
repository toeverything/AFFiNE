import {
  createSignalFromObservable,
  type Signal,
} from '@blocksuite/affine/shared/utils';
import { LiveData, Service } from '@toeverything/infra';
import { map } from 'rxjs';

import type { GlobalStateService } from '../../storage';

const AI_TOOLS_CONFIG_KEY = 'AIToolsConfig';

export interface AIToolsConfig {
  searchWorkspace?: boolean;
  readingDocs?: boolean;
}

export class AIToolsConfigService extends Service {
  constructor(private readonly globalStateService: GlobalStateService) {
    super();

    const { signal, cleanup: enabledCleanup } =
      createSignalFromObservable<AIToolsConfig>(this.config$, {
        searchWorkspace: true,
        readingDocs: true,
      });
    this.config = signal;
    this.disposables.push(enabledCleanup);
  }

  config: Signal<AIToolsConfig>;

  private readonly config$ = LiveData.from(
    this.globalStateService.globalState.watch<AIToolsConfig>(
      AI_TOOLS_CONFIG_KEY
    ),
    undefined
  ).pipe(
    map(config => ({
      searchWorkspace: config?.searchWorkspace ?? true,
      readingDocs: config?.readingDocs ?? true,
    }))
  );

  setConfig = (data: Partial<AIToolsConfig>) => {
    this.globalStateService.globalState.set(AI_TOOLS_CONFIG_KEY, {
      ...this.config.value,
      ...data,
    });
  };
}
