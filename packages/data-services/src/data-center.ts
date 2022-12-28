class DataCenter {
  static async init() {
    return new DataCenter();
  }

  private constructor() {
    // TODO
  }
}

let _dataCenterInstance: Promise<DataCenter>;

export const getDataCenter = () => {
  if (!_dataCenterInstance) {
    _dataCenterInstance = DataCenter.init();
  }

  return _dataCenterInstance;
};
