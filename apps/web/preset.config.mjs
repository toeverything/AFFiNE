import 'dotenv/config';

const config = {
  enableLegacyCloud: Boolean(process.env.ENABLE_LEGACY_PROVIDER ?? '1'),
  enableBroadCastChannelProvider: Boolean(
    process.env.ENABLE_BC_PROVIDER ?? '1'
  ),
  enableDebugPage: Boolean(
    process.env.ENABLE_DEBUG_PAGE ?? process.env.NODE_ENV === 'development'
  ),
};
export default config;
