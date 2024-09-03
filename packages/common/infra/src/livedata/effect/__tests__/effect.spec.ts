import type { Subscriber } from 'rxjs';
import { from, Observable, switchMap } from 'rxjs';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  catchErrorInto,
  effect,
  LiveData,
  mapInto,
  onComplete,
  onStart,
} from '../../';

describe('example', () => {
  type User = {
    id: number;
    name: string;
  };

  const fetchUser = vi.fn<(id: number) => Promise<User>>();

  const user$ = new LiveData<User | null>(null);
  const isLoading$ = new LiveData<boolean>(false);
  const error$ = new LiveData<Error | null>(null);

  const loadUser = effect(
    switchMap((id: number) =>
      from(fetchUser(id)).pipe(
        mapInto(user$),
        catchErrorInto(error$),
        onStart(() => isLoading$.next(true)),
        onComplete(() => isLoading$.next(false))
      )
    )
  );

  beforeEach(() => {
    fetchUser.mockClear();

    user$.next(null);
    isLoading$.next(false);
    error$.next(null);
  });

  test('basic', async () => {
    fetchUser.mockImplementation(async id => ({ id, name: 'John' }));
    loadUser(1);
    await vi.waitFor(() =>
      expect(user$.value).toStrictEqual({ id: 1, name: 'John' })
    );
    expect(fetchUser).toHaveBeenCalledOnce();
    expect(fetchUser).toHaveBeenCalledWith(1);
  });

  test('error', async () => {
    fetchUser.mockRejectedValue(new Error('some error'));
    loadUser(1);
    await vi.waitFor(() => expect(error$.value).toBeInstanceOf(Error));
    await vi.waitFor(() => expect(isLoading$.value).toBe(false));
  });

  test('isLoading', async () => {
    let resolveFn: (value: User) => void = null!;
    fetchUser.mockReturnValue(
      new Promise(resolve => {
        resolveFn = resolve;
      })
    );
    loadUser(1);
    await vi.waitFor(() => expect(isLoading$.value).toBe(true));
    expect(fetchUser).toHaveBeenCalledOnce();
    resolveFn({ id: 1, name: 'John' });
    await vi.waitFor(() => expect(isLoading$.value).toBe(false));
  });

  test('switchMap', async () => {
    let fetch1: Subscriber<User> = null!;
    let fetch1Canceled = false;
    fetchUser.mockReturnValue(
      new Observable<User>(subscriber => {
        fetch1 = subscriber;
        return () => {
          fetch1Canceled = true;
        };
      }) as any
    );

    loadUser(1);
    await vi.waitFor(() => expect(fetch1).toBeTruthy());
    expect(isLoading$.value).toBe(true);

    // start fetch2, should cancel fetch1
    let fetch2: Subscriber<User> = null!;
    fetchUser.mockReturnValue(
      new Observable<User>(subscriber => {
        fetch2 = subscriber;
      }) as any
    );
    loadUser(2);
    await vi.waitFor(() => expect(fetch1Canceled).toBe(true));
    expect(isLoading$.value).toBe(true);

    // fetch1 fail, should not affect fetch2
    fetch1.error(new Error('some error'));
    expect(error$.value).toBe(null);

    // make fetch2 complete
    fetch2.next({ id: 2, name: 'John' });
    fetch2.complete();

    // should update user$ to fetch2 result
    await vi.waitFor(() =>
      expect(user$.value).toStrictEqual({ id: 2, name: 'John' })
    );
    // should not have error
    expect(error$.value).toBe(null);
    expect(isLoading$.value).toBe(false);
  });
});
