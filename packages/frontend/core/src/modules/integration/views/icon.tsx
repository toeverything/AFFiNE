import type { SVGProps } from 'react';

import { INTEGRATION_ICON_MAP } from '../constant';
import type { IntegrationType } from '../type';

export const IntegrationTypeIcon = ({
  type,
  ...props
}: {
  type: IntegrationType;
} & SVGProps<SVGSVGElement>) => {
  const Icon = INTEGRATION_ICON_MAP[type];

  return <Icon {...props} />;
};
