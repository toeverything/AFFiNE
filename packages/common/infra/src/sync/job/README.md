# job

Job system abstraction for AFFiNE. Currently, only `IndexedDBJobQueue` is implemented; more backends will be implemented in the future.

Run background jobs in browser & distributed environment. `runners` can consume tasks simultaneously without additional communication.

# Basic Usage

```ts
const queue = new IndexedDBJobQueue('my-queue');

await queue.enqueue([
  {
    batchKey: '1',
    payload: { a: 'hello' },
  },
  {
    batchKey: '2',
    payload: { a: 'world' },
  },
]);

const runner = new JobRunner(queue, job => {
  console.log(job);
});

runner.start();

// Output:
// { batchKey: '1', payload: { a: 'hello' } }
// { batchKey: '2', payload: { a: 'world' } }
```

## `batchKey`

Each job has a `batchKey`, and jobs with the same `batchKey` are handed over to one `runner` for execution at once.
Additionally, if there are ongoing jobs with the same `batchKey`, other `runners` will not take on jobs with this `batchKey`, ensuring exclusive resource locking.

> In the future, `batchKey` will be used to implement priority.

## `timeout`

If the job execution time exceeds 30 seconds, it will be considered a timeout and reassigned to another `runner`.

## Error Handling

If an error is thrown during job execution, will log an error, but the job will be considered complete.
