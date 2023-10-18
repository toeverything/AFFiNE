import type { ReactElement } from 'react';
import type { FallbackProps } from 'react-error-boundary';

export const AnyErrorBoundary = (props: FallbackProps): ReactElement => {
  return (
    <div>
      <p>Something went wrong:</p>
      <p>{props.error.toString()}</p>
    </div>
  );
};
