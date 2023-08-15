import { routes } from '@affine/core/router';
import type { StoryContext, StoryFn } from '@storybook/react';
import { Outlet, useLocation } from 'react-router-dom';
import {
  reactRouterOutlets,
  reactRouterParameters,
  withRouter,
} from 'storybook-addon-react-router-v6';

const withCleanLocalStorage = (Story: StoryFn, context: StoryContext) => {
  localStorage.clear();
  return <Story {...context.args} />;
};

export default {
  title: 'Preview/Core',
};

export const Index: StoryFn = () => {
  const location = useLocation();
  // fixme: `key` is a hack to force the storybook to re-render the outlet
  return <Outlet key={location.pathname} />;
};

Index.decorators = [withRouter, withCleanLocalStorage];
Index.parameters = {
  reactRouter: reactRouterParameters({
    routing: reactRouterOutlets(routes),
  }),
};
