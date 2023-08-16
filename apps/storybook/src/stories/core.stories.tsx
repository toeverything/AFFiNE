import { pluginRegisterPromise } from '@affine/core/bootstrap/register-plugins';
import { routes } from '@affine/core/router';
import { assertExists } from '@blocksuite/global/utils';
import type { StoryContext, StoryFn } from '@storybook/react';
import { userEvent, waitFor } from '@storybook/testing-library';
import { use } from 'foxact/use';
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

const FakeApp = () => {
  const location = useLocation();
  // fixme: `key` is a hack to force the storybook to re-render the outlet
  return <Outlet key={location.pathname} />;
};

export default {
  title: 'Preview/Core',
  parameters: {
    chromatic: { disableSnapshot: false },
  },
};

export const Index: StoryFn = () => {
  use(pluginRegisterPromise);
  return <FakeApp />;
};
Index.decorators = [withRouter, withCleanLocalStorage];
Index.parameters = {
  reactRouter: reactRouterParameters({
    routing: reactRouterOutlets(routes),
  }),
};

export const SettingPage: StoryFn = () => {
  return <FakeApp />;
};
SettingPage.play = async ({ canvasElement }) => {
  await waitFor(
    () => {
      assertExists(
        canvasElement.querySelector('[data-testid="settings-modal-trigger"]')
      );
    },
    {
      timeout: 5000,
    }
  );
  const settingModalBtn = canvasElement.querySelector(
    '[data-testid="settings-modal-trigger"]'
  ) as Element;
  await userEvent.click(settingModalBtn);
};
SettingPage.decorators = [withRouter, withCleanLocalStorage];
SettingPage.parameters = {
  reactRouter: reactRouterParameters({
    routing: reactRouterOutlets(routes),
  }),
};

export const NotFoundPage: StoryFn = () => {
  return <FakeApp />;
};
NotFoundPage.decorators = [withRouter, withCleanLocalStorage];
NotFoundPage.parameters = {
  reactRouter: reactRouterParameters({
    routing: reactRouterOutlets(routes),
    location: {
      path: '/404',
    },
  }),
};
