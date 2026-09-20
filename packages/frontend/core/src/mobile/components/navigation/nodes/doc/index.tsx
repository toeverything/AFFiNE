import { Loading } from '@affine/component';
import type { NodeOperation } from '@affine/core/desktop/components/navigation-panel';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { NavigationPanelService } from '@affine/core/modules/navigation-panel';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService, useServices } from '@toeverything/infra';
import { useCallback, useEffect, useMemo } from 'react';

import { MobileShellDataProjection } from '../../../../modules/navigation-projection';
import { AddItemPlaceholder } from '../../layouts/add-item-placeholder';
import { NavigationPanelTreeNode } from '../../tree/node';
import {
  NavigationPanelDocNodeMenu,
  useNavigationPanelDocNodeAddLinkedPage,
} from './operations';
import * as styles from './styles.css';

export const NavigationPanelDocNode = ({
  docId,
  isLinked,
  operations: additionalOperations,
  parentPath,
}: {
  docId: string;
  isLinked?: boolean;
  operations?: NodeOperation[];
  parentPath: string[];
}) => {
  const t = useI18n();
  const { docDisplayMetaService, featureFlagService } = useServices({
    DocDisplayMetaService,
    FeatureFlagService,
  });
  const navigationPanelService = useService(NavigationPanelService);
  const dataProjection = useService(MobileShellDataProjection);
  const entry = useLiveData(dataProjection.entry$(docId));
  const path = useMemo(
    () => [...parentPath, `doc-${docId}`],
    [parentPath, docId]
  );
  const collapsed = useLiveData(navigationPanelService.collapsed$(path));
  const setCollapsed = useCallback(
    (value: boolean) => {
      navigationPanelService.setCollapsed(path, value);
    },
    [navigationPanelService, path]
  );

  const DocIcon = useLiveData(
    docDisplayMetaService.icon$(docId, {
      reference: isLinked,
    })
  );

  const enableEmojiIcon = useLiveData(
    featureFlagService.flags.enable_emoji_doc_icon.$
  );

  const Icon = useCallback(
    ({ className }: { className?: string }) => (
      <DocIcon className={className} />
    ),
    [DocIcon]
  );

  const children = useLiveData(
    dataProjection.refsByDoc$.selector(refs => refs.get(docId))
  );
  useEffect(
    () => (collapsed ? undefined : dataProjection.registerExpandedDoc(docId)),
    [collapsed, dataProjection, docId]
  );

  const openNodeCollapsed = useCallback(
    () => setCollapsed(false),
    [setCollapsed]
  );
  const handleAddLinkedPage = useNavigationPanelDocNodeAddLinkedPage(
    docId,
    openNodeCollapsed
  );
  const menuTarget = useMemo(
    () => (
      <NavigationPanelDocNodeMenu
        docId={docId}
        handleAddLinkedPage={handleAddLinkedPage}
        additionalOperations={additionalOperations}
      />
    ),
    [additionalOperations, docId, handleAddLinkedPage]
  );

  if (entry?.trash !== false) {
    return null;
  }

  return (
    <NavigationPanelTreeNode
      icon={Icon}
      name={entry.title}
      extractEmojiAsIcon={enableEmojiIcon}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      to={`/${docId}`}
      active={entry.active}
      postfix={
        children === undefined &&
        !collapsed && (
          <div className={styles.loadingIcon}>
            <Loading />
          </div>
        )
      }
      menuTarget={menuTarget}
      data-testid={`navigation-panel-doc-${docId}`}
    >
      {entry.canRead
        ? children?.map((child, index) => (
            <NavigationPanelDocNode
              key={`${child.docId}-${index}`}
              docId={child.docId}
              isLinked
              parentPath={path}
            />
          ))
        : null}
      {entry.canUpdate ? (
        <AddItemPlaceholder
          label={t['com.affine.rootAppSidebar.explorer.doc-add-tooltip']()}
          onClick={handleAddLinkedPage}
        />
      ) : null}
    </NavigationPanelTreeNode>
  );
};
