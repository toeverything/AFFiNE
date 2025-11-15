import { DebugLogger } from '@affine/debug';
import { Unreachable } from '@affine/env/constant';
import { type OperatorFunction, Subject, type Subscription } from 'rxjs';

const logger = new DebugLogger('effect');

export type Effect<T> = (T | undefined extends T // hack to detect if T is unknown
  ? () => void
  : (value: T) => void) & {
  // unsubscribe effect, all ongoing effects will be cancelled.
  unsubscribe: () => void;
  // reset internal state, all ongoing effects will be cancelled.
  reset: () => void;
};

/**
 * Create an effect.
 *
 * `effect( op1, op2, op3, ... )`
 *
 * You can think of an effect as a pipeline. When the effect is called, argument will be sent to the pipeline,
 * and the operators in the pipeline can be triggered.
 *
 *
 *
 * @example
 * ```ts
 * const loadUser = effect(
 *   switchMap((id: number) =>
 *     from(fetchUser(id)).pipe(
 *       mapInto(user$),
 *       catchErrorInto(error$),
 *       onStart(() => isLoading$.next(true)),
 *       onComplete(() => isLoading$.next(false))
 *     )
 *   )
 * );
 *
 * // emit value to effect
 * loadUser(1);
 *
 * // unsubscribe effect, will stop all ongoing processes
 * loadUser.unsubscribe();
 * ```
 */
export function effect<T, A>(op1: OperatorFunction<T, A>): Effect<T>;
export function effect<T, A, B>(
  op1: OperatorFunction<T, A>,
  op2: OperatorFunction<A, B>
): Effect<T>;
export function effect<T, A, B, C>(
  op1: OperatorFunction<T, A>,
  op2: OperatorFunction<A, B>,
  op3: OperatorFunction<B, C>
): Effect<T>;
export function effect<T, A, B, C, D>(
  op1: OperatorFunction<T, A>,
  op2: OperatorFunction<A, B>,
  op3: OperatorFunction<B, C>,
  op4: OperatorFunction<C, D>
): Effect<T>;
export function effect<T, A, B, C, D, E>(
  op1: OperatorFunction<T, A>,
  op2: OperatorFunction<A, B>,
  op3: OperatorFunction<B, C>,
  op4: OperatorFunction<C, D>,
  op5: OperatorFunction<D, E>
): Effect<T>;
export function effect<T, A, B, C, D, E, F>(
  op1: OperatorFunction<T, A>,
  op2: OperatorFunction<A, B>,
  op3: OperatorFunction<B, C>,
  op4: OperatorFunction<C, D>,
  op5: OperatorFunction<D, E>,
  op6: OperatorFunction<E, F>
): Effect<T>;
export function effect(...args: any[]) {
  const subject$ = new Subject<any>();

  const effectLocation = BUILD_CONFIG.debug
    ? `(${new Error().stack?.split('\n')[2].trim()})`
    : '';

  class EffectError extends Unreachable {
    constructor(message: string, value?: any) {
      logger.error(`effect ${effectLocation} ${message}`, value);
      super(
        `effect ${effectLocation} ${message}` +
          ` ${value ? (value instanceof Error ? (value.stack ?? value.message) : value + '') : ''}`
      );
    }
  }

  let subscription: Subscription | null = null;

  function subscribe() {
    subscription = subject$.pipe.apply(subject$, args as any).subscribe({
      complete() {
        const error = new EffectError('effect unexpected complete');
        // make a uncaught exception
        setTimeout(() => {
          throw error;
        }, 0);
      },
      error(error) {
        const effectError = new EffectError('effect uncaught error', error);
        // make a uncaught exception
        setTimeout(() => {
          throw effectError;
        }, 0);
      },
    });
  }
  subscribe();

  const fn = (value: unknown) => {
    subject$.next(value);
  };

  fn.unsubscribe = () => subscription?.unsubscribe();
  fn.reset = () => {
    subscription?.unsubscribe();
    subscribe();
  };

  return fn as never;
}
