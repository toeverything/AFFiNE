import { Entity, LiveData } from '@toeverything/infra';

export class DocInfoModal extends Entity {
  public readonly docId$ = new LiveData<string | null>(null);
  public readonly open$ = LiveData.computed(get => !!get(this.docId$));

  public open(docId?: string) {
    if (docId) {
      this.docId$.next(docId);
    } else {
      this.docId$.next(null);
    }
  }

  public close() {
    this.docId$.next(null);
  }

  public onOpenChange(open: boolean) {
    if (!open) this.docId$.next(null);
  }
}
