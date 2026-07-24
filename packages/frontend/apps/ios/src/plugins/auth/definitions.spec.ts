import type { SignInUserInfo } from '@affine/core/modules/cloud/provider/auth';

import type { AuthPlugin } from './definitions';

type IsExact<T, Expected> = T extends Expected
  ? Expected extends T
    ? true
    : false
  : false;

type Assert<T extends true> = T;

type SignInPasswordResult = Awaited<ReturnType<AuthPlugin['signInPassword']>>;

export type SignInPasswordResolvesUserInfo = Assert<
  IsExact<SignInPasswordResult, SignInUserInfo>
>;
