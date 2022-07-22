import * as React from 'react';
import { FallbackProps } from 'react-error-boundary';
import { useTldrawApp } from '../../hooks';
import { styled } from '@toeverything/components/ui';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
    const app = useTldrawApp();

    const refreshPage = () => {
        window.location.reload();
        resetErrorBoundary();
    };

    const copyError = () => {
        const textarea = document.createElement('textarea');
        textarea.value = error.message;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
    };

    const downloadBackup = () => {
        app.saveProjectAs();
    };

    const resetDocument = () => {
        app.resetDocument();
        resetErrorBoundary();
    };

    return (
        <Container>
            <InnerContainer>
                <div>We've encountered an error!</div>
                <pre>
                    <code>{error.message}</code>
                </pre>
                <div>
                    <button onClick={copyError}>Copy Error</button>
                    <button onClick={refreshPage}>Refresh Page</button>
                </div>
                <hr />
                <p>
                    Keep getting this error?{' '}
                    <a onClick={downloadBackup} title="Download your project">
                        Download your project
                    </a>{' '}
                    as a backup and then{' '}
                    <a onClick={resetDocument} title="Reset the document">
                        reset the document
                    </a>
                    .
                </p>
            </InnerContainer>
        </Container>
    );
}

const Container = styled('div')({
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '$canvas',
});

const InnerContainer = styled('div')({
    backgroundColor: '$panel',
    border: '1px solid $panelContrast',
    padding: '$5',
    borderRadius: 8,
    boxShadow: '$panel',
    maxWidth: 320,
    color: '$text',
    fontFamily: '$ui',
    fontSize: '$2',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: '$3',
    '& > pre': {
        marginTop: '$3',
        marginBottom: '$3',
        textAlign: 'left',
        whiteSpace: 'pre-wrap',
        backgroundColor: '$hover',
        padding: '$4',
        borderRadius: '$2',
        fontFamily: '"Menlo", "Monaco", monospace',
        fontWeight: 500,
    },
    '& p': {
        fontFamily: '$body',
        lineHeight: 1.7,
        padding: '$5',
        margin: 0,
    },
    '& a': {
        color: '$text',
        cursor: 'pointer',
        textDecoration: 'underline',
    },
    '& hr': {
        marginLeft: '-$5',
        marginRight: '-$5',
    },
});
