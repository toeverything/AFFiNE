export const getDataCenter = () => {
  return import('../src/index.js').then(async dataCenter =>
    dataCenter.getDataCenter(false)
  );
};
