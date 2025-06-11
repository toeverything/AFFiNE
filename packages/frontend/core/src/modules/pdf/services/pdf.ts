import { ObjectPool, Service } from '@toeverything/infra';

import { PDF } from '../entities/pdf';

// One PDF document one worker.

export class PDFService extends Service {
  PDFs = new ObjectPool<string, PDF>({
    onDelete: pdf => {
      pdf.dispose();
    },
  });

  constructor() {
    super();
    this.disposables.push(() => {
      this.PDFs.clear();
    });
  }

  get(blobId: string) {
    let rc = this.PDFs.get(blobId);

    if (!rc) {
      rc = this.PDFs.put(blobId, this.framework.createEntity(PDF, { blobId }));
    }

    return { pdf: rc.obj, release: rc.release };
  }
}
