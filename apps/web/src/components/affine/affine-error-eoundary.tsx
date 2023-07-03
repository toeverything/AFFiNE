import type {
  QueryParamError,
  Unreachable,
  WorkspaceNotFoundError,
} from '@affine/env/constant';
import { PageNotFoundError } from '@affine/env/constant';
import type { NextRouter } from 'next/router';
import type { ErrorInfo, ReactNode } from 'react';
import type React from 'react';
import { Component } from 'react';

export type AffineErrorBoundaryProps = React.PropsWithChildren<{
  router: NextRouter;
}>;

type AffineError =
  | QueryParamError
  | Unreachable
  | WorkspaceNotFoundError
  | PageNotFoundError
  | Error;

interface AffineErrorBoundaryState {
  error: AffineError | null;
}

export class AffineErrorBoundary extends Component<
  AffineErrorBoundaryProps,
  AffineErrorBoundaryState
> {
  public override state: AffineErrorBoundaryState = {
    error: null,
  };

  public static getDerivedStateFromError(
    error: AffineError
  ): AffineErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: AffineError, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public override render(): ReactNode {
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
                {error.workspace.id}
              </span>
              <button
                onClick={() => {
                  this.props.router
                    .replace({
                      pathname: '/workspace/[workspaceId]/[pageId]',
                      query: {
                        workspaceId: error.workspace.id,
                        pageId: error.workspace.meta.pageMetas[0].id,
                      },
                    })
                    .finally(() => {
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
          {error.message ?? error.toString()}
        </>
      );
    }

    return this.props.children;
  }
}
