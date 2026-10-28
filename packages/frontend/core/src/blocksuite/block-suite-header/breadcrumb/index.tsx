import { IconButton, Menu, MenuItem } from '@affine/component';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { DocAncestorsService } from '@affine/core/modules/doc-link';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import {
  WorkbenchLink,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { MoreHorizontalIcon } from '@blocksuite/icons/rc';
import { LiveData, useLiveData, useServices } from '@toeverything/infra';
import { Fragment, useMemo } from 'react';
import { of } from 'rxjs';

import * as styles from './style.css';

/**
 * When there are more ancestors than this, the middle ones are folded into a menu.
 */
const MAX_VISIBLE_ANCESTORS = 3;

const onOpenDoc = () => {
  track.$.header.breadcrumb.openDoc();
};

const BreadcrumbItem = ({ docId }: { docId: string }) => {
  const { docDisplayMetaService } = useServices({ DocDisplayMetaService });
  const Icon = useLiveData(docDisplayMetaService.icon$(docId));
  const title = useLiveData(docDisplayMetaService.title$(docId));

  return (
    <WorkbenchLink
      to={`/${docId}`}
      className={styles.item}
      onClick={onOpenDoc}
      data-testid="doc-breadcrumb-item"
    >
      <Icon className={styles.itemIcon} />
      <span className={styles.itemTitle}>{title}</span>
    </WorkbenchLink>
  );
};

const BreadcrumbMenuItem = ({ docId }: { docId: string }) => {
  const { docDisplayMetaService, workbenchService } = useServices({
    DocDisplayMetaService,
    WorkbenchService,
  });
  const Icon = useLiveData(docDisplayMetaService.icon$(docId));
  const title = useLiveData(docDisplayMetaService.title$(docId));

  return (
    <MenuItem
      prefixIcon={<Icon />}
      onSelect={() => {
        onOpenDoc();
        workbenchService.workbench.openDoc(docId);
      }}
    >
      {title}
    </MenuItem>
  );
};

const Separator = () => <span className={styles.separator}>/</span>;

/**
 * Shows the docs that link to the current doc, from the root of the
 * linked doc tree down to the direct parent.
 */
export const DocBreadcrumb = ({ docId }: { docId: string }) => {
  const t = useI18n();
  const { docAncestorsService, featureFlagService, workspaceService } =
    useServices({
      DocAncestorsService,
      FeatureFlagService,
      WorkspaceService,
    });
  const enabled = useLiveData(featureFlagService.flags.enable_doc_breadcrumb.$);
  const isSharedMode = workspaceService.workspace.openOptions.isSharedMode;

  const ancestors = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          enabled && !isSharedMode
            ? docAncestorsService.watchAncestors(docId)
            : of([]),
          []
        ),
      [docAncestorsService, docId, enabled, isSharedMode]
    )
  );

  if (ancestors.length === 0) {
    return null;
  }

  const folded =
    ancestors.length > MAX_VISIBLE_ANCESTORS ? ancestors.slice(1, -1) : [];
  const visible =
    folded.length > 0
      ? [ancestors[0], ancestors[ancestors.length - 1]]
      : ancestors;

  return (
    <nav className={styles.breadcrumb} data-testid="doc-breadcrumb">
      {visible.map((ancestorId, index) => (
        <Fragment key={ancestorId}>
          <BreadcrumbItem docId={ancestorId} />
          <Separator />
          {index === 0 && folded.length > 0 ? (
            <>
              <Menu
                items={folded.map(id => (
                  <BreadcrumbMenuItem key={id} docId={id} />
                ))}
              >
                <IconButton
                  size={16}
                  tooltip={t['com.affine.header.breadcrumb.more']()}
                  data-testid="doc-breadcrumb-more"
                >
                  <MoreHorizontalIcon />
                </IconButton>
              </Menu>
              <Separator />
            </>
          ) : null}
        </Fragment>
      ))}
    </nav>
  );
};
