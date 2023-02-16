import React, { Component, ErrorInfo } from 'react';
import NotfoundPage from '@/components/404';

export type WorkspaceErrorBoundaryProps = React.PropsWithChildren;
interface WorkspaceErrorBoundaryState {
  error: Error | unknown | null;
}

export class WorkspaceErrorBoundary extends Component<
  WorkspaceErrorBoundaryProps,
  WorkspaceErrorBoundaryState
> {
  public state: WorkspaceErrorBoundaryState = {
    error: null,
  };

  public static getDerivedStateFromError(
    error: unknown
  ): WorkspaceErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.error) {
      return <NotfoundPage />;
    }

    return this.props.children;
  }
}
