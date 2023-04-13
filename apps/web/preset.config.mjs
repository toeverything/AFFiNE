import 'dotenv/config';

const config = {
  enableIndexedDBProvider: Boolean(process.env.ENABLE_IDB_PROVIDER ?? '1'),
  enableBroadCastChannelProvider: Boolean(
    process.env.ENABLE_BC_PROVIDER ?? '1'
  ),
  prefetchWorkspace: Boolean(process.env.PREFETCH_WORKSPACE ?? '1'),
  exposeInternal: Boolean(process.env.EXPOSE_INTERNAL ?? '1'),
  enableDebugPage: Boolean(
    process.env.ENABLE_DEBUG_PAGE ?? process.env.NODE_ENV === 'development'
  ),
  enableSubpage: Boolean(process.env.ENABLE_SUBPAGE ?? '1'),
  enableChangeLog: Boolean(process.env.ENABLE_CHANGELOG ?? '1'),
};
export default config;
