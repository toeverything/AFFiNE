import {
  type CommentId,
  CommentProviderIdentifier,
} from '@blocksuite/affine-shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { WithDisposable } from '@blocksuite/global/lit';
import {
  type BlockStdScope,
  PropTypes,
  requiredProperties,
  ShadowlessElement,
  stdContext,
} from '@blocksuite/std';
import { consume } from '@lit/context';
import { css, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { html } from 'lit-html';
import { isEqual } from 'lodash-es';

@requiredProperties({
  commentIds: PropTypes.arrayOf(id => typeof id === 'string'),
})
export class InlineComment extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    inline-comment {
      display: inline;
    }

    inline-comment.unresolved {
      background-color: ${unsafeCSSVarV2('block/comment/highlightDefault')};
      border-bottom: 2px solid
        ${unsafeCSSVarV2('block/comment/highlightUnderline')};
    }

    inline-comment.highlighted {
      background-color: ${unsafeCSSVarV2('block/comment/highlightActive')};
    }
  `;

  @property({
    attribute: false,
    hasChanged: (newVal: string[], oldVal: string[]) =>
      !isEqual(newVal, oldVal),
  })
  accessor commentIds!: string[];

  @property({ attribute: false })
  accessor unresolved = false;

  private _index: number = 0;

  @consume({ context: stdContext })
  private accessor _std!: BlockStdScope;

  @state()
  accessor highlighted = false;

  private get _provider() {
    return this._std.getOptional(CommentProviderIdentifier);
  }

  private readonly _handleClick = () => {
    if (this.unresolved) {
      this._provider?.highlightComment(this.commentIds[this._index]);
      this._index = (this._index + 1) % this.commentIds.length;
    }
  };

  private readonly _handleHighlight = (id: CommentId | null) => {
    if (this.highlighted) {
      if (!id || !this.commentIds.includes(id)) {
        this.highlighted = false;
      }
    } else {
      if (id && this.commentIds.includes(id)) {
        this.highlighted = true;
      }
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    const provider = this._provider;
    if (provider) {
      this.disposables.addFromEvent(this, 'click', this._handleClick);
      this.disposables.add(
        provider.onCommentHighlighted(this._handleHighlight)
      );
    }
  }

  override willUpdate(_changedProperties: PropertyValues<this>) {
    if (_changedProperties.has('highlighted')) {
      if (this.highlighted) {
        this.classList.add('highlighted');
      } else {
        this.classList.remove('highlighted');
      }
    }
    if (_changedProperties.has('unresolved')) {
      if (this.unresolved) {
        this.classList.add('unresolved');
      } else {
        this.classList.remove('unresolved');
      }
    }
  }

  override render() {
    return html`<slot></slot>`;
  }
}
