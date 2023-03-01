import 'dotenv/config';

export default {
  enableIndexedDBProvider: Boolean(process.env.ENABLE_IDB_PROVIDER ?? '1'),
  enableBroadCastChannelProvider: Boolean(
    process.env.ENABLE_BC_PROVIDER ?? '1'
  ),
  prefetchWorkspace: Boolean(process.env.PREFETCH_WORKSPACE ?? '1'),
};
