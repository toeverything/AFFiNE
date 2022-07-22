import { AsyncBlock } from '@toeverything/framework/virgo';
import type {
    ContentColumnValue,
    BooleanColumnValue,
} from '@toeverything/datasource/db-service';

export interface Numbered {
    text: ContentColumnValue;
    numberType: any;
}

export class NumberedAsyncBlock extends AsyncBlock {
    override setProperties(properties: Partial<Numbered>): Promise<boolean> {
        return super.setProperties(properties);
    }
}
