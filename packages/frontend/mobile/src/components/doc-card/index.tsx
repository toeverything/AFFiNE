import { IconButton } from '@affine/component';
import { PagePreview } from '@affine/core/components/page-list/page-content-preview';
import { IsFavoriteIcon } from '@affine/core/components/pure/icons';
import { CompatibleFavoriteItemsAdapter } from '@affine/core/modules/properties';
import {
  WorkbenchLink,
  type WorkbenchLinkProps,
} from '@affine/core/modules/workbench';
import type { DocMeta } from '@blocksuite/store';
import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import clsx from 'clsx';
import { forwardRef, useCallback } from 'react';

import * as styles from './styles.css';
import { DocCardTags } from './tag';

export interface DocCardProps extends Omit<WorkbenchLinkProps, 'to'> {
  meta: DocMeta;
}

export const DocCard = forwardRef<HTMLAnchorElement, DocCardProps>(
  function DocCard({ meta, className, ...attrs }, ref) {
    const favAdapter = useService(CompatibleFavoriteItemsAdapter);
    const workspace = useService(WorkspaceService).workspace;

    const favorited = useLiveData(favAdapter.isFavorite$(meta.id, 'doc'));

    const toggleFavorite = useCallback(
      () => favAdapter.toggle(meta.id, 'doc'),
      [favAdapter, meta.id]
    );

    return (
      <WorkbenchLink
        to={`/${meta.id}`}
        ref={ref}
        className={clsx(styles.card, className)}
        {...attrs}
      >
        <header className={styles.head}>
          <h3 className={styles.title}>
            {meta.title || <span className={styles.untitled}>Untitled</span>}
          </h3>
          <IconButton
            icon={
              <IsFavoriteIcon onClick={toggleFavorite} favorite={favorited} />
            }
          />
        </header>
        <main className={styles.content}>
          <PagePreview
            docCollection={workspace.docCollection}
            pageId={meta.id}
            emptyFallback={<div className={styles.contentEmpty}>Empty</div>}
          />
        </main>
        <DocCardTags docId={meta.id} rows={2} />
      </WorkbenchLink>
    );
  }
);
