import {
  PropertyCollapsibleContent,
  PropertyCollapsibleSection,
  PropertyName,
  PropertyRoot,
} from '@affine/component';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { type ReactNode, useMemo } from 'react';

import { IntegrationPropertyService } from '../services/integration-property';
import type { IntegrationProperty } from '../type';
import { ValueRenderer } from './property-values';

export const DocIntegrationPropertiesTable = ({
  divider,
}: {
  divider?: ReactNode;
}) => {
  const t = useI18n();
  const integrationPropertyService = useService(IntegrationPropertyService);

  const integrationType = useLiveData(
    integrationPropertyService.integrationType$
  );
  const schema = useLiveData(integrationPropertyService.schema$);

  const properties = useMemo(
    () =>
      (Object.values(schema || {}) as IntegrationProperty<any>[]).sort(
        (a, b) => {
          const aOrder = a.order ?? '9999';
          const bOrder = b.order ?? '9999';
          return aOrder.localeCompare(bOrder);
        }
      ),
    [schema]
  );

  if (!schema || !integrationType) return null;

  return (
    <>
      <PropertyCollapsibleSection
        title={t['com.affine.integration.properties']()}
      >
        <PropertyCollapsibleContent>
          {properties.map(property => {
            const Icon = property.icon;
            const key = property.key as string;
            const label = property.label;
            const displayName =
              typeof label === 'string'
                ? t[label]()
                : t.t(label?.i18nKey, label?.options);

            return (
              <PropertyRoot key={key}>
                <PropertyName
                  name={displayName}
                  icon={Icon ? <Icon /> : null}
                />
                <ValueRenderer
                  integration={integrationType}
                  type={property.type}
                  propertyKey={key}
                />
              </PropertyRoot>
            );
          })}
        </PropertyCollapsibleContent>
      </PropertyCollapsibleSection>
      {divider}
    </>
  );
};
