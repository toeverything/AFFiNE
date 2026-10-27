import { Button, ThemedImg } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import type { MouseEventHandler } from 'react';

import collectionIllustrationDark from '../../../components/affine/empty/assets/collection-list.dark.png';
import collectionIllustrationLight from '../../../components/affine/empty/assets/collection-list.light.png';
import docsIllustrationDark from '../../../components/affine/empty/assets/docs.dark.png';
import docsIllustrationLight from '../../../components/affine/empty/assets/docs.light.png';
import tagsIllustrationDark from '../../../components/affine/empty/assets/tag-list.dark.png';
import tagsIllustrationLight from '../../../components/affine/empty/assets/tag-list.light.png';
import * as styles from './empty-state.css';

type EmptyStateType = 'docs' | 'collections' | 'tags';

const emptyStateAssets = {
  docs: {
    illustrationLight: docsIllustrationLight,
    illustrationDark: docsIllustrationDark,
  },
  collections: {
    illustrationLight: collectionIllustrationLight,
    illustrationDark: collectionIllustrationDark,
  },
  tags: {
    illustrationLight: tagsIllustrationLight,
    illustrationDark: tagsIllustrationDark,
  },
} satisfies Record<
  EmptyStateType,
  {
    illustrationLight: string;
    illustrationDark: string;
  }
>;

const emptyStateI18nKeys = {
  docs: {
    title: 'com.affine.m.explorer.empty.docs.title',
    description: 'com.affine.m.explorer.empty.docs.description',
    actionLabel: 'com.affine.m.explorer.empty.docs.action',
  },
  collections: {
    title: 'com.affine.m.explorer.empty.collections.title',
    description: 'com.affine.m.explorer.empty.collections.description',
    actionLabel: 'com.affine.m.explorer.empty.collections.action',
  },
  tags: {
    title: 'com.affine.m.explorer.empty.tags.title',
    description: 'com.affine.m.explorer.empty.tags.description',
    actionLabel: 'com.affine.m.explorer.empty.tags.action',
  },
} as const;

export const MobileAllDocsEmptyState = ({
  type,
  onAction,
}: {
  type: EmptyStateType;
  onAction: MouseEventHandler<HTMLButtonElement>;
}) => {
  const t = useI18n();
  const assets = emptyStateAssets[type];
  const copyKeys = emptyStateI18nKeys[type];
  const title = t[copyKeys.title]();
  const description = t[copyKeys.description]();
  const actionLabel = t[copyKeys.actionLabel]();

  return (
    <section className={styles.emptyState} aria-label={title}>
      <ThemedImg
        draggable={false}
        className={styles.illustration}
        lightSrc={assets.illustrationLight}
        darkSrc={assets.illustrationDark}
      />
      <div className={styles.copy}>
        <p className={styles.title}>{title}</p>
        <p className={styles.description}>{description}</p>
      </div>
      <Button
        variant="primary"
        size="extraLarge"
        className={styles.actionButton}
        prefix={<PlusIcon />}
        prefixClassName={styles.actionIcon}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </section>
  );
};
