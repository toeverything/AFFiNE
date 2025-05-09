import {
  BlockModel,
  type DraftModel,
  type Store,
  toDraftModel,
} from '../model/index';

type SliceData = {
  content: DraftModel[];
  workspaceId: string;
  pageId: string;
};

export class Slice {
  get content() {
    return this.data.content;
  }

  get docId() {
    return this.data.pageId;
  }

  get workspaceId() {
    return this.data.workspaceId;
  }

  constructor(readonly data: SliceData) {}

  static fromModels(doc: Store, models: DraftModel[] | BlockModel[]) {
    const draftModels = models.map(model => {
      if (model instanceof BlockModel) {
        return toDraftModel(model);
      }
      return model;
    });
    return new Slice({
      content: draftModels,
      workspaceId: doc.workspace.id,
      pageId: doc.id,
    });
  }
}
