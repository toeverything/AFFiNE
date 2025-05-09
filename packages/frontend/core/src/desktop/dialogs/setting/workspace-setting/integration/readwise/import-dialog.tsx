import {
  Button,
  Checkbox,
  Divider,
  Loading,
  Modal,
  notify,
  Scrollable,
} from '@affine/component';
import { IntegrationService } from '@affine/core/modules/integration';
import type { ReadwiseHighlight } from '@affine/core/modules/integration/type';
import { i18nTime, Trans, useI18n } from '@affine/i18n';
import { InformationFillDuotoneIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import {
  type ChangeEvent,
  type Dispatch,
  forwardRef,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Virtuoso } from 'react-virtuoso';

import * as styles from './import-dialog.css';
import { readwiseTrack } from './track';

export const ImportDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useI18n();
  const readwise = useService(IntegrationService).readwise;
  const crawler = readwise.crawler;

  const [importProgress, setImportProgress] = useState(0);
  const crawlingData = useLiveData(crawler.data$);
  const error = useLiveData(crawler.error$);
  const loading = useLiveData(crawler.crawling$);

  const highlights = useMemo(
    () => crawlingData?.highlights ?? [],
    [crawlingData]
  );
  const books = useMemo(() => crawlingData?.books ?? {}, [crawlingData]);
  const timestamp = crawlingData?.startTime;
  const [stage, setStage] = useState<'select' | 'writing'>('select');
  const abortControllerRef = useRef<AbortController | null>(null);

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose]
  );
  const handleConfirmImport = useCallback(
    (ids: string[]) => {
      readwiseTrack.confirmIntegrationImport({
        control: 'Readwise import list',
        method: readwise.setting$('lastImportedAt').value
          ? 'withtimestamp'
          : 'new',
      });

      if (ids.length === 0) {
        onClose();
        return;
      }
      setStage('writing');
      const selectedHighlights = highlights.filter(h => ids.includes(h.id));

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const signal = abortController.signal;

      const startTime = Date.now();
      readwise
        .highlightsToAffineDocs(selectedHighlights.reverse(), books, {
          signal,
          onProgress: setImportProgress,
          onComplete: () => {
            readwiseTrack.completeIntegrationImport({
              total: selectedHighlights.length,
              done: selectedHighlights.length,
              time: (Date.now() - startTime) / 1000,
            });
            readwise.updateSetting('lastImportedAt', timestamp);
            onClose();
          },
          onAbort: finished => {
            readwiseTrack.abortIntegrationImport({
              total: selectedHighlights.length,
              done: finished,
              time: (Date.now() - startTime) / 1000,
            });
            notify({
              icon: <InformationFillDuotoneIcon />,
              style: 'normal',
              alignMessage: 'icon',
              title:
                t[
                  'com.affine.integration.readwise.import.abort-notify-title'
                ](),
              message: t.t(
                'com.affine.integration.readwise.import.abort-notify-desc',
                { finished }
              ),
            });
          },
        })
        .catch(console.error);
    },
    [books, highlights, onClose, readwise, t, timestamp]
  );
  const handleStopImport = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStage('select');
    setImportProgress(0);
  }, []);

  const handleRetryCrawl = useCallback(() => {
    crawler.abort();
    crawler.crawl();
  }, [crawler]);

  useEffect(() => {
    return () => {
      // reset crawler
      crawler.reset();

      // stop importing
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [crawler]);

  useEffect(() => {
    crawler.crawl();

    return () => {
      crawler.abort();
    };
  }, [crawler]);

  return (
    <Modal
      open={true}
      contentOptions={{ className: clsx(styles.importDialog, stage) }}
      onOpenChange={onOpenChange}
      withoutCloseButton={stage === 'writing'}
      persistent={stage === 'writing'}
    >
      {stage === 'select' ? (
        error ? (
          <CrawlerError onRetry={handleRetryCrawl} />
        ) : (
          <SelectStage
            loading={loading}
            highlights={highlights}
            onClose={onClose}
            onConfirm={handleConfirmImport}
            onResetLastImportedAt={handleRetryCrawl}
          />
        )
      ) : (
        <WritingStage progress={importProgress} onStop={handleStopImport} />
      )}
    </Modal>
  );
};

const CrawlerError = ({ onRetry }: { onRetry: () => void }) => {
  return (
    <>
      Unexpected error occurred, please try again.
      <Button onClick={onRetry}>Retry</Button>
    </>
  );
};

const SelectStage = ({
  loading,
  highlights,
  onClose,
  onConfirm,
  onResetLastImportedAt,
}: {
  loading: boolean;
  highlights: ReadwiseHighlight[];
  onClose: () => void;
  onConfirm: (ids: ReadwiseHighlight['id'][]) => void;
  onResetLastImportedAt: () => void;
}) => {
  const t = useI18n();
  const readwise = useService(IntegrationService).readwise;
  const settings = useLiveData(readwise.settings$);
  const lastImportedAt = settings?.lastImportedAt;
  const [selected, setSelected] = useState<ReadwiseHighlight['id'][]>([]);

  const handleResetLastImportedAt = useCallback(() => {
    readwiseTrack.startIntegrationImport({
      method: 'cleartimestamp',
      control: 'Readwise import list',
    });
    readwise.updateSetting('lastImportedAt', undefined);
    onResetLastImportedAt();
  }, [onResetLastImportedAt, readwise]);

  const handleConfirmImport = useCallback(() => {
    onConfirm(selected);
  }, [onConfirm, selected]);

  // select all highlights when highlights changed
  useEffect(() => {
    if (!loading) {
      setSelected(highlights.map(h => h.id));
    }
  }, [highlights, loading]);

  return (
    <>
      <header>
        <h3 className={styles.title}>
          {t['com.affine.integration.readwise.import.title']()}
        </h3>
        <div className={styles.desc}>
          {lastImportedAt ? (
            <Trans
              i18nKey="com.affine.integration.readwise.import.desc-from-last"
              values={{
                lastImportedAt: i18nTime(lastImportedAt, {
                  absolute: { accuracy: 'second' },
                }),
              }}
              components={{
                a: (
                  <a
                    href="#"
                    className={styles.resetLastImportedAt}
                    onClick={handleResetLastImportedAt}
                  ></a>
                ),
              }}
            ></Trans>
          ) : (
            t['com.affine.integration.readwise.import.desc-from-start']()
          )}
        </div>
        <Divider size="thinner" />
      </header>

      <main className={styles.content}>
        {loading ? (
          <div className={styles.loading}>
            <Loading />
            {t['Loading']()}
          </div>
        ) : highlights.length > 0 ? (
          <HighlightTable
            selected={selected}
            setSelected={setSelected}
            highlights={highlights}
          />
        ) : (
          <HighlightEmpty />
        )}
      </main>

      <footer>
        <Divider size="thinner" className={styles.footerDivider} />
        <div className={styles.actions}>
          <Button onClick={onClose}>{t['Cancel']()}</Button>
          <Button
            disabled={
              loading || (selected.length === 0 && highlights.length !== 0)
            }
            variant="primary"
            onClick={handleConfirmImport}
          >
            {t['Confirm']()}
          </Button>
        </div>
      </footer>
    </>
  );
};

const Scroller = forwardRef<HTMLDivElement>(function Scroller(props, ref) {
  return (
    <Scrollable.Root>
      <Scrollable.Viewport ref={ref} {...props}></Scrollable.Viewport>
      <Scrollable.Scrollbar />
    </Scrollable.Root>
  );
});

const HighlightTable = ({
  selected,
  setSelected,
  highlights,
}: {
  selected: ReadwiseHighlight['id'][];
  setSelected: Dispatch<SetStateAction<ReadwiseHighlight['id'][]>>;
  highlights: ReadwiseHighlight[];
}) => {
  const t = useI18n();
  const readwise = useService(IntegrationService).readwise;
  const [updatedMap, setUpdatedMap] =
    useState<
      Record<ReadwiseHighlight['id'], ReadwiseHighlight['updated_at']>
    >();
  const syncNewHighlights = useLiveData(
    useMemo(() => readwise.setting$('syncNewHighlights'), [readwise])
  );
  const updateStrategy = useLiveData(
    useMemo(() => readwise.setting$('updateStrategy'), [readwise])
  );

  useEffect(() => {
    readwise
      .getRefs()
      .then(refs => {
        setUpdatedMap(
          refs.reduce(
            (acc, ref) => {
              acc[ref.refMeta.highlightId] = ref.refMeta.updatedAt;
              return acc;
            },
            {} as Record<string, string>
          )
        );
      })
      .catch(console.error);
  }, [readwise]);

  const handleToggleSelectAll = useCallback(
    (_: ChangeEvent, checked: boolean) => {
      readwiseTrack.selectIntegrationImport({
        method: 'all',
        option: checked ? 'on' : 'off',
        control: 'Readwise import list',
      });
      setSelected(checked ? highlights.map(h => h.id) : []);
    },
    [highlights, setSelected]
  );

  return (
    <div className={styles.table}>
      <div className={styles.tableHeadRow}>
        <div className={styles.tableCellSelect}>
          <Checkbox
            checked={selected.length === highlights.length}
            onChange={handleToggleSelectAll}
          />
        </div>
        <div className={styles.tableCellTitle}>
          {t['com.affine.integration.readwise.import.cell-h-content']()}
        </div>
        <div className={styles.tableCellTodo}>
          {t['com.affine.integration.readwise.import.cell-h-todo']()}
        </div>
        <div className={styles.tableCellTime}>
          {t['com.affine.integration.readwise.import.cell-h-time']()}
        </div>
      </div>
      <Virtuoso
        className={styles.tableContent}
        totalCount={highlights.length}
        itemContent={idx => {
          const highlight = highlights[idx];
          const localUpdatedAt = updatedMap?.[highlight.id];
          const readwiseUpdatedAt = highlight.updated_at;
          const action = readwise.getAction({
            localUpdatedAt,
            remoteUpdatedAt: readwiseUpdatedAt,
            updateStrategy,
            syncNewHighlights,
          });
          return (
            <li className={styles.tableBodyRow}>
              <div className={styles.tableCellSelect}>
                <Checkbox
                  checked={selected.includes(highlight.id)}
                  onChange={(_: ChangeEvent, checked: boolean) => {
                    readwiseTrack.selectIntegrationImport({
                      method: 'single',
                      option: checked ? 'on' : 'off',
                      control: 'Readwise import list',
                    });
                    setSelected(
                      checked
                        ? [...selected, highlight.id]
                        : selected.filter(id => id !== highlight.id)
                    );
                  }}
                />
              </div>
              <div className={styles.tableCellTitle}>
                <a
                  href={highlight.readwise_url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.tableCellLink}
                >
                  {highlight.text}
                </a>
              </div>
              <div className={styles.tableCellTodo}>
                {action === 'new' ? (
                  <span className={styles.todoNew}>
                    {t['com.affine.integration.readwise.import.todo-new']()}
                  </span>
                ) : action === 'skip' ? (
                  <span className={styles.todoSkip}>
                    {t['com.affine.integration.readwise.import.todo-skip']()}
                  </span>
                ) : (
                  <span className={styles.todoUpdate}>
                    {t['com.affine.integration.readwise.import.todo-update']()}
                  </span>
                )}
              </div>
              <div className={styles.tableCellTime}>
                {i18nTime(readwiseUpdatedAt, {
                  absolute: { accuracy: 'second' },
                })}
              </div>
            </li>
          );
        }}
        components={{ Scroller }}
      />
    </div>
  );
};
const HighlightEmpty = () => {
  const t = useI18n();
  return (
    <div className={styles.empty}>
      {t['com.affine.integration.readwise.import.empty']()}
    </div>
  );
};

const WritingStage = ({
  progress,
  onStop,
}: {
  progress: number;
  onStop: () => void;
}) => {
  const t = useI18n();
  return (
    <>
      <header className={styles.importingHeader}>
        <Loading
          speed={0}
          progress={progress}
          className={styles.importingLoading}
          size={24}
          strokeWidth={3}
        />
        <h3 className={styles.importingTitle}>
          {t['com.affine.integration.readwise.import.importing']()}
        </h3>
      </header>

      <main className={styles.importingDesc}>
        {t['com.affine.integration.readwise.import.importing-desc']()}
      </main>

      <footer className={styles.importingFooter}>
        <Button variant="error" onClick={onStop}>
          {t['com.affine.integration.readwise.import.importing-stop']()}
        </Button>
      </footer>
    </>
  );
};
