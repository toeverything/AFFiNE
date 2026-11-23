import { Button, IconButton } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { ToggleRightIcon } from '@blocksuite/icons/rc';
import { useLiveData } from '@toeverything/infra';
import clsx from 'clsx';
import {
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useContext,
} from 'react';

import { DocExplorerContext } from '../context';
import * as styles from './group-header.css';

export const DocGroupHeader = ({
  className,
  groupId,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  groupId: string;
}) => {
  const t = useI18n();
  const contextValue = useContext(DocExplorerContext);

  const groups = useLiveData(contextValue.groups$);
  const selectedDocIds = useLiveData(contextValue.selectedDocIds$);
  const collapsedGroups = useLiveData(contextValue.collapsedGroups$);
  const selectMode = useLiveData(contextValue.selectMode$);

  const group = groups.find(g => g.key === groupId);
  const isGroupAllSelected = group?.items.every(id =>
    selectedDocIds.includes(id)
  );

  const handleToggleCollapse = useCallback(() => {
    const prev = contextValue.collapsedGroups$.value;
    contextValue.collapsedGroups$.next(
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  }, [groupId, contextValue]);

  const handleSelectAll = useCallback(() => {
    if (!contextValue.selectMode$?.value) {
      contextValue.selectMode$?.next(true);
    }
    const prev = contextValue.selectedDocIds$.value;
    if (isGroupAllSelected) {
      contextValue.selectedDocIds$.next(
        prev.filter(id => !group?.items.includes(id))
      );
    } else {
      const newSelected = [...prev];
      group?.items.forEach(id => {
        if (!newSelected.includes(id)) {
          newSelected.push(id);
        }
      });
      contextValue.selectedDocIds$.next(newSelected);
    }
  }, [contextValue, group?.items, isGroupAllSelected]);

  const selectedCount = group?.items.filter(id =>
    selectedDocIds.includes(id)
  ).length;

  return (
    <div
      className={styles.groupHeader}
      data-collapsed={collapsedGroups.includes(groupId)}
    >
      <div className={clsx(styles.content, className)} {...props} />
      {selectMode ? (
        <div className={styles.selectInfo}>
          {selectedCount}/{group?.items.length}
        </div>
      ) : null}
      <IconButton
        className={styles.collapseButton}
        icon={<ToggleRightIcon className={styles.collapseButtonIcon} />}
        onClick={handleToggleCollapse}
      />
      <div className={styles.space} />
      <Button
        size="custom"
        className={styles.selectAllButton}
        variant="plain"
        onClick={handleSelectAll}
      >
        {t[
          isGroupAllSelected
            ? 'com.affine.page.group-header.clear'
            : 'com.affine.page.group-header.select-all'
        ]()}
      </Button>
    </div>
  );
};

export const PlainTextDocGroupHeader = ({
  groupId,
  docCount,
  className,
  children,
  icon,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  groupId: string;
  docCount: number;
  icon?: ReactNode;
}) => {
  return (
    <DocGroupHeader
      className={clsx(styles.plainTextGroupHeader, className)}
      groupId={groupId}
      {...props}
    >
      {icon ? (
        <div className={styles.plainTextGroupHeaderIcon}>{icon}</div>
      ) : null}
      <div>{children ?? groupId}</div>
      <div>·</div>
      <div>{docCount}</div>
    </DocGroupHeader>
  );
};
