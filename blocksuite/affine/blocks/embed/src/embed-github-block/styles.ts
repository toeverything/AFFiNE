import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { css, html } from 'lit';

export const styles = css`
  .affine-embed-github-block {
    container: affine-embed-github-block / inline-size;
    box-sizing: border-box;
    display: flex;
    width: 100%;
    height: 100%;

    border-radius: 8px;
    border: 1px solid ${unsafeCSSVarV2('layer/background/tertiary')};

    background: ${unsafeCSSVarV2('layer/background/primary')};
    user-select: none;
    overflow: hidden;
  }

  .affine-embed-github-content {
    display: flex;
    flex-grow: 1;
    flex-direction: column;
    align-self: stretch;
    gap: 4px;
    padding: 12px;
    overflow: hidden;
  }

  .affine-embed-github-content-title {
    display: flex;
    min-height: 22px;
    flex-direction: row;
    gap: 8px;
    align-items: center;

    align-self: stretch;
  }

  .affine-embed-github-content-title-icons {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
  }

  .affine-embed-github-content-title-icons img,
  .affine-embed-github-content-title-icons object,
  .affine-embed-github-content-title-icons svg {
    width: 16px;
    height: 16px;
    color: var(--affine-pure-white);
  }

  .affine-embed-github-content-title-site-icon {
    display: flex;
    width: 16px;
    height: 16px;
    justify-content: center;
    align-items: center;

    .github-icon {
      fill: var(--affine-black);
      color: var(--affine-black);
    }
  }

  .affine-embed-github-content-title-status-icon {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    border-radius: 20px;

    color: var(--affine-pure-white);
    leading-trim: both;

    text-edge: cap;
    font-feature-settings:
      'clig' off,
      'liga' off;
    text-transform: capitalize;
    font-family: var(--affine-font-family);
    font-size: 12px;
    font-style: normal;
    font-weight: 500;
    line-height: 16px;
  }
  .affine-embed-github-content-title-status-icon.issue.open {
    background: #238636;
  }
  .affine-embed-github-content-title-status-icon.issue.closed.success {
    background: #8957e5;
  }
  .affine-embed-github-content-title-status-icon.issue.closed.failure {
    background: #6e7681;
  }
  .affine-embed-github-content-title-status-icon.pr.open {
    background: #238636;
  }
  .affine-embed-github-content-title-status-icon.pr.draft {
    background: #6e7681;
  }
  .affine-embed-github-content-title-status-icon.pr.merged {
    background: #8957e5;
  }
  .affine-embed-github-content-title-status-icon.pr.closed {
    background: #c03737;
  }

  .affine-embed-github-content-title-status-icon > svg {
    height: 16px;
    width: 16px;
    padding: 2px;
  }

  .affine-embed-github-content-title-status-icon > span {
    padding: 0px 1.5px;
  }

  .affine-embed-github-content-title-text {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;

    word-break: break-word;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--affine-text-primary-color);

    font-family: var(--affine-font-family);
    font-size: var(--affine-font-sm);
    font-style: normal;
    font-weight: 600;
    line-height: 22px;
  }

  .affine-embed-github-content-description {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;

    flex-grow: 1;

    word-break: break-word;
    white-space: normal;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--affine-text-primary-color);

    font-family: var(--affine-font-family);
    font-size: var(--affine-font-xs);
    font-style: normal;
    font-weight: 400;
    line-height: 20px;
  }

  .affine-embed-github-content-assignees {
    display: none;
  }

  .affine-embed-github-content-url {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    width: max-content;
    max-width: 100%;
    cursor: pointer;
  }
  .affine-embed-github-content-url > span {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;

    word-break: break-all;
    white-space: normal;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--affine-text-secondary-color);

    font-family: var(--affine-font-family);
    font-size: var(--affine-font-xs);
    font-style: normal;
    font-weight: 400;
    line-height: 20px;
  }
  .affine-embed-github-content-url:hover > span {
    color: var(--affine-link-color);
  }
  .affine-embed-github-content-url:hover .open-icon {
    fill: var(--affine-link-color);
  }

  .affine-embed-github-content-url-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
  }
  .affine-embed-github-content-url-icon .open-icon {
    height: 12px;
    width: 12px;
    fill: var(--affine-text-secondary-color);
  }

  .affine-embed-github-banner {
    margin: 12px 0px 0px 12px;
    width: 204px;
    height: 102px;
  }

  .affine-embed-github-banner img,
  .affine-embed-github-banner object,
  .affine-embed-github-banner svg {
    width: 204px;
    height: 102px;
    object-fit: cover;
    border-radius: 4px;
  }

  .affine-embed-github-block.loading {
    .affine-embed-github-content-title-text {
      color: var(--affine-placeholder-color);
    }
  }

  .affine-embed-github-block.selected {
    .affine-embed-github-content-url > span {
      color: var(--affine-link-color);
    }
    .affine-embed-github-content-url .open-icon {
      fill: var(--affine-link-color);
    }
  }

  .affine-embed-github-block.list {
    .affine-embed-github-content {
      width: 100%;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }

    .affine-embed-github-content-title {
      width: 660px;
    }

    .affine-embed-github-content-repo {
      display: none;
    }

    .affine-embed-github-content-date {
      display: none;
    }

    .affine-embed-github-content-url {
      width: 90px;
      justify-content: flex-end;
    }

    .affine-embed-github-content-description {
      display: none;
    }

    .affine-embed-github-banner {
      display: none;
    }
  }

  .affine-embed-github-block.vertical {
    flex-direction: column-reverse;

    .affine-embed-github-content {
      width: 100%;
    }

    .affine-embed-github-content-description {
      -webkit-line-clamp: 6;
    }

    .affine-embed-github-content-assignees {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 2px;
      align-self: stretch;
    }

    .affine-embed-github-content-assignees-text {
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;

      font-family: var(--affine-font-family);
      font-size: var(--affine-font-xs);
      font-style: normal;
      font-weight: 600;
      line-height: 20px;
    }

    .affine-embed-github-content-assignees-text.label {
      width: 72px;
      color: var(--affine-text-primary-color);
      font-weight: 600;
    }

    .affine-embed-github-content-assignees-text.users {
      width: calc(100% - 72px);
      word-break: break-all;
      white-space: normal;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 400;
    }

    .affine-embed-github-content-assignees-text-users.user {
      color: var(--affine-link-color);
      cursor: pointer;
    }

    .affine-embed-github-content-assignees-text-users.placeholder {
      color: var(--affine-placeholder-color);
    }

    .affine-embed-github-banner {
      width: 340px;
      height: 170px;
      margin-left: 12px;
    }

    .affine-embed-github-banner img,
    .affine-embed-github-banner object,
    .affine-embed-github-banner svg {
      width: 340px;
      height: 170px;
    }
  }

  .affine-embed-github-block.cube {
    .affine-embed-github-content {
      width: 100%;
      flex-direction: column;
      align-items: flex-start;
      justify-content: space-between;
    }

    .affine-embed-github-content-title {
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
    }

    .affine-embed-github-content-title-text {
      -webkit-line-clamp: 2;
    }

    .affine-embed-github-content-description {
      display: none;
    }

    .affine-embed-github-banner {
      display: none;
    }

    .affine-embed-github-content-repo {
      display: none;
    }

    .affine-embed-github-content-date {
      display: none;
    }
  }

  @container affine-embed-github-block (width < 375px) {
    .affine-embed-github-content {
      width: 100%;
    }

    .affine-embed-github-block:not(.edgeless) .affine-embed-github-banner {
      display: none;
    }
  }
`;

export const GithubIcon = html`<svg
  class="github-icon"
  width="20"
  height="20"
  viewBox="0 0 16 16"
  fill="currentColor"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M8.00016 1.33334C4.31683 1.33334 1.3335 4.39214 1.3335 8.16864C1.3335 11.1933 3.24183 13.7479 5.89183 14.6536C6.22516 14.7134 6.35016 14.5084 6.35016 14.3289C6.35016 14.1666 6.34183 13.6283 6.34183 13.0559C4.66683 13.372 4.2335 12.6372 4.10016 12.2527C4.02516 12.0562 3.70016 11.4496 3.41683 11.2872C3.1835 11.1591 2.85016 10.8429 3.4085 10.8344C3.9335 10.8259 4.3085 11.33 4.4335 11.535C5.0335 12.5689 5.99183 12.2784 6.37516 12.0989C6.4335 11.6546 6.6085 11.3556 6.80016 11.1847C5.31683 11.0138 3.76683 10.4243 3.76683 7.80978C3.76683 7.06644 4.02516 6.45127 4.45016 5.9728C4.3835 5.80192 4.15016 5.1013 4.51683 4.16145C4.51683 4.16145 5.07516 3.98202 6.35016 4.86206C6.8835 4.70827 7.45016 4.63137 8.01683 4.63137C8.5835 4.63137 9.15016 4.70827 9.6835 4.86206C10.9585 3.97348 11.5168 4.16145 11.5168 4.16145C11.8835 5.1013 11.6502 5.80192 11.5835 5.9728C12.0085 6.45127 12.2668 7.0579 12.2668 7.80978C12.2668 10.4328 10.7085 11.0138 9.22516 11.1847C9.46683 11.3983 9.67516 11.8084 9.67516 12.4492C9.67516 13.3635 9.66683 14.0983 9.66683 14.3289C9.66683 14.5084 9.79183 14.722 10.1252 14.6536C11.4486 14.1955 12.5986 13.3234 13.4133 12.1601C14.228 10.9968 14.6664 9.60079 14.6668 8.16864C14.6668 4.39214 11.6835 1.33334 8.00016 1.33334Z"
  />
</svg> `;

export const GithubIssueOpenIcon = html`<svg
  width="16"
  height="16"
  viewBox="0 0 16 16"
  fill="currentColor"
  xmlns="http://www.w3.org/2000/svg"
>
  <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"></path>
  <path
    d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"
  ></path>
</svg>`;

export const GithubIssueClosedSuccessIcon = html`<svg
  aria-hidden="true"
  height="16"
  viewBox="0 0 16 16"
  version="1.1"
  width="16"
  data-view-component="true"
  class="octicon octicon-issue-closed flex-items-center mr-1"
  fill="currentColor"
>
  <path
    d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"
  ></path>
  <path
    d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z"
  ></path>
</svg>`;

export const GithubIssueClosedFailureIcon = html`<svg
  aria-hidden="true"
  height="16"
  viewBox="0 0 16 16"
  version="1.1"
  width="16"
  data-view-component="true"
  class="octicon octicon-skip flex-items-center mr-1"
  fill="currentColor"
>
  <path
    d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm9.78-2.22-5.5 5.5a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l5.5-5.5a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"
  ></path>
</svg>`;

export const GithubPROpenIcon = html`<svg
  height="16"
  class="octicon octicon-git-pull-request"
  viewBox="0 0 16 16"
  version="1.1"
  width="16"
  aria-hidden="true"
  fill="currentColor"
>
  <path
    d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"
  ></path>
</svg>`;

export const GithubPRDraftIcon = html`<svg
  height="16"
  class="octicon octicon-git-pull-request-draft"
  viewBox="0 0 16 16"
  version="1.1"
  width="16"
  aria-hidden="true"
  fill="currentColor"
>
  <path
    d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM14 7.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0-4.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z"
  ></path>
</svg>`;

export const GithubPRMergedIcon = html`<svg
  height="16"
  class="octicon octicon-git-merge"
  viewBox="0 0 16 16"
  version="1.1"
  width="16"
  aria-hidden="true"
  fill="currentColor"
>
  <path
    d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"
  ></path>
</svg>`;

export const GithubPRClosedIcon = html`<svg
  height="16"
  class="octicon octicon-git-pull-request-closed"
  viewBox="0 0 16 16"
  version="1.1"
  width="16"
  aria-hidden="true"
  fill="currentColor"
>
  <path
    d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.97.97.97.97a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"
  ></path>
</svg>`;
