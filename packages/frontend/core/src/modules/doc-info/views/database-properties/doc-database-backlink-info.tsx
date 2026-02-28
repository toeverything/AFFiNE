import {
  Divider,
  PropertyCollapsibleContent,
  PropertyCollapsibleSection,
  PropertyName,
} from '@affine/component';
import { AffinePageReference } from '@affine/core/components/affine/reference-link';
import { DocService } from '@affine/core/modules/doc';
import { TemplateDocService } from '@affine/core/modules/template-doc';
import { useI18n } from '@affine/i18n';
import type { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import { DatabaseTableViewIcon, PageIcon } from '@blocksuite/icons/rc';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';
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
  onChange,
}: {
  cell: DatabaseValueCell;
  dataSource: DatabaseBlockDataSource;
  rowId: string;
  onChange: (value: unknown) => void;
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
      <config.Renderer
        cell={cell}
        dataSource={dataSource}
        rowId={rowId}
        onChange={onChange}
      />
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
  onChange,
}: {
  defaultOpen: boolean;
  row$: Observable<DatabaseRow | undefined>;
  onChange?: (
    row: DatabaseRow,
    cell: DatabaseValueCell,
    value: unknown
  ) => void;
}) => {
  const row = useLiveData(
    useMemo(() => LiveData.from(row$, undefined), [row$])
  );
  const sortedCells = useMemo(() => {
    return row?.cells
      .filter(cell => cell.property.id !== 'title')
      .toSorted((a, b) => {
        return (a.property.name$.value ?? '').localeCompare(
          b.property.name$.value ?? ''
        );
      });
  }, [row?.cells]);
  const t = useI18n();
  const templateDocService = useService(TemplateDocService);

  const isTemplateDoc = useLiveData(
    useMemo(
      () =>
        row?.docId ? templateDocService.list.isTemplate$(row.docId) : undefined,
      [row?.docId, templateDocService.list]
    )
  );

  const pageRefParams = useMemo(() => {
    const params = new URLSearchParams();
    if (row?.id) {
      params.set('blockIds', row.databaseId);
    }
    return params;
  }, [row]);

  if (!row || !sortedCells || sortedCells.length === 0 || isTemplateDoc) {
    return null;
  }

  return (
    <>
      <PropertyCollapsibleSection
        title={
          <span className={styles.databaseNameWrapper}>
            <span className={styles.databaseName}>
              {row.databaseName || t['unnamed']()}
            </span>
            {t['properties']()}
          </span>
        }
        defaultCollapsed={!defaultOpen}
        icon={<DatabaseTableViewIcon />}
        suffix={
          <AffinePageReference
            className={
              BUILD_CONFIG.isMobileEdition
                ? styles.mobileDocRefLink
                : styles.docRefLink
            }
            pageId={row.docId}
            params={pageRefParams}
            Icon={PageIcon}
          />
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
                onChange={value => onChange?.(row, cell, value)}
              />
            );
          })}
        </PropertyCollapsibleContent>
      </PropertyCollapsibleSection>
      <Divider size="thinner" className={styles.divider} />
    </>
  );
};

export const DocDatabaseBacklinkInfo = ({
  defaultOpen,
  onChange,
}: {
  defaultOpen?: {
    databaseBlockId: string;
    rowId: string;
    docId: string;
  }[];
  onChange?: (
    row: DatabaseRow,
    cell: DatabaseValueCell,
    value: unknown
  ) => void;
}) => {
  const doc = useService(DocService).doc;
  const docDatabaseBacklinks = useService(DocDatabaseBacklinksService);
  const rows = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docDatabaseBacklinks.watchDbBacklinkRows$(doc.id, defaultOpen),
          []
        ),
      [docDatabaseBacklinks, doc.id, defaultOpen]
    )
  );

  if (!rows.length) {
    return null;
  }

  return (
    <div className={styles.root}>
      {rows.map(({ docId, databaseBlockId, rowId, row$ }) => (
        <DatabaseBacklinkRow
          key={`${docId}-${rowId}`}
          defaultOpen={
            defaultOpen?.some(
              backlink =>
                backlink.databaseBlockId === databaseBlockId &&
                backlink.rowId === rowId &&
                backlink.docId === docId
            ) ?? false
          }
          row$={row$}
          onChange={onChange}
        />
      ))}
    </div>
  );
};
