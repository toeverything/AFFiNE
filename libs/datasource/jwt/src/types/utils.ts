type ValueOf<T> = T[keyof T];
export type ExcludeFunction<T> = Pick<
    T,
    ValueOf<{
        // eslint-disable-next-line @typescript-eslint/ban-types
        [K in keyof T]: T[K] extends Function ? never : K;
    }>
>;
