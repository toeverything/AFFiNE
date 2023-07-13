import type {
  QueryParamError,
  Unreachable,
  WorkspaceNotFoundError,
} from '@affine/env/constant';
import { PageNotFoundError } from '@affine/env/constant';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
  rootStore,
} from '@toeverything/plugin-infra/manager';
import { useAtomValue } from 'jotai/react';
import { Provider } from 'jotai/react';
import type { NextRouter } from 'next/router';
import type { ErrorInfo, ReactElement, ReactNode } from 'react';
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

export const DumpInfo = (props: Pick<AffineErrorBoundaryProps, 'router'>) => {
  const router = props.router;
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  const currentWorkspaceId = useAtomValue(currentWorkspaceIdAtom);
  const currentPageId = useAtomValue(currentPageIdAtom);
  const path = router.asPath;
  const query = router.query;
  return (
    <>
      <div>
        Please copy the following information and send it to the developer.
      </div>
      <div
        style={{
          border: '1px solid red',
        }}
      >
        <div>path: {path}</div>
        <div>query: {JSON.stringify(query)}</div>
        <div>currentWorkspaceId: {currentWorkspaceId}</div>
        <div>currentPageId: {currentPageId}</div>
        <div>metadata: {JSON.stringify(metadata)}</div>
      </div>
    </>
  );
};

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
      let errorDetail: ReactElement | null = null;
      const error = this.state.error;
      if (error instanceof PageNotFoundError) {
        errorDetail = (
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
      } else {
        errorDetail = (
          <>
            <h1>Sorry.. there was an error</h1>
            {error.message ?? error.toString()}
          </>
        );
      }
      return (
        <>
          {errorDetail}
          <Provider key="JotaiProvider" store={rootStore}>
            <DumpInfo router={this.props.router} />
          </Provider>
        </>
      );
    }

    return this.props.children;
  }
}
