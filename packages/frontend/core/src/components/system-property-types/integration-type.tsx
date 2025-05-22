import { Menu, MenuItem, type MenuRef } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import type { DocRecord } from '@affine/core/modules/doc';
import { useI18n } from '@affine/i18n';
import { IntegrationsIcon, ReadwiseIcon } from '@blocksuite/icons/rc';
import { useLiveData } from '@toeverything/infra';
import { useEffect, useRef } from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import { StackProperty } from '../explorer/docs-view/stack-property';
import type { GroupHeaderProps } from '../explorer/types';

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
  const menuRef = useRef<MenuRef>(null);

  useEffect(() => {
    if (isDraft) {
      menuRef.current?.changeOpen(true);
    }
  }, [isDraft]);

  return (
    <Menu
      ref={menuRef}
      rootOptions={{
        onClose: onDraftCompleted,
      }}
      items={
        <MenuItem
          onClick={() => {
            onChange?.({
              ...filter,
              value: 'readwise',
            });
          }}
          prefixIcon={<ReadwiseIcon />}
          selected={filter.value === 'readwise'}
        >
          {t['com.affine.integration.readwise.name']()}
        </MenuItem>
      }
    >
      <span>
        {filter.value === 'readwise'
          ? t['com.affine.integration.readwise.name']()
          : filter.value}
      </span>
    </Menu>
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
