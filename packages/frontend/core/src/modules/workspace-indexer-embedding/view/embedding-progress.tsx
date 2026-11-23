import { Progress } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { cssVarV2 } from '@toeverything/theme/v2';

import { embeddingProgress, embeddingProgressTitle } from './styles-css';

interface EmbeddingProgressProps {
  status: {
    embedded: number;
    total: number;
  } | null;
}

const EmbeddingProgress: React.FC<EmbeddingProgressProps> = ({ status }) => {
  const t = useI18n();

  const loading = status === null;

  const percent = loading
    ? 0
    : status.total === 0
      ? 1
      : status.embedded / status.total;
  const progress = Math.round(percent * 100);
  const synced = percent === 1;

  return (
    <div className={embeddingProgress} data-testid="embedding-progress-wrapper">
      <div
        className={embeddingProgressTitle}
        data-testid="embedding-progress-title"
        data-progress={loading ? 'loading' : synced ? 'synced' : 'syncing'}
      >
        <div>
          {loading
            ? t[
                'com.affine.settings.workspace.indexer-embedding.embedding.progress.loading-sync-status'
              ]()
            : synced
              ? t[
                  'com.affine.settings.workspace.indexer-embedding.embedding.progress.synced'
                ]()
              : t[
                  'com.affine.settings.workspace.indexer-embedding.embedding.progress.syncing'
                ]()}
        </div>
        {loading ? null : (
          <div data-testid="embedding-progress-count">{`${status.embedded}/${status.total}`}</div>
        )}
      </div>
      <Progress
        testId="embedding-progress"
        value={progress}
        readonly
        style={{
          visibility: loading ? 'hidden' : 'visible',
          color: cssVarV2('text/primary'),
        }}
      />
    </div>
  );
};

export default EmbeddingProgress;
