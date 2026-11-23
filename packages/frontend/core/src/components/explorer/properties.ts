import type { DocCustomPropertyInfo } from '@affine/core/modules/db';

import { SystemPropertyTypes } from '../system-property-types';

const systemProperties = Object.entries(SystemPropertyTypes);

/**
 * In AFFiNE's property system, the property list can be fully customized by users.
 * For example, system properties like `createdAt` and `updatedAt`.
 * Users can completely remove them or create multiple instances. (This doesn't affect the underlying data, only the property display)
 *
 * To prevent user-defined properties from affecting the display of system properties, we've designed a dedicated property list for the Explorer.
 * This list generates a final property list based on system properties and user-defined properties, arranged in a specific order.
 *
 * For example, we have a workspace property list:
 *
 * - `{name: 'Birth', type: 'createdAt'}`
 * - `{name: 'Labels', type: 'tags'}`
 * - `{name: 'Name', type: 'Text'}`
 *
 * Assuming we have 3 system properties: `createdAt`, `updatedAt`, and `tags`
 *
 * The final property list should be:
 *
 * - `{systemProperty: {type: 'createdAt'}, workspaceProperty: {name: 'Birth'}}`
 * - `{systemProperty: {type: 'updatedAt'}, workspaceProperty: null}`
 * - `{systemProperty: {type: 'tags'}, workspaceProperty: {name: 'Labels'}}`
 * - `{systemProperty: null, workspaceProperty: {name: 'Name'}}`
 *
 * When displaying the list to users, we prioritize showing the workspace property if it exists, otherwise we show the system property.
 *
 * When users configure a property, we prioritize recording the system property's ID. This ensures that when users delete a property, it won't affect these settings.
 */
export function generateExplorerPropertyList(
  workspaceProperties: DocCustomPropertyInfo[]
): {
  systemProperty?: (typeof SystemPropertyTypes)[number] & { type: string };
  workspaceProperty?: DocCustomPropertyInfo;
}[] {
  const finalList = [];
  workspaceProperties = [...workspaceProperties];

  for (const [type, info] of systemProperties) {
    const workspacePropertyIndex = workspaceProperties.findIndex(
      p => p.type === type
    );
    if (workspacePropertyIndex === -1) {
      finalList.push({
        systemProperty: { ...info, type },
      });
    } else {
      finalList.push({
        systemProperty: { ...info, type },
        workspaceProperty: workspaceProperties[workspacePropertyIndex],
      });
      workspaceProperties.splice(workspacePropertyIndex, 1);
    }
  }

  for (const workspaceProperty of workspaceProperties) {
    finalList.push({
      workspaceProperty,
    });
  }

  return finalList;
}
