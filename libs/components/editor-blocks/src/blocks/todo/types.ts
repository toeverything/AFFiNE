import { AsyncBlock } from '@toeverything/framework/virgo';
import type {
    ContentColumnValue,
    BooleanColumnValue,
} from '@toeverything/datasource/db-service';

export interface TodoProperties {
    text: ContentColumnValue;
    checked?: BooleanColumnValue;
    collapsed?: BooleanColumnValue;
}

export class TodoAsyncBlock extends AsyncBlock {
    override setProperties(
        properties: Partial<TodoProperties>
    ): Promise<boolean> {
        return super.setProperties(properties);
    }
}
