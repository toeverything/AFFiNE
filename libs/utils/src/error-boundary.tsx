import * as React from 'react';

const changedArray = (a: Array<unknown> = [], b: Array<unknown> = []) =>
    a.length !== b.length ||
    a.some((item, index) => !Object.is(item, b[index]));

interface FallbackProps {
    error: Error;
    resetErrorBoundary: (...args: Array<unknown>) => void;
}

interface ErrorBoundaryPropsWithComponent {
    onResetKeysChange?: (
        prevResetKeys: Array<unknown> | undefined,
        resetKeys: Array<unknown> | undefined
    ) => void;
    onReset?: (...args: Array<unknown>) => void;
    onError?: (error: Error, info: { componentStack: string }) => void;
    resetKeys?: Array<unknown>;
    fallback?: never;
    FallbackComponent: React.ComponentType<FallbackProps>;
    fallbackRender?: never;
}

declare function FallbackRender(
    props: FallbackProps
): React.ReactElement<
    unknown,
    string | React.FunctionComponent | typeof React.Component
> | null;

interface ErrorBoundaryPropsWithRender {
    onResetKeysChange?: (
        prevResetKeys: Array<unknown> | undefined,
        resetKeys: Array<unknown> | undefined
    ) => void;
    onReset?: (...args: Array<unknown>) => void;
    onError?: (error: Error, info: { componentStack: string }) => void;
    resetKeys?: Array<unknown>;
    fallback?: never;
    FallbackComponent?: never;
    fallbackRender: typeof FallbackRender;
}

interface ErrorBoundaryPropsWithFallback {
    onResetKeysChange?: (
        prevResetKeys: Array<unknown> | undefined,
        resetKeys: Array<unknown> | undefined
    ) => void;
    onReset?: (...args: Array<unknown>) => void;
    onError?: (error: Error, info: { componentStack: string }) => void;
    resetKeys?: Array<unknown>;
    fallback: React.ReactElement<
        unknown,
        string | React.FunctionComponent | typeof React.Component
    > | null;
    FallbackComponent?: never;
    fallbackRender?: never;
}

type ErrorBoundaryProps =
    | ErrorBoundaryPropsWithFallback
    | ErrorBoundaryPropsWithComponent
    | ErrorBoundaryPropsWithRender;

type ErrorBoundaryState = { error: Error | null };

const initialState: ErrorBoundaryState = { error: null };

class ErrorBoundary extends React.Component<
    React.PropsWithRef<React.PropsWithChildren<ErrorBoundaryProps>>,
    ErrorBoundaryState
> {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    override state = initialState;
    resetErrorBoundary = (...args: Array<unknown>) => {
        this.props.onReset?.(...args);
        this.reset();
    };

    reset() {
        this.setState(initialState);
    }

    override componentDidCatch(error: Error, info: React.ErrorInfo) {
        this.props.onError?.(error, info);
    }

    override componentDidUpdate(
        prevProps: ErrorBoundaryProps,
        prevState: ErrorBoundaryState
    ) {
        const { error } = this.state;
        const { resetKeys } = this.props;

        // There's an edge case where if the thing that triggered the error
        // happens to *also* be in the resetKeys array, we'd end up resetting
        // the error boundary immediately. This would likely trigger a second
        // error to be thrown.
        // So we make sure that we don't check the resetKeys on the first call
        // of cDU after the error is set

        if (
            error !== null &&
            prevState.error !== null &&
            changedArray(prevProps.resetKeys, resetKeys)
        ) {
            this.props.onResetKeysChange?.(prevProps.resetKeys, resetKeys);
            this.reset();
        }
    }

    override render() {
        const { error } = this.state;

        const { fallbackRender, FallbackComponent, fallback } = this.props;

        if (error !== null) {
            const props = {
                error,
                resetErrorBoundary: this.resetErrorBoundary,
            };
            if (React.isValidElement(fallback)) {
                return fallback;
            } else if (typeof fallbackRender === 'function') {
                return fallbackRender(props);
            } else if (FallbackComponent) {
                return <FallbackComponent {...props} />;
            } else {
                throw new Error(
                    'react-error-boundary requires either a fallback, fallbackRender, or FallbackComponent prop'
                );
            }
        }

        return this.props.children;
    }
}

function withErrorBoundary<P>(
    Component: React.ComponentType<P>,
    errorBoundaryProps: ErrorBoundaryProps
): React.ComponentType<P> {
    const Wrapped: React.ComponentType<P> = props => {
        return (
            <ErrorBoundary {...errorBoundaryProps}>
                <Component {...props} />
            </ErrorBoundary>
        );
    };

    // Format for display in DevTools
    const name = Component.displayName || Component.name || 'Unknown';
    Wrapped.displayName = `withErrorBoundary(${name})`;

    return Wrapped;
}

function useErrorHandler(givenError?: unknown): (error: unknown) => void {
    const [error, setError] = React.useState<unknown>(null);
    if (givenError != null) throw givenError;
    if (error != null) throw error;
    return setError;
}

export { ErrorBoundary, withErrorBoundary, useErrorHandler };
export type {
    FallbackProps,
    ErrorBoundaryPropsWithComponent,
    ErrorBoundaryPropsWithRender,
    ErrorBoundaryPropsWithFallback,
    ErrorBoundaryProps,
};
