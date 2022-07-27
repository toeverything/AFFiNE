import { AsyncBlock } from '../../editor';
import { RecastBlockValue } from './recast-value';
import { RecastDataProperties, RecastPropertyId } from './recast-property';
import { TABLE_VALUES_KEY } from './constant';

// ---------------------------------------------------
// Block

// TODO update AsyncBlock
type VariantBlock<Props> = Omit<
    AsyncBlock,
    'getProperty' | 'getProperties' | 'setProperty' | 'setProperties'
> & {
    getProperty<T extends keyof Props>(key: T): Props[T];
    getProperties(): Props;
    setProperty<T extends keyof Props>(
        key: T,
        value: Props[T]
    ): Promise<boolean>;
    setProperties(value: Partial<Props>): Promise<boolean>;
    removeProperty<T extends keyof Props>(key: T): Promise<boolean>;
};

export type RecastBlock = VariantBlock<RecastDataProperties>;

export type RecastItem = VariantBlock<{
    [TABLE_VALUES_KEY]: Record<RecastPropertyId, RecastBlockValue>;
}>;

export * from './constant';
export * from './recast-property';
export * from './recast-value';
export * from './view';
