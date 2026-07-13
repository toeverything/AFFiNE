import { Button, ThemedImg } from '@affine/component';
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

const emptyStateCopy = {
  docs: {
    illustrationLight: docsIllustrationLight,
    illustrationDark: docsIllustrationDark,
    title: 'No documents yet',
    description:
      'Create your first document to start capturing ideas and organizing knowledge.',
    actionLabel: 'New Document',
  },
  collections: {
    illustrationLight: collectionIllustrationLight,
    illustrationDark: collectionIllustrationDark,
    title: 'No collections yet',
    description:
      'Create a collection to organize related content in one place.',
    actionLabel: 'New Collection',
  },
  tags: {
    illustrationLight: tagsIllustrationLight,
    illustrationDark: tagsIllustrationDark,
    title: 'No tags yet',
    description:
      'Add tags to your documents for easier organization and discovery.',
    actionLabel: 'New Tag',
  },
} satisfies Record<
  EmptyStateType,
  {
    illustrationLight: string;
    illustrationDark: string;
    title: string;
    description: string;
    actionLabel: string;
  }
>;

export const MobileAllDocsEmptyState = ({
  type,
  onAction,
}: {
  type: EmptyStateType;
  onAction: MouseEventHandler<HTMLButtonElement>;
}) => {
  const copy = emptyStateCopy[type];

  return (
    <section className={styles.emptyState} aria-label={copy.title}>
      <ThemedImg
        draggable={false}
        className={styles.illustration}
        lightSrc={copy.illustrationLight}
        darkSrc={copy.illustrationDark}
      />
      <div className={styles.copy}>
        <p className={styles.title}>{copy.title}</p>
        <p className={styles.description}>{copy.description}</p>
      </div>
      <Button
        variant="primary"
        size="extraLarge"
        className={styles.actionButton}
        prefix={<PlusIcon />}
        prefixClassName={styles.actionIcon}
        onClick={onAction}
      >
        {copy.actionLabel}
      </Button>
    </section>
  );
};
