import { PropertyManagerExtension } from '../extension';
import type { DataViewExtensionType } from '../extension/dataview';
import { GroupByServiceExtension } from '../group-by/matcher';

export const CoreDataviewExtensions: DataViewExtensionType[] = [
  PropertyManagerExtension,
  GroupByServiceExtension,
];
