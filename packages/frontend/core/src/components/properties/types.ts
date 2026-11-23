import type { DocCustomPropertyInfo } from '@affine/core/modules/db';

export interface PropertyValueProps {
  propertyInfo?: DocCustomPropertyInfo;
  value: any;
  readonly?: boolean;
  onChange: (value: any, skipCommit?: boolean) => void; // if skipCommit is true, the change will be handled in the component itself
}
