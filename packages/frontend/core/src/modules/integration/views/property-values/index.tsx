import { useLiveData, useService } from '@toeverything/infra';
import { type ComponentType, useMemo } from 'react';

import { IntegrationPropertyService } from '../../services/integration-property';
import type { IntegrationProperty } from '../../type';
import { DateValue } from './date-value';
import { LinkValue } from './link-value';
import { SourceValue } from './source-value';
import { TextValue } from './text-value';
import type { PropertyValueProps } from './type';

type IntegrationPropertyType = IntegrationProperty<any>['type'];

const valueRenderers: Record<
  IntegrationPropertyType,
  ComponentType<PropertyValueProps>
> = {
  link: LinkValue,
  source: SourceValue,
  text: TextValue,
  date: DateValue,
};

type ValueRendererProps = {
  type: IntegrationPropertyType;
  propertyKey: string;
} & Pick<PropertyValueProps, 'integration'>;

export const ValueRenderer = ({
  integration,
  type,
  propertyKey,
}: ValueRendererProps) => {
  const Renderer = valueRenderers[type];

  const integrationPropertyService = useService(IntegrationPropertyService);

  const propertyValue = useLiveData(
    useMemo(() => {
      return integrationPropertyService.integrationProperty$(
        integration,
        propertyKey
      );
    }, [integration, integrationPropertyService, propertyKey])
  );

  if (!Renderer) {
    return null;
  }
  return <Renderer integration={integration} value={propertyValue} />;
};
