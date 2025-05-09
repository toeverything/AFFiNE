import type { AttachmentBlockModel } from '@blocksuite/affine/model';
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

  get(model: AttachmentBlockModel) {
    let rc = this.PDFs.get(model.id);

    if (!rc) {
      rc = this.PDFs.put(model.id, this.framework.createEntity(PDF, model));
    }

    return { pdf: rc.obj, release: rc.release };
  }
}
