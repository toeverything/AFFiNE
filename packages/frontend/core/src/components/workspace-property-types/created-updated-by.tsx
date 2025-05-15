import { PropertyValue } from '@affine/component';
import { PublicUserLabel } from '@affine/core/modules/cloud/views/public-user';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { type DocRecord, DocService } from '@affine/core/modules/doc';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import { type ReactNode, useCallback, useMemo } from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import type { DocListPropertyProps, GroupHeaderProps } from '../explorer/types';
import { MemberSelectorInline } from '../member-selector';
import * as styles from './created-updated-by.css';

const CreatedByUpdatedByAvatar = (props: {
  type: 'CreatedBy' | 'UpdatedBy';
  doc: DocRecord;
  size?: number;
  showName?: boolean;
  emptyFallback?: ReactNode;
}) => {
  const doc = props.doc;

  const userId = useLiveData(
    props.type === 'CreatedBy' ? doc?.createdBy$ : doc?.updatedBy$
  );

  if (userId) {
    return (
      <div className={styles.userWrapper}>
        <PublicUserLabel
          id={userId}
          size={props.size}
          showName={props.showName}
        />
      </div>
    );
  }
  return props.emptyFallback === undefined ? (
    <NoRecordValue />
  ) : (
    props.emptyFallback
  );
};

const NoRecordValue = () => {
  const t = useI18n();
  return (
    <span>
      {t['com.affine.page-properties.property-user-avatar-no-record']()}
    </span>
  );
};

const LocalUserValue = () => {
  const t = useI18n();
  return <span>{t['com.affine.page-properties.local-user']()}</span>;
};

export const CreatedByValue = () => {
  const doc = useService(DocService).doc.record;
  const workspaceService = useService(WorkspaceService);
  const isCloud = workspaceService.workspace.flavour !== 'local';

  if (!isCloud) {
    return (
      <PropertyValue readonly>
        <LocalUserValue />
      </PropertyValue>
    );
  }

  return (
    <PropertyValue readonly>
      <CreatedByUpdatedByAvatar type="CreatedBy" doc={doc} />
    </PropertyValue>
  );
};

export const UpdatedByValue = () => {
  const doc = useService(DocService).doc.record;
  const workspaceService = useService(WorkspaceService);
  const isCloud = workspaceService.workspace.flavour !== 'local';

  if (!isCloud) {
    return (
      <PropertyValue readonly>
        <LocalUserValue />
      </PropertyValue>
    );
  }

  return (
    <PropertyValue readonly>
      <CreatedByUpdatedByAvatar type="UpdatedBy" doc={doc} />
    </PropertyValue>
  );
};

export const CreatedByUpdatedByFilterValue = ({
  filter,
  onChange,
}: {
  filter: FilterParams;
  onChange: (filter: FilterParams) => void;
}) => {
  const t = useI18n();

  const selected = useMemo(
    () => filter.value?.split(',').filter(Boolean) ?? [],
    [filter]
  );

  const handleChange = useCallback(
    (selected: string[]) => {
      onChange({
        ...filter,
        value: selected.join(','),
      });
    },
    [filter, onChange]
  );

  return (
    <MemberSelectorInline
      placeholder={
        <span style={{ color: cssVarV2('text/placeholder') }}>
          {t['com.affine.filter.empty']()}
        </span>
      }
      selected={selected}
      onChange={handleChange}
    />
  );
};

export const CreatedByDocListInlineProperty = ({
  doc,
}: DocListPropertyProps) => {
  return (
    <CreatedByUpdatedByAvatar
      doc={doc}
      type="CreatedBy"
      size={20}
      emptyFallback={null}
      showName={false}
    />
  );
};

export const UpdatedByDocListInlineProperty = ({
  doc,
}: DocListPropertyProps) => {
  return (
    <CreatedByUpdatedByAvatar
      type="UpdatedBy"
      doc={doc}
      showName={false}
      size={20}
      emptyFallback={null}
    />
  );
};

export const ModifiedByGroupHeader = ({
  groupId,
  docCount,
  collapsed,
  onCollapse,
}: GroupHeaderProps) => {
  const userId = groupId;

  return (
    <PlainTextDocGroupHeader
      groupId={groupId}
      docCount={docCount}
      collapsed={collapsed}
      onCollapse={onCollapse}
    >
      <div className={styles.userLabelContainer}>
        <PublicUserLabel id={userId} size={20} showName={false} />
      </div>
    </PlainTextDocGroupHeader>
  );
};
