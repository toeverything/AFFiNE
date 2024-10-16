import { AffinePageReference } from '@affine/core/components/affine/reference-link';
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
  const docService = useService(DocService).doc;
  const docDatabaseBacklinks = useService(DocDatabaseBacklinksService);
  const rows = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docDatabaseBacklinks.watchDbBacklinkRows$(docService.id),
          []
        ),
      [docDatabaseBacklinks, docService.id]
    )
  );
  console.log(rows);
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
              const DatabaseRendererConfig =
                DatabaseRendererTypes[cell.property.type];
              return (
                <li
                  key={cell.property.name}
                  style={{ display: 'flex', gap: 4 }}
                >
                  {cell.property.name}({cell.property.type}):
                  {DatabaseRendererConfig ? (
                    <DatabaseRendererConfig.Renderer
                      cell={cell}
                      doc={docService}
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
