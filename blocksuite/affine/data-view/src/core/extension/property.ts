import {
  createIdentifier,
  type ServiceIdentifier,
} from '@blocksuite/global/di';

import { DataSourceKey } from '../data-source/consts';
import type { DataSource } from '../data-source/source';
import type { GetPropertyMetaConfigFromModel } from '../property';
import type { ConvertFunction, PropertyConvert } from '../property/convert';
import type {
  PropertyMetaConfig,
  PropertyModel,
} from '../property/property-config';
import {
  type DataViewExtensionContext,
  type DataViewExtensionType,
} from './dataview';

export const PropertyMetaConfigKey = createIdentifier<PropertyMetaConfig>(
  'DataViewPropertyMetaConfig'
);
export const PropertyConvertKey = createIdentifier<ConvertFunction>(
  'DataViewPropertyConvert'
);

type AnyPropertyModel = PropertyModel<any, any, any, any>;

export type PropertyExtensionConfig<Model extends AnyPropertyModel> = {
  setup?: (context: DataViewExtensionContext) => void;
  // This only runs once when the extension is set up. eg register lit elements.
  effect?: () => void;
  meta: GetPropertyMetaConfigFromModel<Model>;
  converts?: (
    | PropertyConvert<Model, AnyPropertyModel>
    | PropertyConvert<AnyPropertyModel, Model>
  )[];
};

/**
 * ``` ts
 *  const FormulaPropertyExtension = PropertyExtension({
 *  meta: 'formula,
 *  converts: [], // converts for this property
 *  filter: [],
 *  setup({di, dataSource}) {
 *    di.addValue(FormulaService, new FormulaService(dataSource));
 * }
 * effect: () => {
 *  customElements.define(FormulaCell, "formula-cell");
 *  customElements.define(FormulaEditor, "formula-editor");
 * }
 * })
 * ```
 */
export function PropertyExtension<
  Model extends PropertyModel<any, any, any, any>,
>(model: Model, config: PropertyExtensionConfig<Model>): DataViewExtensionType {
  let effectRan = false;
  const identifier = getPropertyMetaKeyForType(model.type);

  return {
    name: `PropertyExtension(${model.type})`,
    setup(context): void {
      const di = context.di;

      if (!effectRan) {
        config.effect?.();
        effectRan = true;
      }

      di.addValue(identifier, config.meta);

      config.converts?.forEach(convert => {
        di.addValue(
          getPropertyConvertKey(convert.from, convert.to),
          convert.convert
        );
      });

      config.setup?.(context);
    },
  };
}

export class PropertyManager {
  constructor(private readonly dataSource: DataSource) {}

  getPropertyMeta(type: string): PropertyMetaConfig | null {
    return this.dataSource.provider.getOptional(
      getPropertyMetaKeyForType(type)
    );
  }

  getAllPropertyMeta(): PropertyMetaConfig[] {
    return Array.from(
      this.dataSource.provider.getAll(PropertyMetaConfigKey).values()
    );
  }

  getConvertFunction(from: string, to: string): ConvertFunction | null {
    return (
      this.dataSource.provider.getOptional(getPropertyConvertKey(from, to)) ??
      null
    );
  }
}

/**
 * @internal
 */
export const PropertyManagerExtension: DataViewExtensionType = {
  setup({ di }: DataViewExtensionContext): void {
    di.add(PropertyManager, [DataSourceKey]);
  },
};

export function getPropertyManager(dataSource: DataSource): PropertyManager {
  const mgr = dataSource.serviceGet(PropertyManager);
  if (!mgr) {
    throw new Error('PropertyManager is not available for this data source');
  }
  return mgr;
}

export function getPropertyConvertKey(
  from: string,
  to: string
): ServiceIdentifier<ConvertFunction> {
  return PropertyConvertKey(`${from}-${to}`);
}

export function getPropertyMetaKeyForType(type: string) {
  return PropertyMetaConfigKey(type);
}
