import { AsyncBlock } from '@toeverything/framework/virgo';
import type {
    ContentColumnValue,
    BooleanColumnValue,
} from '@toeverything/datasource/db-service';

export interface BulletProperties {
    text: ContentColumnValue;
    numberType: any;
}

export class BulletBlock extends AsyncBlock {
    override setProperties(
        properties: Partial<BulletProperties>
    ): Promise<boolean> {
        return super.setProperties(properties);
    }
}
