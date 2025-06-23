import { DisposableGroup } from '@blocksuite/global/disposable';
import { LifeCycleWatcher } from '@blocksuite/std';

import { CommentProviderIdentifier } from './comment-provider';

export abstract class CommentService extends LifeCycleWatcher {
  static override key = 'comment-service';

  private readonly _disposables = new DisposableGroup();

  private get _provider() {
    return this.std.getOptional(CommentProviderIdentifier);
  }

  override mounted() {
    const provider = this._provider;
    if (!provider) return;

    this._disposables.add(
      provider.onCommentAdded(() => {
        // TODO(@L-Sun): Implement comment added
      })
    );

    this._disposables.add(
      provider.onCommentResolved(_ => {
        // TODO(@L-Sun): Implement comment resolved
      })
    );

    this._disposables.add(
      provider.onCommentDeleted(_ => {
        // TODO(@L-Sun): Implement comment deleted
      })
    );

    this._disposables.add(
      provider.onCommentHighlighted(_ => {
        // TODO(@L-Sun): Implement comment highlighted
      })
    );
  }

  override unmounted() {
    this._disposables.dispose();
  }
}
