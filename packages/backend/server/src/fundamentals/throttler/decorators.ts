import { applyDecorators, SetMetadata } from '@nestjs/common';
import { SkipThrottle, Throttle as RawThrottle } from '@nestjs/throttler';

export type Throttlers = 'default' | 'strict';
export const THROTTLER_PROTECTED = 'affine_throttler:protected';

/**
 * Choose what throttler to use
 *
 * If a Controller or Query do not protected behind a Throttler,
 * it will never be rate limited.
 *
 * - Ease: 120 calls within 60 seconds
 * - Strict: 10 calls within 60 seconds
 *
 * @example
 *
 * \@Throttle()
 * \@Throttle('strict')
 *
 * // the config call be override by the second parameter,
 * // and the call count will be calculated separately
 * \@Throttle('default', { limit: 10, ttl: 10 })
 *
 */
export function Throttle(
  type: Throttlers = 'default',
  override: { limit?: number; ttl?: number } = {}
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(THROTTLER_PROTECTED, type),
    RawThrottle({
      [type]: override,
    })
  );
}

export { SkipThrottle };
