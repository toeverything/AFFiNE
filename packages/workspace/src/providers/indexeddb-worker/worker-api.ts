function add(x: number, y: number) {
  return x + y;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const workerApi = {
  add,
  sleep,
};

export type WorkerAPI = typeof workerApi;
