export const getDataCenter = () =>
  import('../src/datacenter/index.js').then(async dataCenter =>
    dataCenter.getDataCenter()
  );
