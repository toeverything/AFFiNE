/**
 * Deep copy function for TypeScript.
 * @param T Generic type of target/copied value.
 * @param target Target value to be copied.
 * @see Source project, ts-deeply https://github.com/ykdr2017/ts-deepcopy
 * @see Code pen https://codepen.io/erikvullings/pen/ejyBYg
 */
export function deepCopy<T>(target: T): T {
    if (target === null) {
        return target;
    }
    if (target instanceof Date) {
        return new Date(target.getTime()) as any;
    }

    // First part is for array and second part is for Realm.Collection
    // if (target instanceof Array || typeof (target as any).type === 'string') {
    if (typeof target === 'object') {
        if (typeof target[Symbol.iterator as keyof T] === 'function') {
            const cp = [] as any[];
            if ((target as any as any[]).length > 0) {
                for (const arrayMember of target as any as any[]) {
                    cp.push(deepCopy(arrayMember));
                }
            }
            return cp as any as T;
        } else {
            const targetKeys = Object.keys(target);
            const cp = {} as T;
            if (targetKeys.length > 0) {
                for (const key of targetKeys) {
                    cp[key as keyof T] = deepCopy(target[key as keyof T]);
                }
            }
            return cp;
        }
    }

    // Means that object is atomic
    return target;
}
