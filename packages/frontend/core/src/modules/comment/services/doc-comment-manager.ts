import { ObjectPool, Service } from '@toeverything/infra';

import { DocCommentEntity } from '../entities/doc-comment';

type DocId = string;

export class DocCommentManagerService extends Service {
  constructor() {
    super();
  }

  private readonly pool = new ObjectPool<DocId, DocCommentEntity>({
    onDelete: entity => {
      entity.dispose();
    },
  });

  get(docId: DocId) {
    let commentRef = this.pool.get(docId);
    if (!commentRef) {
      const comment = this.framework.createEntity(DocCommentEntity, {
        docId,
      });
      commentRef = this.pool.put(docId, comment);
      // todo: add LRU cache for the pool?
    }
    return commentRef;
  }
}
