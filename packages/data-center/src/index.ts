export { signInWithGoogle, onAuthStateChanged } from './auth';
export * from './sdks';

export { getDataCenter } from './datacenter';

// TODO: temporary reference, move all api into affine provider
export { token } from './datacenter/provider/affine/token';
export type { AccessTokenMessage } from './datacenter/provider/affine/token';
