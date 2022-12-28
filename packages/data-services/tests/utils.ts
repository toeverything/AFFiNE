export const getDataCenter = () =>
  import('../src/data-center.js').then(async dataCenter =>
    dataCenter.getDataCenter()
  );
