import { pluginRegisterPromise } from '@affine/core/bootstrap/register-plugins';
import { routes } from '@affine/core/router';
import { assertExists } from '@blocksuite/global/utils';
import type { Decorator, StoryFn } from '@storybook/react';
import { userEvent, waitFor } from '@storybook/testing-library';
import { use } from 'foxact/use';
import { Outlet, useLocation } from 'react-router-dom';
import {
  reactRouterOutlets,
  reactRouterParameters,
  withRouter,
} from 'storybook-addon-react-router-v6';

const withCleanLocalStorage: Decorator = (Story, context) => {
  localStorage.clear();
  return <Story {...context} />;
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

export const WorkspaceList: StoryFn = () => {
  return <FakeApp />;
};
WorkspaceList.play = async ({ canvasElement }) => {
  // click current-workspace
  await waitFor(
    () => {
      assertExists(
        canvasElement.querySelector('[data-testid="current-workspace"]')
      );
    },
    {
      timeout: 5000,
    }
  );
  const currentWorkspace = canvasElement.querySelector(
    '[data-testid="current-workspace"]'
  ) as Element;
  await userEvent.click(currentWorkspace);
};
WorkspaceList.decorators = [withRouter, withCleanLocalStorage];
WorkspaceList.parameters = {
  reactRouter: reactRouterParameters({
    routing: reactRouterOutlets(routes),
    location: {
      path: '/',
    },
  }),
};
