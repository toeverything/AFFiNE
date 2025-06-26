import {
  type Container,
  createIdentifier,
  type ServiceProvider,
} from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';

import { DataSourceKey } from '../data-source/consts';
import { type DataSource } from '../data-source/source';

export interface DataViewExtensionContext {
  di: Container;
}

export function loadDataViewExtensions(
  extensions: DataViewExtensionType[],
  container: Container,
  dataSource: DataSource
) {
  const context = createDataViewExtensionContext(container, dataSource);
  for (const ext of extensions) {
    try {
      ext.setup(context);
    } catch (error) {
      console.error(
        `Failed to setup DataViewExtension: ${ext.name ?? 'Unnamed Extension'}`,
        error
      );
    }
  }
}

export function createDataViewExtensionContext(
  container: Container,
  dataSource: DataSource
): DataViewExtensionContext {
  container.addValue(DataSourceKey, dataSource);
  return {
    di: container,
  };
}

/**
 *  Dataview Extensions are allows to register a service into a container belonging to a datasource.
 * ```ts
 *
 * const Ext: DataViewExtensionType = {
 *  name: 'MyExtension',
 *  setup({ di, dataSource }) {
 *  // add a service to the data source's container
 *  di.addValue(MyService, new MyService(dataSource));
 *  }
 * }
 *
 * class MyDataSource extends DataSourceBase {
 *  constructor(extensions: DataViewExtensionType[]) {
 *   super()
 *   // then configure the data source with the extensions
 *   this.configure(extensions)
 *  }
 * }
 * const dataSource = new MyDataSource([ Ext ]);
 * expect(dataSource.serviceGet(DataSourceKey)).toBe(dataSource); // true
 * expect(dataSource.serviceGet(MyService)).toBeInstanceOf(MyService); // true
 * ```
 */
export type DataViewExtensionType = {
  // for debugging purpose
  name?: string;
  setup: (context: DataViewExtensionContext) => void;
};

let id = 1;
/**
 * Helper function to create a `ExtensionType` for a DataViewExtension.
 */
export function DataViewExtension(
  extension: DataViewExtensionType
): ExtensionType {
  return {
    setup(di) {
      di.addValue(
        DataViewExtensionIdentifier(`DataViewExtension(${id++})`),
        extension
      );
    },
  };
}

export function getDataViewExtensions(
  provider: ServiceProvider
): DataViewExtensionType[] {
  return Array.from(provider.getAll(DataViewExtensionIdentifier).values());
}

export const DataViewExtensionIdentifier =
  createIdentifier<DataViewExtensionType>('DataViewExtension');
