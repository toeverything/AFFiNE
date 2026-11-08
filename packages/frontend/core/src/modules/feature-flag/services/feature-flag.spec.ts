import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { bindReloadOnFlagChange } from './feature-flag';

describe('bindReloadOnFlagChange', () => {
  it('reloads only when flag value changes after initialization', () => {
    const flag$ = new BehaviorSubject(false);
    const reload = vi.fn();
    const subscription = bindReloadOnFlagChange(flag$, reload);

    expect(reload).not.toHaveBeenCalled();

    flag$.next(false);
    expect(reload).not.toHaveBeenCalled();

    flag$.next(true);
    expect(reload).toHaveBeenCalledTimes(1);

    flag$.next(true);
    expect(reload).toHaveBeenCalledTimes(1);

    flag$.next(false);
    expect(reload).toHaveBeenCalledTimes(2);

    subscription.unsubscribe();
  });

  it('stops reloading after unsubscribe', () => {
    const flag$ = new BehaviorSubject(false);
    const reload = vi.fn();
    const subscription = bindReloadOnFlagChange(flag$, reload);

    subscription.unsubscribe();
    flag$.next(true);

    expect(reload).not.toHaveBeenCalled();
  });
});
