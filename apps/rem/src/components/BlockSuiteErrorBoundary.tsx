import { NextRouter } from 'next/router';
import React, { Component, ErrorInfo } from 'react';

import { BlockSuiteWorkspace } from '../shared';

export type BlockSuiteErrorBoundaryProps = React.PropsWithChildren<{
  router: NextRouter;
}>;

export class PageNotFoundError extends TypeError {
  readonly workspace: BlockSuiteWorkspace;
  readonly pageId: string;

  constructor(workspace: BlockSuiteWorkspace, pageId: string) {
    super();
    this.workspace = workspace;
    this.pageId = pageId;
  }
}

type BlockSuiteError = PageNotFoundError | Error;

interface BlockSuiteErrorBoundaryState {
  error: BlockSuiteError | null;
}

export class BlockSuiteErrorBoundary extends Component<
  BlockSuiteErrorBoundaryProps,
  BlockSuiteErrorBoundaryState
> {
  public state: BlockSuiteErrorBoundaryState = {
    error: null,
  };

  public static getDerivedStateFromError(
    error: BlockSuiteError
  ): BlockSuiteErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: BlockSuiteError, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.error) {
      const error = this.state.error;
      if (error instanceof PageNotFoundError) {
        return (
          <>
            <h1>Sorry.. there was an error</h1>
            <>
              <span> Page error </span>
              <span>
                Cannot find page {error.pageId} in workspace{' '}
                {error.workspace.meta.name}
              </span>
              <button
                onClick={() => {
                  this.props.router
                    .replace({
                      pathname: '/workspace/[workspaceId]/[pageId]',
                      query: {
                        workspaceId: error.workspace.room,
                        pageId: error.workspace.meta.pageMetas[0].id,
                      },
                    })
                    .then(() => {
                      this.setState({ error: null });
                    });
                }}
              >
                {' '}
                refresh{' '}
              </button>
            </>
          </>
        );
      }
      return (
        <>
          <h1>Sorry.. there was an error</h1>
        </>
      );
    }

    return this.props.children;
  }
}
