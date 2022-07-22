const toAsync = (promise: Promise<unknown>) =>
    promise.then(data => [null, data]).catch(err => [err]);

export default toAsync;
