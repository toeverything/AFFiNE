import { Entity, LiveData } from '@toeverything/infra';

export class ImportTemplateDialog extends Entity {
  readonly isOpen$ = new LiveData(false);
  readonly template$ = new LiveData<{
    workspaceId: string;
    docId: string;
    templateName: string;
  } | null>(null);

  open(workspaceId: string, docId: string, templateName: string) {
    this.template$.next({ workspaceId, docId, templateName });
    this.isOpen$.next(true);
  }

  close() {
    this.isOpen$.next(false);
  }
}
