import { PropertyName } from '@affine/component';
import { AffinePageReference } from '@affine/core/components/affine/reference-link';
import { useI18n } from '@affine/i18n';
import {
  DocService,
  LiveData,
  useLiveData,
  useService,
} from '@toeverything/infra';
import { useMemo } from 'react';

import { DocDatabaseBacklinksService } from '../../services/doc-database-backlinks';
import { DatabaseRendererTypes } from './cells/constant';

export const DocDatabaseBacklinkInfo = () => {
  const doc = useService(DocService).doc;
  const docDatabaseBacklinks = useService(DocDatabaseBacklinksService);
  const rows = useLiveData(
    useMemo(
      () =>
        LiveData.from(docDatabaseBacklinks.watchDbBacklinkRows$(doc.id), []),
      [docDatabaseBacklinks, doc.id]
    )
  );
  const t = useI18n();
  return (
    <div>
      <div>Database Backlinks</div>
      {rows.map(row => (
        <ul key={row.id}>
          {row.databaseName}
          <AffinePageReference pageId={row.docId} />
          {row.cells
            .filter(cell => cell.property.type !== 'title')
            .map(cell => {
              const config = DatabaseRendererTypes[cell.property.type];
              return (
                <li
                  key={cell.property.name}
                  style={{ display: 'flex', gap: 4 }}
                >
                  <PropertyName
                    icon={<config.Icon />}
                    name={
                      cell.property.name ??
                      (config.name ? t.t(config.name) : t['unnamed']())
                    }
                  />
                  {config ? (
                    <config.Renderer
                      cell={cell}
                      dataSource={row.dataSource}
                      rowId={row.id}
                    />
                  ) : (
                    JSON.stringify(cell.value)
                  )}
                </li>
              );
            })}
        </ul>
      ))}
    </div>
  );
};
