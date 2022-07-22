const type2Map: Record<number, string> = {};
const type3Map: Record<number, string> = {};
export function getNumber(type: string, index: number) {
    if (type === 'type2') {
        if (type2Map[index]) {
            return type2Map[index];
        }
        type2Map[index] = getType2(index - 1);

        return type2Map[index];
    }
    if (type === 'type3') {
        if (type3Map[index]) {
            return type3Map[index];
        }
        type3Map[index] = getType3(index);

        return type3Map[index];
    }
    return index;
}

const getType2 = (n: number) => {
    const ordA = 'a'.charCodeAt(0);
    const ordZ = 'z'.charCodeAt(0);
    const len = ordZ - ordA + 1;
    let s = '';
    while (n >= 0) {
        s = String.fromCharCode((n % len) + ordA) + s;
        n = Math.floor(n / len) - 1;
    }
    return s;
};
const getType3 = (num: number) => {
    const lookup = {
        m: 1000,
        cm: 900,
        d: 500,
        cd: 400,
        c: 100,
        xc: 90,
        l: 50,
        xl: 40,
        x: 10,
        ix: 9,
        v: 5,
        iv: 4,
        i: 1,
    };
    let romanStr = '';
    for (const i in lookup) {
        // @ts-ignore
        while (num >= lookup[i]) {
            romanStr += i;
            // @ts-ignore
            num -= lookup[i];
        }
    }
    return romanStr;
};

export function getChildrenType(type: string) {
    const typeMap: Record<string, string> = {
        type1: 'type2',
        type2: 'type3',
        type3: 'type1',
    };
    return typeMap[type];
}
