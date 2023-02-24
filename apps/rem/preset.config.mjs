import 'dotenv/config';

export default {
  enableIndexedDBProvider: Boolean(process.env.ENABLE_IDB_PROVIDER ?? '1'),
};
