import { routes } from '@affine/core/router';
import { assertExists } from '@blocksuite/global/utils';
import type { StoryFn } from '@storybook/react';
import { userEvent, waitFor, within } from '@storybook/testing-library';
import { Outlet, useLocation } from 'react-router-dom';
import {
  reactRouterOutlets,
  reactRouterParameters,
  withRouter,
} from 'storybook-addon-react-router-v6';

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
  return <FakeApp />;
};
Index.decorators = [withRouter];
Index.parameters = {
  reactRouter: reactRouterParameters({
    routing: reactRouterOutlets(routes),
  }),
};

export const SettingPage: StoryFn = () => {
  return <FakeApp />;
};
SettingPage.play = async ({ canvasElement, step }) => {
  const canvas = within(canvasElement);
  await waitFor(async () => {
    assertExists(canvasElement.querySelector('v-line'));
  });
  await step('click setting modal button', async () => {
    await userEvent.click(canvas.getByTestId('settings-modal-trigger'));
  });
  await waitFor(async () => {
    assertExists(
      document.body.querySelector('[data-testid="language-menu-button"]')
    );
  });
  await step('click language menu button', async () => {
    await userEvent.click(
      document.body.querySelector(
        '[data-testid="language-menu-button"]'
      ) as HTMLElement
    );
  });
};
SettingPage.decorators = [withRouter];
SettingPage.parameters = {
  reactRouter: reactRouterParameters({
    routing: reactRouterOutlets(routes),
  }),
};

export const NotFoundPage: StoryFn = () => {
  return <FakeApp />;
};
NotFoundPage.decorators = [withRouter];
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
WorkspaceList.decorators = [withRouter];
WorkspaceList.parameters = {
  reactRouter: reactRouterParameters({
    routing: reactRouterOutlets(routes),
    location: {
      path: '/',
    },
  }),
};

export const SearchPage: StoryFn = () => {
  return <FakeApp />;
};
SearchPage.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await waitFor(async () => {
    assertExists(canvasElement.querySelector('v-line'));
  });
  await userEvent.click(canvas.getByTestId('slider-bar-quick-search-button'));
};
SearchPage.decorators = [withRouter];
SearchPage.parameters = {
  reactRouter: reactRouterParameters({
    routing: reactRouterOutlets(routes),
    location: {
      path: '/',
    },
  }),
};

export const ImportPage: StoryFn = () => {
  return <FakeApp />;
};
ImportPage.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await waitFor(() => {
    assertExists(canvasElement.querySelector('v-line'));
  });
  await waitFor(() => {
    assertExists(
      canvasElement.querySelector('[data-testid="header-dropDownButton"]')
    );
  });
  await userEvent.click(canvas.getByTestId('header-dropDownButton'));
  await waitFor(() => {
    assertExists(
      canvasElement.querySelector('[data-testid="editor-option-menu-import"]')
    );
  });
  await userEvent.click(canvas.getByTestId('editor-option-menu-import'));
};
ImportPage.decorators = [withRouter];
ImportPage.parameters = {
  reactRouter: reactRouterParameters({
    routing: reactRouterOutlets(routes),
    location: {
      path: '/',
    },
  }),
};

export const OpenAppPage: StoryFn = () => {
  return <FakeApp />;
};
OpenAppPage.decorators = [withRouter];
OpenAppPage.parameters = {
  reactRouter: reactRouterParameters({
    routing: reactRouterOutlets(routes),
    location: {
      path: '/open-app',
      searchParams: {
        url: 'affine-beta://foo-bar.com',
        open: 'false',
      },
    },
  }),
};
