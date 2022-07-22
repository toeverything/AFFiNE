import {
    BulletedList_1Icon,
    BulletedList_2Icon,
    BulletedList_3Icon,
    BulletedList_4Icon,
} from '@toeverything/components/icons';
export enum NumberType {
    type1 = 'type1',
    type2 = 'type2',
    type3 = 'type3',
    type4 = 'type4',
}
export function BulletIcon(props: any) {
    const { numberType } = props;
    if (numberType === NumberType.type2) {
        return <BulletedList_2Icon />;
    }
    if (numberType === NumberType.type3) {
        return <BulletedList_3Icon />;
    }
    if (numberType === NumberType.type4) {
        return <BulletedList_4Icon />;
    }
    return <BulletedList_1Icon />;
}

export function getChildrenType(type: string) {
    const typeMap: Record<string, string> = {
        type1: 'type2',
        type2: 'type3',
        type3: 'type4',
    };
    return typeMap[type];
}
