export const getDataCenter = () => {
  return import('../src/datacenter/index.js').then(async dataCenter =>
    dataCenter.getDataCenter(false)
  );
};
