import { MenuItem, PropertyValue, type RadioItem } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { type DocRecord, DocService } from '@affine/core/modules/doc';
import { useI18n } from '@affine/i18n';
import { EdgelessIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import { StackProperty } from '../explorer/docs-view/stack-property';
import type { GroupHeaderProps } from '../explorer/types';
import { FilterValueMenu } from '../filter/filter-value-menu';
import type { PropertyValueProps } from '../properties/types';
import { PropertyRadioGroup } from '../properties/widgets/radio-group';
import * as styles from './edgeless-theme.css';

const getThemeOptions = (t: ReturnType<typeof useI18n>) =>
  [
    {
      value: 'system',
      label: t['com.affine.themeSettings.auto'](),
    },
    {
      value: 'light',
      label: t['com.affine.themeSettings.light'](),
    },
    {
      value: 'dark',
      label: t['com.affine.themeSettings.dark'](),
    },
  ] satisfies RadioItem[];

export const EdgelessThemeValue = ({
  onChange,
  readonly,
}: PropertyValueProps) => {
  const t = useI18n();
  const doc = useService(DocService).doc;
  const edgelessTheme = useLiveData(doc.properties$).edgelessColorTheme;

  const handleChange = useCallback(
    (theme: string) => {
      doc.record.setProperty('edgelessColorTheme', theme);
      onChange?.(theme, true);
    },
    [doc, onChange]
  );
  const themeItems = useMemo<RadioItem[]>(() => getThemeOptions(t), [t]);

  return (
    <PropertyValue
      className={styles.container}
      hoverable={false}
      readonly={readonly}
    >
      <PropertyRadioGroup
        value={edgelessTheme || 'system'}
        onChange={handleChange}
        items={themeItems}
        disabled={readonly}
      />
    </PropertyValue>
  );
};

export const EdgelessThemeDocListProperty = ({ doc }: { doc: DocRecord }) => {
  const t = useI18n();
  const edgelessTheme = useLiveData(
    doc.properties$.selector(p => p.edgelessColorTheme)
  );

  return (
    <StackProperty icon={<EdgelessIcon />}>
      {edgelessTheme === 'system' || !edgelessTheme
        ? t['com.affine.themeSettings.auto']()
        : edgelessTheme === 'light'
          ? t['com.affine.themeSettings.light']()
          : t['com.affine.themeSettings.dark']()}
    </StackProperty>
  );
};

export const EdgelessThemeFilterValue = ({
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
                value: 'system',
              });
            }}
            selected={filter.value === 'system'}
          >
            {t['com.affine.themeSettings.auto']()}
          </MenuItem>
          <MenuItem
            onClick={() => {
              onChange?.({
                ...filter,
                value: 'light',
              });
            }}
            selected={filter.value === 'light'}
          >
            {t['com.affine.themeSettings.light']()}
          </MenuItem>
          <MenuItem
            onClick={() => {
              onChange?.({
                ...filter,
                value: 'dark',
              });
            }}
            selected={filter.value === 'dark'}
          >
            {t['com.affine.themeSettings.dark']()}
          </MenuItem>
        </>
      }
    >
      <span>
        {filter.value === 'system'
          ? t['com.affine.themeSettings.auto']()
          : filter.value === 'light'
            ? t['com.affine.themeSettings.light']()
            : t['com.affine.themeSettings.dark']()}
      </span>
    </FilterValueMenu>
  );
};

export const EdgelessThemeGroupHeader = ({
  groupId,
  docCount,
}: GroupHeaderProps) => {
  const t = useI18n();
  const text =
    groupId === 'light'
      ? t['com.affine.themeSettings.light']()
      : groupId === 'dark'
        ? t['com.affine.themeSettings.dark']()
        : groupId === 'system'
          ? t['com.affine.themeSettings.auto']()
          : 'Default';

  return (
    <PlainTextDocGroupHeader groupId={groupId} docCount={docCount}>
      {text}
    </PlainTextDocGroupHeader>
  );
};
