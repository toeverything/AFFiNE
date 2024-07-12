import { Menu } from '@affine/component';
import { TagService } from '@affine/core/modules/tag';
import { useI18n } from '@affine/i18n';
import { TagsIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';

import { InlineTagsList, TagsEditor } from '../tags-inline-editor';
import * as styles from './tags-row.css';

export const TagsRow = ({
  docId,
  readonly,
}: {
  docId: string;
  readonly: boolean;
}) => {
  const t = useI18n();
  const tagList = useService(TagService).tagList;
  const tagIds = useLiveData(tagList.tagIdsByPageId$(docId));
  const empty = !tagIds || tagIds.length === 0;
  return (
    <div className={styles.rowCell} data-testid="info-modal-tags-row">
      <div className={styles.rowNameContainer}>
        <div className={styles.icon}>
          <TagsIcon />
        </div>
        <div className={styles.rowName}>{t['Tags']()}</div>
      </div>
      <Menu
        contentOptions={{
          side: 'bottom',
          align: 'start',
          sideOffset: 0,
          avoidCollisions: false,
          className: styles.tagsMenu,
          onClick(e) {
            e.stopPropagation();
          },
        }}
        items={<TagsEditor pageId={docId} readonly={readonly} />}
      >
        <div
          className={clsx(styles.tagsInlineEditor, styles.rowValueCell)}
          data-empty={empty}
          data-readonly={readonly}
          data-testid="info-modal-tags-value"
        >
          {empty ? (
            t['com.affine.page-properties.property-value-placeholder']()
          ) : (
            <InlineTagsList pageId={docId} readonly />
          )}
        </div>
      </Menu>
    </div>
  );
};
