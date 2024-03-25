import { DebugLogger } from '@affine/debug';
import { Unreachable } from '@affine/env/constant';
import { type OperatorFunction, Subject } from 'rxjs';

const logger = new DebugLogger('effect');

export interface Effect<T> {
  (value: T): void;
}

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

  // eslint-disable-next-line prefer-spread
  subject$.pipe.apply(subject$, args as any).subscribe({
    next(value) {
      logger.error('effect should not emit value', value);
      throw new Unreachable('effect should not emit value');
    },
    complete() {
      logger.error('effect unexpected complete');
      throw new Unreachable('effect unexpected complete');
    },
    error(error) {
      logger.error('effect uncatched error', error);
      throw new Unreachable('effect uncatched error');
    },
  });

  return ((value: unknown) => {
    subject$.next(value);
  }) as never;
}
