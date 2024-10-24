import {
  Divider,
  PropertyCollapsibleContent,
  PropertyCollapsibleSection,
  PropertyName,
} from '@affine/component';
import { AffinePageReference } from '@affine/core/components/affine/reference-link';
import { useI18n } from '@affine/i18n';
import type { DatabaseBlockDataSource } from '@blocksuite/affine/blocks';
import { DatabaseTableViewIcon } from '@blocksuite/icons/rc';
import {
  DocService,
  LiveData,
  useLiveData,
  useService,
} from '@toeverything/infra';
import { Fragment, useMemo } from 'react';
import type { Observable } from 'rxjs';

import { DocDatabaseBacklinksService } from '../../services/doc-database-backlinks';
import type { DatabaseRow, DatabaseValueCell } from '../../types';
import { DatabaseRendererTypes } from './constant';
import * as styles from './doc-database-backlink-info.css';

type CellConfig =
  (typeof DatabaseRendererTypes)[keyof typeof DatabaseRendererTypes];

const DatabaseBacklinkCellName = ({
  cell,
  config,
}: {
  cell: DatabaseValueCell;
  config: CellConfig;
}) => {
  const propertyName = useLiveData(cell.property.name$);
  const t = useI18n();
  return (
    <PropertyName
      icon={<config.Icon />}
      name={propertyName ?? (config.name ? t.t(config.name) : t['unnamed']())}
    />
  );
};

const DatabaseBacklinkCell = ({
  cell,
  dataSource,
  rowId,
}: {
  cell: DatabaseValueCell;
  dataSource: DatabaseBlockDataSource;
  rowId: string;
}) => {
  const cellType = useLiveData(cell.property.type$);

  const config = cellType ? DatabaseRendererTypes[cellType] : undefined;

  // do not render title cell!
  if (!config || cellType === 'title') {
    return null;
  }

  return (
    <li
      key={cell.id}
      className={styles.cell}
      data-testid="database-backlink-cell"
    >
      <DatabaseBacklinkCellName cell={cell} config={config} />
      <config.Renderer cell={cell} dataSource={dataSource} rowId={rowId} />
    </li>
  );
};

/**
 * A row in the database backlink info.
 * Note: it is being rendered in a list. The name might be confusing.
 */
const DatabaseBacklinkRow = ({
  defaultOpen = false,
  row$,
}: {
  defaultOpen: boolean;
  row$: Observable<DatabaseRow | undefined>;
}) => {
  const row = useLiveData(
    useMemo(() => LiveData.from(row$, undefined), [row$])
  );
  const sortedCells = useMemo(() => {
    return row?.cells.toSorted((a, b) => {
      return (a.property.name$.value ?? '').localeCompare(
        b.property.name$.value ?? ''
      );
    });
  }, [row?.cells]);
  const t = useI18n();

  if (!row || !sortedCells) {
    return null;
  }

  return (
    <PropertyCollapsibleSection
      title={row.databaseName + ' ' + t['properties']()}
      defaultCollapsed={!defaultOpen}
      icon={<DatabaseTableViewIcon />}
      suffix={
        <AffinePageReference className={styles.docRefLink} pageId={row.docId} />
      }
    >
      <PropertyCollapsibleContent
        className={styles.cellList}
        collapsible={false}
      >
        {sortedCells.map(cell => {
          return (
            <DatabaseBacklinkCell
              key={cell.id}
              cell={cell}
              dataSource={row.dataSource}
              rowId={row.id}
            />
          );
        })}
      </PropertyCollapsibleContent>
    </PropertyCollapsibleSection>
  );
};

export const DocDatabaseBacklinkInfo = ({
  defaultOpen = [],
}: {
  defaultOpen?: {
    docId: string;
    blockId: string;
  }[];
}) => {
  const doc = useService(DocService).doc;
  const docDatabaseBacklinks = useService(DocDatabaseBacklinksService);
  const rows = useLiveData(
    useMemo(
      () =>
        LiveData.from(docDatabaseBacklinks.watchDbBacklinkRows$(doc.id), []),
      [docDatabaseBacklinks, doc.id]
    )
  );

  if (!rows.length) {
    return null;
  }

  return (
    <div className={styles.root}>
      {rows.map(({ docId, rowId, row$ }) => (
        <Fragment key={`${docId}-${rowId}`}>
          <DatabaseBacklinkRow
            defaultOpen={defaultOpen?.some(
              backlink => backlink.docId === docId && backlink.blockId === rowId
            )}
            row$={row$}
          />
          <Divider size="thinner" className={styles.divider} />
        </Fragment>
      ))}
    </div>
  );
};
