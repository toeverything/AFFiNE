import { Protocol } from '@toeverything/datasource/db-service';
import { AsyncBlock } from '@toeverything/framework/virgo';

export const is_heading_child_type = (child: AsyncBlock) => {
    if (!child) return false;
    if (
        Protocol.Block.Type.heading1 === child.type ||
        Protocol.Block.Type.heading2 === child.type ||
        Protocol.Block.Type.heading3 === child.type
    ) {
        return true;
    }
    return false;
};
export const get_heading_child_title = (child: AsyncBlock) => {
    return (child as any).getProperties()?.['text']?.[0]?.text;
};
export const get_heading_child_level = (child: AsyncBlock) => {
    let level = 1;
    switch (child.type) {
        case Protocol.Block.Type.heading1:
            level = 1;
            break;
        case Protocol.Block.Type.heading2:
            level = 2;
            break;
        case Protocol.Block.Type.heading3:
            level = 3;
            break;
    }
    return level;
};
