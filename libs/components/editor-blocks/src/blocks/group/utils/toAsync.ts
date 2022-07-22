const toAsync = <T>(promise: Promise<T>) =>
    promise.then(data => [null, data]).catch(err => [err]);

export { toAsync };
