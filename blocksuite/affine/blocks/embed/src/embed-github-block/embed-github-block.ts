import { LoadingIcon, OpenIcon } from '@blocksuite/affine-components/icons';
import type {
  EmbedGithubModel,
  EmbedGithubStyles,
} from '@blocksuite/affine-model';
import { ImageProxyService } from '@blocksuite/affine-shared/adapters';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { BlockSelection, isGfxBlockComponent } from '@blocksuite/std';
import { html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { EmbedBlockComponent } from '../common/embed-block-element.js';
import { getEmbedCardIcons } from '../common/utils.js';
import { githubUrlRegex } from './embed-github-model.js';
import type { EmbedGithubBlockService } from './embed-github-service.js';
import { GithubIcon, styles } from './styles.js';
import {
  getGithubStatusIcon,
  refreshEmbedGithubStatus,
  refreshEmbedGithubUrlData,
} from './utils.js';

export class EmbedGithubBlockComponent extends EmbedBlockComponent<
  EmbedGithubModel,
  EmbedGithubBlockService
> {
  static override styles = styles;

  override _cardStyle: (typeof EmbedGithubStyles)[number] = 'horizontal';

  open = () => {
    let link = this.model.props.url;
    if (!link.match(/^[a-zA-Z]+:\/\//)) {
      link = 'https://' + link;
    }
    window.open(link, '_blank');
  };

  refreshData = () => {
    refreshEmbedGithubUrlData(this, this.fetchAbortController.signal).catch(
      console.error
    );
  };

  refreshStatus = () => {
    refreshEmbedGithubStatus(this, this.fetchAbortController.signal).catch(
      console.error
    );
  };

  private _handleAssigneeClick(assignee: string) {
    const link = `https://www.github.com/${assignee}`;
    window.open(link, '_blank');
  }

  private _handleDoubleClick(event: MouseEvent) {
    event.stopPropagation();
    this.open();
  }

  private _selectBlock() {
    const selectionManager = this.host.selection;
    const blockSelection = selectionManager.create(BlockSelection, {
      blockId: this.blockId,
    });
    selectionManager.setGroup('note', [blockSelection]);
  }

  protected _handleClick(event: MouseEvent) {
    event.stopPropagation();
    this._selectBlock();
  }

  override connectedCallback() {
    super.connectedCallback();
    this._cardStyle = this.model.props.style;

    if (
      !this.model.props.owner ||
      !this.model.props.repo ||
      !this.model.props.githubId
    ) {
      this.store.withoutTransact(() => {
        const url = this.model.props.url;
        const urlMatch = url.match(githubUrlRegex);
        if (urlMatch) {
          const [, owner, repo, githubType, githubId] = urlMatch;
          this.store.updateBlock(this.model, {
            owner,
            repo,
            githubType: githubType === 'issue' ? 'issue' : 'pr',
            githubId,
          });
        }
      });
    }

    this.store.withoutTransact(() => {
      if (!this.model.props.description && !this.model.props.title) {
        this.refreshData();
      } else {
        this.refreshStatus();
      }
    });

    this.disposables.add(
      this.model.propsUpdated.subscribe(({ key }) => {
        if (key === 'url') {
          this.refreshData();
        }
      })
    );
  }

  override renderBlock() {
    const {
      title = 'GitHub',
      githubType,
      status,
      statusReason,
      owner,
      repo,
      createdAt,
      assignees,
      description,
      image,
      style,
    } = this.model.props;

    const loading = this.loading;
    const theme = this.std.get(ThemeProvider).theme;
    const imageProxyService = this.store.get(ImageProxyService);
    const { EmbedCardBannerIcon } = getEmbedCardIcons(theme);
    const titleIcon = loading ? LoadingIcon() : GithubIcon;
    const statusIcon = status
      ? getGithubStatusIcon(githubType, status, statusReason)
      : nothing;
    const statusText = loading ? '' : status;
    const titleText = loading ? 'Loading...' : title;
    const descriptionText = loading ? '' : description;
    const bannerImage =
      !loading && image
        ? html`<img src=${imageProxyService.buildUrl(image)} alt="banner" />`
        : EmbedCardBannerIcon;

    let dateText = '';
    if (createdAt) {
      const date = new Date(createdAt);
      dateText = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const day = date.getDate();
      const suffix =
        ['th', 'st', 'nd', 'rd'][((day / 10) | 0) !== 1 ? day % 10 : 4] || 'th';
      dateText = dateText.replace(/\d+/, `${day}${suffix}`);
    }

    return this.renderEmbed(
      () => html`
        <div
          class=${classMap({
            'affine-embed-github-block': true,
            loading,
            [style]: true,
            edgeless: isGfxBlockComponent(this),
            selected: this.selected$.value,
          })}
          style=${styleMap({
            // transform: `scale(${this._scale})`,
            transformOrigin: '0 0 ',
          })}
          @click=${this._handleClick}
          @dblclick=${this._handleDoubleClick}
        >
          <div class="affine-embed-github-content">
            <div class="affine-embed-github-content-title">
              <div class="affine-embed-github-content-title-icons">
                <div class="affine-embed-github-content-title-site-icon">
                  ${titleIcon}
                </div>

                ${status && statusText
                  ? html`<div
                      class=${classMap({
                        'affine-embed-github-content-title-status-icon': true,
                        [githubType]: true,
                        [status]: true,
                        success: statusReason === 'completed',
                        failure: statusReason === 'not_planned',
                      })}
                    >
                      ${statusIcon}

                      <span>${statusText}</span>
                    </div>`
                  : nothing}
              </div>

              <div class="affine-embed-github-content-title-text">
                ${titleText}
              </div>
            </div>

            <div class="affine-embed-github-content-description">
              ${descriptionText}
            </div>

            ${githubType === 'issue' && assignees
              ? html`
                  <div class="affine-embed-github-content-assignees">
                    <div
                      class="affine-embed-github-content-assignees-text label"
                    >
                      Assignees
                    </div>

                    <div
                      class="affine-embed-github-content-assignees-text users"
                    >
                      ${assignees.length === 0
                        ? html`<span
                            class="affine-embed-github-content-assignees-text-users placeholder"
                            >No one</span
                          >`
                        : repeat(
                            assignees,
                            assignee => assignee,
                            (assignee, index) =>
                              html`<span
                                  class="affine-embed-github-content-assignees-text-users user"
                                  @click=${() =>
                                    this._handleAssigneeClick(assignee)}
                                  >${`@${assignee}`}</span
                                >
                                ${index === assignees.length - 1 ? '' : `, `}`
                          )}
                    </div>
                  </div>
                `
              : nothing}

            <div class="affine-embed-github-content-url" @click=${this.open}>
              <span class="affine-embed-github-content-repo"
                >${`${owner}/${repo} |`}</span
              >

              ${createdAt
                ? html`<span class="affine-embed-github-content-date"
                    >${dateText} |</span
                  >`
                : nothing}
              <span>github.com</span>

              <div class="affine-embed-github-content-url-icon">
                ${OpenIcon}
              </div>
            </div>
          </div>
          <div class="affine-embed-github-banner">${bannerImage}</div>
        </div>
      `
    );
  }

  @property({ attribute: false })
  accessor loading = false;
}
