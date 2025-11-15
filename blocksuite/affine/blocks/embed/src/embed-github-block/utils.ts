import type {
  EmbedGithubBlockUrlData,
  EmbedGithubModel,
} from '@blocksuite/affine-model';
import type { LinkPreviewProvider } from '@blocksuite/affine-shared/services';
import { isAbortError } from '@blocksuite/affine-shared/utils';
import { nothing } from 'lit';

import type { EmbedGithubBlockComponent } from './embed-github-block.js';
import {
  GithubIssueClosedFailureIcon,
  GithubIssueClosedSuccessIcon,
  GithubIssueOpenIcon,
  GithubPRClosedIcon,
  GithubPRDraftIcon,
  GithubPRMergedIcon,
  GithubPROpenIcon,
} from './styles.js';

export async function queryEmbedGithubData(
  embedGithubModel: EmbedGithubModel,
  linkPreviewer: LinkPreviewProvider,
  signal?: AbortSignal
): Promise<Partial<EmbedGithubBlockUrlData>> {
  const [githubApiData, openGraphData] = await Promise.all([
    queryEmbedGithubApiData(embedGithubModel, signal),
    linkPreviewer.query(embedGithubModel.props.url, signal),
  ]);
  return { ...githubApiData, ...openGraphData };
}

export async function queryEmbedGithubApiData(
  embedGithubModel: EmbedGithubModel,
  signal?: AbortSignal
): Promise<Partial<EmbedGithubBlockUrlData>> {
  const { owner, repo, githubType, githubId } = embedGithubModel.props;
  let githubApiData: Partial<EmbedGithubBlockUrlData> = {};

  // github's public api has a rate limit of 60 requests per hour
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/${
    githubType === 'issue' ? 'issues' : 'pulls'
  }/${githubId}`;

  const githubApiResponse = await fetch(apiUrl, {
    cache: 'no-cache',
    signal,
  }).catch(() => null);

  if (githubApiResponse && githubApiResponse.ok) {
    const githubApiJson = await githubApiResponse.json();
    const { state, state_reason, draft, merged, created_at, assignees } =
      githubApiJson;

    const assigneeLogins = assignees.map(
      (assignee: { login: string }) => assignee.login
    );

    let status = state;
    if (merged) {
      status = 'merged';
    } else if (state === 'open' && draft) {
      status = 'draft';
    }

    githubApiData = {
      status,
      statusReason: state_reason,
      createdAt: created_at,
      assignees: assigneeLogins,
    };
  }

  return githubApiData;
}

export async function refreshEmbedGithubUrlData(
  embedGithubElement: EmbedGithubBlockComponent,
  signal?: AbortSignal
): Promise<void> {
  let image = null,
    status = null,
    statusReason = null,
    title = null,
    description = null,
    createdAt = null,
    assignees = null;

  try {
    embedGithubElement.loading = true;

    // TODO(@mirone): remove service
    const queryUrlData = embedGithubElement.service?.queryUrlData;
    if (!queryUrlData) {
      console.error(
        `Trying to refresh github url data, but the queryUrlData is not found.`
      );
      return;
    }

    const githubUrlData = await queryUrlData(embedGithubElement.model);
    ({
      image = null,
      status = null,
      statusReason = null,
      title = null,
      description = null,
      createdAt = null,
      assignees = null,
    } = githubUrlData);

    if (signal?.aborted) return;

    embedGithubElement.store.updateBlock(embedGithubElement.model, {
      image,
      status,
      statusReason,
      title,
      description,
      createdAt,
      assignees,
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return;
    throw Error;
  } finally {
    embedGithubElement.loading = false;
  }
}

export async function refreshEmbedGithubStatus(
  embedGithubElement: EmbedGithubBlockComponent,
  signal?: AbortSignal
) {
  // TODO(@mirone): remove service
  const queryApiData = embedGithubElement.service?.queryApiData;
  if (!queryApiData) {
    console.error(
      `Trying to refresh github status, but the queryApiData is not found.`
    );
    return;
  }

  const githubApiData = await queryApiData(embedGithubElement.model, signal);

  if (!githubApiData.status || signal?.aborted) return;

  embedGithubElement.store.updateBlock(embedGithubElement.model, {
    status: githubApiData.status,
    statusReason: githubApiData.statusReason,
    createdAt: githubApiData.createdAt,
    assignees: githubApiData.assignees,
  });
}

export function getGithubStatusIcon(
  type: 'issue' | 'pr',
  status: string,
  statusReason: string | null
) {
  if (type === 'issue') {
    if (status === 'open') {
      return GithubIssueOpenIcon;
    } else if (status === 'closed' && statusReason === 'completed') {
      return GithubIssueClosedSuccessIcon;
    } else if (status === 'closed' && statusReason === 'not_planned') {
      return GithubIssueClosedFailureIcon;
    } else {
      return nothing;
    }
  } else if (type === 'pr') {
    if (status === 'open') {
      return GithubPROpenIcon;
    } else if (status === 'draft') {
      return GithubPRDraftIcon;
    } else if (status === 'merged') {
      return GithubPRMergedIcon;
    } else if (status === 'closed') {
      return GithubPRClosedIcon;
    }
  }
  return nothing;
}
