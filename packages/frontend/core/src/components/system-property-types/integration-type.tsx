import { MenuItem } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import type { DocRecord } from '@affine/core/modules/doc';
import { IntegrationTypeIcon } from '@affine/core/modules/integration';
import { INTEGRATION_TYPE_NAME_MAP } from '@affine/core/modules/integration/constant';
import type { IntegrationType } from '@affine/core/modules/integration/type';
import { useI18n } from '@affine/i18n';
import { IntegrationsIcon, ReadwiseIcon } from '@blocksuite/icons/rc';
import { useLiveData } from '@toeverything/infra';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import { StackProperty } from '../explorer/docs-view/stack-property';
import type { GroupHeaderProps } from '../explorer/types';
import { FilterValueMenu } from '../filter/filter-value-menu';

export const IntegrationTypeFilterValue = ({
  filter,
  isDraft,
  onDraftCompleted,
  onChange,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
  onChange?: (filter: FilterParams) => void;
}) => {
  const t = useI18n();

  return (
    <FilterValueMenu
      isDraft={isDraft}
      onDraftCompleted={onDraftCompleted}
      items={Object.entries(INTEGRATION_TYPE_NAME_MAP).map(entries => {
        const type = entries[0] as IntegrationType;
        const i18nKey = entries[1];
        return (
          <MenuItem
            key={type}
            onClick={() => {
              onChange?.({
                ...filter,
                value: type,
              });
            }}
            prefixIcon={<IntegrationTypeIcon type={type} />}
            selected={filter.value === type}
          >
            {t.t(i18nKey)}
          </MenuItem>
        );
      })}
    >
      <span>
        {INTEGRATION_TYPE_NAME_MAP[filter.value as IntegrationType]
          ? t.t(INTEGRATION_TYPE_NAME_MAP[filter.value as IntegrationType])
          : filter.value}
      </span>
    </FilterValueMenu>
  );
};

export const IntegrationTypeDocListProperty = ({ doc }: { doc: DocRecord }) => {
  const integrationType = useLiveData(doc.property$('integrationType'));

  if (!integrationType) {
    return null;
  }

  return (
    <StackProperty
      icon={
        integrationType === 'readwise' ? <ReadwiseIcon /> : <IntegrationsIcon />
      }
    >
      {integrationType}
    </StackProperty>
  );
};

export const IntegrationTypeGroupHeader = ({
  groupId,
  docCount,
}: GroupHeaderProps) => {
  const t = useI18n();
  const text =
    groupId === 'readwise'
      ? t['com.affine.integration.readwise.name']()
      : groupId
        ? groupId
        : 'No integrations';

  return (
    <PlainTextDocGroupHeader groupId={groupId} docCount={docCount}>
      {text}
    </PlainTextDocGroupHeader>
  );
};
