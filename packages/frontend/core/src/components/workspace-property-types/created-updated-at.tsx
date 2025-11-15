import { PropertyValue, Tooltip } from '@affine/component';
import { type DocRecord, DocService } from '@affine/core/modules/doc';
import { i18nTime, useI18n } from '@affine/i18n';
import { useLiveData, useServices } from '@toeverything/infra';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import type { GroupHeaderProps } from '../explorer/types';
import * as styles from './created-updated-at.css';

const toRelativeDate = (time: string | number) => {
  return i18nTime(time, {
    relative: {
      max: [1, 'day'],
      accuracy: 'day',
    },
    absolute: {
      accuracy: 'day',
    },
  });
};

const MetaDateValueFactory = ({
  type,
}: {
  type: 'createDate' | 'updatedDate';
}) =>
  function ReadonlyDateValue() {
    const { docService } = useServices({
      DocService,
    });

    const docMeta = useLiveData(docService.doc.meta$);
    const value = docMeta?.[type];

    const relativeDate = value ? toRelativeDate(value) : null;
    const date = value ? i18nTime(value) : null;

    return (
      <Tooltip content={date} side="top" align="end">
        <PropertyValue
          className={relativeDate ? '' : styles.empty}
          isEmpty={!relativeDate}
        >
          {relativeDate}
        </PropertyValue>
      </Tooltip>
    );
  };

export const CreateAtValue = MetaDateValueFactory({
  type: 'createDate',
});

export const UpdatedAtValue = MetaDateValueFactory({
  type: 'updatedDate',
});

export const CreatedAtGroupHeader = ({
  groupId,
  docCount,
}: GroupHeaderProps) => {
  const date = groupId ? toRelativeDate(groupId) : 'No Date';
  return (
    <PlainTextDocGroupHeader
      style={{ textTransform: 'capitalize' }}
      groupId={groupId}
      docCount={docCount}
    >
      {date}
    </PlainTextDocGroupHeader>
  );
};

export const UpdatedAtGroupHeader = ({
  groupId,
  docCount,
}: GroupHeaderProps) => {
  const t = useI18n();
  const date = groupId
    ? toRelativeDate(groupId)
    : t['com.affine.all-docs.group.updated-at.never-updated']();
  return (
    <PlainTextDocGroupHeader
      style={{ textTransform: 'capitalize' }}
      groupId={groupId}
      docCount={docCount}
    >
      {date}
    </PlainTextDocGroupHeader>
  );
};

export const CreateAtDocListProperty = ({ doc }: { doc: DocRecord }) => {
  const t = useI18n();
  const docMeta = useLiveData(doc.meta$);
  const createDate = docMeta?.createDate;

  if (!createDate) return null;

  return (
    <Tooltip
      content={
        <span className={styles.tooltip}>
          {t.t('created at', { time: i18nTime(createDate) })}
        </span>
      }
    >
      <div className={styles.dateDocListInlineProperty}>
        {i18nTime(createDate, { relative: true })}
      </div>
    </Tooltip>
  );
};

export const UpdatedAtDocListProperty = ({ doc }: { doc: DocRecord }) => {
  const t = useI18n();
  const docMeta = useLiveData(doc.meta$);
  const updatedDate = docMeta?.updatedDate;

  if (!updatedDate) return null;

  return (
    <Tooltip
      content={
        <span className={styles.tooltip}>
          {t.t('updated at', { time: i18nTime(updatedDate) })}
        </span>
      }
    >
      <div className={styles.dateDocListInlineProperty}>
        {i18nTime(updatedDate, { relative: true })}
      </div>
    </Tooltip>
  );
};

export { DateFilterValue as CreatedAtFilterValue } from './date';
export { DateFilterValue as UpdatedAtFilterValue } from './date';
