import { Divider, IconButton, PropertyName } from '@affine/component';
import { AffinePageReference } from '@affine/core/components/affine/reference-link';
import { useI18n } from '@affine/i18n';
import type { DatabaseBlockDataSource } from '@blocksuite/affine/blocks';
import { DatabaseTableViewIcon, ToggleExpandIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  DocService,
  LiveData,
  useLiveData,
  useService,
} from '@toeverything/infra';
import { Fragment, useCallback, useMemo, useState } from 'react';

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
    <li key={cell.id} className={styles.cell}>
      <DatabaseBacklinkCellName cell={cell} config={config} />
      <config.Renderer cell={cell} dataSource={dataSource} rowId={rowId} />
    </li>
  );
};

/**
 * A row in the database backlink info.
 * Note: it is being rendered in a list. The name might be confusing.
 */
const DatabaseBacklinkRow = ({ row }: { row: DatabaseRow }) => {
  const sortedCells = useMemo(() => {
    return row.cells.toSorted((a, b) => {
      return (a.property.name$.value ?? '').localeCompare(
        b.property.name$.value ?? ''
      );
    });
  }, [row.cells]);
  const t = useI18n();
  const [open, setOpen] = useState(true);
  const handleCollapse = useCallback(() => {
    setOpen(prev => !prev);
  }, []);
  return (
    <Collapsible.Root
      className={styles.section}
      open={open}
      onOpenChange={setOpen}
    >
      <div className={styles.header}>
        <Collapsible.Trigger
          role="button"
          onClick={handleCollapse}
          className={styles.headerTrigger}
        >
          <DatabaseTableViewIcon className={styles.headerIcon} />
          <div className={styles.headerName}>
            {row.databaseName || t['unnamed']()} {t['properties']()}
          </div>
          <IconButton size="20">
            <ToggleExpandIcon
              className={styles.collapsedIcon}
              data-collapsed={!open}
            />
          </IconButton>
        </Collapsible.Trigger>
        <AffinePageReference className={styles.docRefLink} pageId={row.docId} />
      </div>
      <Collapsible.Content className={styles.content}>
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
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

export const DocDatabaseBacklinkInfo = () => {
  const doc = useService(DocService).doc;
  const docDatabaseBacklinks = useService(DocDatabaseBacklinksService);
  const rows = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docDatabaseBacklinks.watchDbBacklinkRows$(doc.id),
          []
        ).map(rows => {
          return rows.toSorted((a, b) => {
            return a.databaseName.localeCompare(b.databaseName);
          });
        }),
      [docDatabaseBacklinks, doc.id]
    )
  );
  if (!rows.length) {
    return null;
  }
  return (
    <div className={styles.root}>
      {rows.map(row => (
        <Fragment key={row.id}>
          <DatabaseBacklinkRow row={row} />
          <Divider size="thinner" className={styles.divider} />
        </Fragment>
      ))}
    </div>
  );
};
