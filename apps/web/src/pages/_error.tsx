import * as Sentry from '@sentry/nextjs';
import type { NextPageContext } from 'next';
import type { ErrorProps } from 'next/error';
import NextErrorComponent from 'next/error';

const CustomErrorComponent = (props: ErrorProps) => {
  return <NextErrorComponent statusCode={props.statusCode} />;
};

CustomErrorComponent.getInitialProps = async (contextData: NextPageContext) => {
  await Sentry.captureUnderscoreErrorException(contextData);
  return NextErrorComponent.getInitialProps(contextData);
};

export default CustomErrorComponent;
