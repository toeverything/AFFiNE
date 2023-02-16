import React, { Component, ErrorInfo } from 'react';
import { MigrationError } from '@blocksuite/global/error';

export type BlockSuiteErrorBoundaryProps = React.PropsWithChildren;

type BlockSuiteError = MigrationError | Error;

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
      const isMigrationError = this.state.error instanceof MigrationError;

      return (
        <>
          <h1>Sorry.. there was an error</h1>
          {isMigrationError ? (
            <>
              <span> Migration error </span>
              <span>
                {' '}
                Please open a ticket in{' '}
                <a
                  target="_blank"
                  href="https://github.com/toeverything/blocksuite/issues"
                >
                  BlockSuite Github Issue
                </a>
              </span>
            </>
          ) : null}
        </>
      );
    }

    return this.props.children;
  }
}
