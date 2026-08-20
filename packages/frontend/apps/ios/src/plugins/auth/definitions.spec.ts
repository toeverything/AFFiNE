import type { SignInUserInfo } from '@affine/core/modules/cloud/provider/auth';
import { expectTypeOf, test } from 'vitest';

import type { AuthPlugin } from './definitions';

type SignInPasswordResult = Awaited<ReturnType<AuthPlugin['signInPassword']>>;

test('signInPassword resolves user info', () => {
  expectTypeOf<SignInPasswordResult>().toEqualTypeOf<SignInUserInfo>();
});
