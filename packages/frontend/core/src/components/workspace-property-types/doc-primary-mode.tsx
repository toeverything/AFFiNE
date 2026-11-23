import {
  MenuItem,
  notify,
  PropertyValue,
  type RadioItem,
} from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { DocService } from '@affine/core/modules/doc';
import { useI18n } from '@affine/i18n';
import type { DocMode } from '@blocksuite/affine/model';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import { StackProperty } from '../explorer/docs-view/stack-property';
import type { DocListPropertyProps, GroupHeaderProps } from '../explorer/types';
import { FilterValueMenu } from '../filter/filter-value-menu';
import type { PropertyValueProps } from '../properties/types';
import { PropertyRadioGroup } from '../properties/widgets/radio-group';
import * as styles from './doc-primary-mode.css';

export const DocPrimaryModeValue = ({
  onChange,
  readonly,
}: PropertyValueProps) => {
  const t = useI18n();
  const doc = useService(DocService).doc;

  const primaryMode = useLiveData(doc.primaryMode$);

  const DocModeItems = useMemo<RadioItem[]>(
    () => [
      {
        value: 'page' as DocMode,
        label: t['Page'](),
      },
      {
        value: 'edgeless' as DocMode,
        label: t['Edgeless'](),
      },
    ],
    [t]
  );

  const handleChange = useCallback(
    (mode: DocMode) => {
      doc.setPrimaryMode(mode);
      notify.success({
        title:
          mode === 'page'
            ? t['com.affine.toastMessage.defaultMode.page.title']()
            : t['com.affine.toastMessage.defaultMode.edgeless.title'](),
        message:
          mode === 'page'
            ? t['com.affine.toastMessage.defaultMode.page.message']()
            : t['com.affine.toastMessage.defaultMode.edgeless.message'](),
      });
      onChange?.(mode, true);
    },
    [doc, t, onChange]
  );
  return (
    <PropertyValue
      className={styles.container}
      hoverable={false}
      readonly={readonly}
    >
      <PropertyRadioGroup
        value={primaryMode}
        onChange={handleChange}
        items={DocModeItems}
        disabled={readonly}
      />
    </PropertyValue>
  );
};

export const DocPrimaryModeFilterValue = ({
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
      items={
        <>
          <MenuItem
            onClick={() => {
              onChange?.({
                ...filter,
                value: 'page',
              });
            }}
            selected={filter.value !== 'edgeless'}
          >
            {t['Page']()}
          </MenuItem>
          <MenuItem
            onClick={() => {
              onChange?.({
                ...filter,
                value: 'edgeless',
              });
            }}
            selected={filter.value === 'edgeless'}
          >
            {t['Edgeless']()}
          </MenuItem>
        </>
      }
    >
      <span>{filter.value === 'edgeless' ? t['Edgeless']() : t['Page']()}</span>
    </FilterValueMenu>
  );
};

export const DocPrimaryModeDocListProperty = ({
  doc,
}: DocListPropertyProps) => {
  const t = useI18n();
  const primaryMode = useLiveData(doc.primaryMode$);

  return (
    <StackProperty
      icon={primaryMode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />}
    >
      {primaryMode === 'edgeless' ? t['Edgeless']() : t['Page']()}
    </StackProperty>
  );
};

export const DocPrimaryModeGroupHeader = ({
  groupId,
  docCount,
}: GroupHeaderProps) => {
  const t = useI18n();
  const text =
    groupId === 'edgeless'
      ? t['com.affine.edgelessMode']()
      : groupId === 'page'
        ? t['com.affine.pageMode']()
        : 'Default';

  return (
    <PlainTextDocGroupHeader groupId={groupId} docCount={docCount}>
      {text}
    </PlainTextDocGroupHeader>
  );
};
