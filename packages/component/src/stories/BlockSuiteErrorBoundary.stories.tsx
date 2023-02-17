/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { MigrationError } from '@blocksuite/global/error';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';

import {
  BlockSuiteErrorBoundary,
  BlockSuiteErrorBoundaryProps,
} from '../components/BlockSuiteErrorBoundary';

export default {
  title: 'BlockSuite/ErrorBoundary',
  component: BlockSuiteErrorBoundary,
} as Meta<BlockSuiteErrorBoundaryProps>;

const Template: StoryFn<BlockSuiteErrorBoundaryProps> = args => (
  <BlockSuiteErrorBoundary {...args} />
);

export const ErrorComponent = () => {
  throw new MigrationError('Something incorrect');
};

export const Primary = Template.bind(undefined);
Primary.args = {
  children: [
    <span key="1">There is no error</span>,
    <ErrorComponent key="2" />,
  ],
};
