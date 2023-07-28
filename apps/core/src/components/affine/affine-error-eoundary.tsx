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
} from '@toeverything/plugin-infra/atom';
import { useAtomValue } from 'jotai/react';
import { Provider } from 'jotai/react';
import type { ErrorInfo, ReactElement, ReactNode } from 'react';
import type React from 'react';
import { Component } from 'react';
import { useLocation, useParams } from 'react-router-dom';
export type AffineErrorBoundaryProps = React.PropsWithChildren;

type AffineError =
  | QueryParamError
  | Unreachable
  | WorkspaceNotFoundError
  | PageNotFoundError
  | Error;

interface AffineErrorBoundaryState {
  error: AffineError | null;
}

export const DumpInfo = () => {
  const location = useLocation();
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  const currentWorkspaceId = useAtomValue(currentWorkspaceIdAtom);
  const currentPageId = useAtomValue(currentPageIdAtom);
  const path = location.pathname;
  const query = useParams();
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
            <DumpInfo />
          </Provider>
        </>
      );
    }

    return this.props.children;
  }
}
