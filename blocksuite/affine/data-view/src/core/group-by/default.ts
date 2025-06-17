import type { GroupBy } from '../common/types.js';
import type { DataSource } from '../data-source/index.js';
import type { PropertyMetaConfig } from '../property/property-config.js';
import { getGroupByService } from './matcher.js';

export const defaultGroupBy = (
  dataSource: DataSource,
  propertyMeta: PropertyMetaConfig,
  propertyId: string,
  data: NonNullable<unknown>
): GroupBy | undefined => {
  const groupByService = getGroupByService(dataSource);
  const name = groupByService?.matcher.match(
    propertyMeta.config.jsonValue.type({ data, dataSource })
  )?.name;
  return name != null
    ? {
        type: 'groupBy',
        columnId: propertyId,
        name: name,
        hideEmpty: true,
      }
    : undefined;
};
