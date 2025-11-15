import { Entity, LiveData, ObjectPool } from '@toeverything/infra';
import { catchError, from, map, of, startWith, switchMap } from 'rxjs';

import type { WorkspaceService } from '../../workspace';
import type { PDFMeta } from '../renderer';
import { PDFRenderer } from '../renderer';
import { PDFPage } from './pdf-page';

export enum PDFStatus {
  IDLE = 0,
  Opening,
  Opened,
  Error,
}

export type PDFRendererState =
  | {
      status: PDFStatus.IDLE | PDFStatus.Opening;
    }
  | {
      status: PDFStatus.Opened;
      meta: PDFMeta;
    }
  | {
      status: PDFStatus.Error;
      error: Error;
    };

export class PDF extends Entity<{ blobId: string }> {
  public readonly id: string = this.props.blobId;
  readonly renderer = new PDFRenderer();
  readonly pages = new ObjectPool<string, PDFPage>({
    onDelete: page => page.dispose(),
  });

  readonly state$ = LiveData.from<PDFRendererState>(
    // @ts-expect-error type alias
    from(
      this.workspaceService.workspace.engine.blob
        .get(this.id)
        .then(blobRecord => {
          if (blobRecord) {
            const { data, mime: type } = blobRecord;
            const blob = new Blob([data], { type });
            return blob.arrayBuffer();
          }

          return null;
        })
    ).pipe(
      switchMap(data => {
        if (data) {
          return this.renderer.ob$('open', { data });
        }

        throw new Error('PDF not found');
      }),
      map(meta => ({ status: PDFStatus.Opened, meta })),
      // @ts-expect-error type alias
      startWith({ status: PDFStatus.Opening }),
      catchError((error: Error) => of({ status: PDFStatus.Error, error }))
    ),
    { status: PDFStatus.IDLE }
  );

  constructor(private readonly workspaceService: WorkspaceService) {
    super();
    this.disposables.push(() => this.pages.clear());
  }

  page(pageNum: number, size: string) {
    const key = `${pageNum}:${size}`;
    let rc = this.pages.get(key);

    if (!rc) {
      rc = this.pages.put(
        key,
        this.framework.createEntity(PDFPage, { pdf: this, pageNum })
      );
    }

    return { page: rc.obj, release: rc.release };
  }

  override dispose() {
    this.renderer.destroy();
    super.dispose();
  }
}
