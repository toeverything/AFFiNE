import { Checkbox, MenuItem, PropertyValue } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { type DocRecord, DocService } from '@affine/core/modules/doc';
import { useI18n } from '@affine/i18n';
import { TemplateIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { type ChangeEvent, useCallback } from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import { StackProperty } from '../explorer/docs-view/stack-property';
import type { GroupHeaderProps } from '../explorer/types';
import { FilterValueMenu } from '../filter/filter-value-menu';
import type { PropertyValueProps } from '../properties/types';
import * as styles from './template.css';

export const TemplateValue = ({ readonly }: PropertyValueProps) => {
  const docService = useService(DocService);

  const isTemplate = useLiveData(
    docService.doc.record.properties$.selector(p => p.isTemplate)
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (readonly) return;
      const value = e.target.checked;
      docService.doc.record.setProperty('isTemplate', value);
    },
    [docService.doc.record, readonly]
  );

  const toggle = useCallback(() => {
    if (readonly) return;
    docService.doc.record.setProperty('isTemplate', !isTemplate);
  }, [docService.doc.record, isTemplate, readonly]);

  return (
    <PropertyValue className={styles.property} onClick={toggle} readonly>
      <Checkbox
        data-testid="toggle-template-checkbox"
        checked={!!isTemplate}
        onChange={onChange}
        className={styles.checkbox}
        disabled={readonly}
      />
    </PropertyValue>
  );
};

export const TemplateDocListProperty = ({ doc }: { doc: DocRecord }) => {
  const t = useI18n();
  const isTemplate = useLiveData(doc.properties$.selector(p => p.isTemplate));

  if (!isTemplate) {
    return null;
  }

  return (
    <StackProperty icon={<TemplateIcon />}>{t['Template']()}</StackProperty>
  );
};

export const TemplateGroupHeader = ({
  groupId,
  docCount,
}: GroupHeaderProps) => {
  const t = useI18n();
  const text =
    groupId === 'true'
      ? t['com.affine.all-docs.group.is-template']()
      : groupId === 'false'
        ? t['com.affine.all-docs.group.is-not-template']()
        : 'Default';

  return (
    <PlainTextDocGroupHeader groupId={groupId} docCount={docCount}>
      {text}
    </PlainTextDocGroupHeader>
  );
};

export const TemplateFilterValue = ({
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
  return (
    <FilterValueMenu
      isDraft={isDraft}
      onDraftCompleted={onDraftCompleted}
      items={
        <>
          <MenuItem
            onClick={() => {
              onChange?.({
                ...filter,
                value: 'true',
              });
            }}
            selected={filter.value === 'true'}
          >
            {'True'}
          </MenuItem>
          <MenuItem
            onClick={() => {
              onChange?.({
                ...filter,
                value: 'false',
              });
            }}
            selected={filter.value !== 'true'}
          >
            {'False'}
          </MenuItem>
        </>
      }
    >
      <span>{filter.value === 'true' ? 'True' : 'False'}</span>
    </FilterValueMenu>
  );
};
