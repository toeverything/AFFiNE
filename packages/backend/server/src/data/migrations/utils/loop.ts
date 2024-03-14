export async function loop(
  batchFn: (skip: number, take: number) => Promise<number>,
  chunkSize: number = 100
) {
  let turn = 0;
  let last = chunkSize;

  while (last === chunkSize) {
    last = await batchFn(chunkSize * turn, chunkSize);

    turn++;
  }
}
