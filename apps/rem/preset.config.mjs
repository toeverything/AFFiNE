import 'dotenv/config';

export default {
  enableIndexedDBProvider: Boolean(process.env.ENABLE_IDB_PROVIDER ?? '1'),
  prefetchAffineRemoteWorkspace: Boolean(
    process.env.PREFETCH_AFFINE_REMOTE_WORKSPACE ?? '1'
  ),
};
