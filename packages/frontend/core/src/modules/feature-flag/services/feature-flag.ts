import { OnEvent, Service } from '@toeverything/infra';
import type { Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, skip } from 'rxjs';

import { ApplicationStarted } from '../../lifecycle';
import { Flags, type FlagsExt } from '../entities/flags';

export function bindReloadOnFlagChange(
  flag$: Observable<boolean>,
  reload: () => void
): Subscription {
  return flag$.pipe(distinctUntilChanged(), skip(1)).subscribe(() => {
    reload();
  });
}

@OnEvent(ApplicationStarted, e => e.setupRestartListener)
export class FeatureFlagService extends Service {
  flags = this.framework.createEntity(Flags) as FlagsExt;

  setupRestartListener() {
    const reload = () => window.location.reload();
    const enableAiReload = bindReloadOnFlagChange(
      this.flags.enable_ai.$,
      reload
    );
    const diskReload = bindReloadOnFlagChange(
      this.flags.enable_disk_sync.$,
      reload
    );
    this.disposables.push(
      () => enableAiReload.unsubscribe(),
      () => diskReload.unsubscribe()
    );
  }
}
