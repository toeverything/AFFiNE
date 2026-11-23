import { MenuItem, PropertyValue, type RadioItem } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { type DocRecord, DocService } from '@affine/core/modules/doc';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { useI18n } from '@affine/i18n';
import { LongerIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import { StackProperty } from '../explorer/docs-view/stack-property';
import type { GroupHeaderProps } from '../explorer/types';
import { FilterValueMenu } from '../filter/filter-value-menu';
import type { PropertyValueProps } from '../properties/types';
import { PropertyRadioGroup } from '../properties/widgets/radio-group';
import { container } from './page-width.css';

export const PageWidthValue = ({ readonly }: PropertyValueProps) => {
  const t = useI18n();
  const editorSetting = useService(EditorSettingService).editorSetting;
  const defaultPageWidth = useLiveData(editorSetting.settings$).fullWidthLayout;

  const doc = useService(DocService).doc;
  const pageWidth = useLiveData(doc.properties$.selector(p => p.pageWidth));

  const radioValue = pageWidth ?? (defaultPageWidth ? 'fullWidth' : 'standard');

  const radioItems = useMemo<RadioItem[]>(
    () => [
      {
        value: 'standard',
        label:
          t[
            'com.affine.settings.editorSettings.page.default-page-width.standard'
          ](),
        testId: 'standard-width-trigger',
      },
      {
        value: 'fullWidth',
        label:
          t[
            'com.affine.settings.editorSettings.page.default-page-width.full-width'
          ](),
        testId: 'full-width-trigger',
      },
    ],
    [t]
  );

  const handleChange = useCallback(
    (value: string) => {
      doc.record.setProperty('pageWidth', value);
    },
    [doc]
  );
  return (
    <PropertyValue className={container} hoverable={false} readonly={readonly}>
      <PropertyRadioGroup
        value={radioValue}
        onChange={handleChange}
        items={radioItems}
        disabled={readonly}
      />
    </PropertyValue>
  );
};

export const PageWidthDocListProperty = ({ doc }: { doc: DocRecord }) => {
  const t = useI18n();
  const pageWidth = useLiveData(doc.properties$.selector(p => p.pageWidth));

  return (
    <StackProperty icon={<LongerIcon />}>
      {pageWidth === 'standard' || !pageWidth
        ? t[
            'com.affine.settings.editorSettings.page.default-page-width.standard'
          ]()
        : t[
            'com.affine.settings.editorSettings.page.default-page-width.full-width'
          ]()}
    </StackProperty>
  );
};

export const PageWidthFilterValue = ({
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
                value: 'fullWidth',
              });
            }}
            selected={filter.value === 'fullWidth'}
          >
            {t[
              'com.affine.settings.editorSettings.page.default-page-width.full-width'
            ]()}
          </MenuItem>
          <MenuItem
            onClick={() => {
              onChange?.({
                ...filter,
                value: 'standard',
              });
            }}
            selected={filter.value !== 'fullWidth'}
          >
            {t[
              'com.affine.settings.editorSettings.page.default-page-width.standard'
            ]()}
          </MenuItem>
        </>
      }
    >
      <span>
        {filter.value === 'fullWidth'
          ? t[
              'com.affine.settings.editorSettings.page.default-page-width.full-width'
            ]()
          : t[
              'com.affine.settings.editorSettings.page.default-page-width.standard'
            ]()}
      </span>
    </FilterValueMenu>
  );
};

export const PageWidthGroupHeader = ({
  groupId,
  docCount,
}: GroupHeaderProps) => {
  const t = useI18n();
  const text =
    groupId === 'fullWidth'
      ? t[
          'com.affine.settings.editorSettings.page.default-page-width.full-width'
        ]()
      : groupId === 'standard'
        ? t[
            'com.affine.settings.editorSettings.page.default-page-width.standard'
          ]()
        : 'Default';

  return (
    <PlainTextDocGroupHeader groupId={groupId} docCount={docCount}>
      {text}
    </PlainTextDocGroupHeader>
  );
};
