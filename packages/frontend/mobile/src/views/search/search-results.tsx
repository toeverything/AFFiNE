import { useI18n } from '@affine/i18n';

import { DocCard, type DocCardProps } from '../../components';
import {
  UniversalSearchResultItem,
  type UniversalSearchResultItemProps,
} from '../../components/search-result/universal-item';
import * as styles from './style.css';

export interface SearchResultsProps {
  title: string;
  docs?: DocCardProps['meta'][];
  collections?: UniversalSearchResultItemProps['item'][];
  tags?: UniversalSearchResultItemProps['item'][];
}

const Empty = () => {
  const t = useI18n();
  return (
    <div className={styles.empty}>{t['com.affine.mobile.search.empty']()}</div>
  );
};

export const SearchResults = ({
  title,
  docs,
  collections,
  tags,
}: SearchResultsProps) => {
  return (
    <>
      <div className={styles.resTitle}>{title}</div>

      {!docs?.length && !collections?.length && !tags?.length ? (
        <Empty />
      ) : null}

      {/* Doc Res */}
      {docs?.length ? (
        <div className={styles.resBlock} data-scroll>
          <div className={styles.resBlockTitle}>Docs</div>
          <div className={styles.resBlockScrollContent}>
            <div className={styles.scrollDocsContent}>
              {docs.map(doc => (
                <DocCard meta={doc} key={doc.id} className={styles.docCard} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Collection Res */}
      {collections?.length ? (
        <div className={styles.resBlock}>
          <div className={styles.resBlockTitle}>Collections</div>
          <div className={styles.resBlockListContent}>
            {collections.map(collection => (
              <UniversalSearchResultItem
                category="collection"
                id={collection.payload.collectionId}
                key={collection.id}
                item={collection}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Tag Res */}
      {tags?.length ? (
        <div className={styles.resBlock}>
          <div className={styles.resBlockTitle}>Tags</div>
          <div className={styles.resBlockListContent}>
            {tags.map(tag => (
              <UniversalSearchResultItem
                category="tag"
                id={tag.payload.tagId}
                key={tag.id}
                item={tag}
              />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
};
