import { routes } from '@affine/core/router';
import { assertExists } from '@blocksuite/global/utils';
import type { StoryFn } from '@storybook/react';
import { screen, userEvent, waitFor, within } from '@storybook/testing-library';
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
  await waitFor(
    () => {
      assertExists(canvasElement.querySelector('v-line'));
    },
    {
      timeout: 10000,
    }
  );
  await step('click setting modal button', async () => {
    await userEvent.click(canvas.getByTestId('settings-modal-trigger'));
  });
  await waitFor(async () => {
    assertExists(
      document.body.querySelector('[data-testid="language-menu-button"]')
    );
  });

  // Menu button may have "pointer-events: none" style, await 100ms to avoid this weird situation.
  await new Promise(resolve => window.setTimeout(resolve, 100));

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
  const canvas = within(canvasElement);
  // click current-workspace
  const currentWorkspace = await waitFor(
    () => {
      assertExists(canvas.getByTestId('current-workspace'));
      return canvas.getByTestId('current-workspace');
    },
    {
      timeout: 5000,
    }
  );

  // todo: figure out why userEvent cannot click this element?
  // await userEvent.click(currentWorkspace);
  currentWorkspace.click();
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
  await waitFor(
    () => {
      assertExists(canvasElement.querySelector('v-line'));
    },
    {
      timeout: 10000,
    }
  );
  await userEvent.click(canvas.getByTestId('slider-bar-quick-search-button'));
  await waitFor(
    () => {
      assertExists(screen.getByTestId('cmdk-quick-search'));
    },
    {
      timeout: 3000,
    }
  );
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
  await waitFor(
    () => {
      assertExists(canvasElement.querySelector('v-line'));
    },
    {
      timeout: 10000,
    }
  );
  await waitFor(() => {
    assertExists(
      canvasElement.querySelector('[data-testid="header-dropDownButton"]')
    );
  });
  await userEvent.click(canvas.getByTestId('header-dropDownButton'));
  await waitFor(() => {
    assertExists(
      document.body.querySelector('[data-testid="editor-option-menu-import"]')
    );
  });
  await userEvent.click(screen.getByTestId('editor-option-menu-import'));
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
      path: '/open-app/url',
      searchParams: {
        url: 'affine-beta://foo-bar.com',
        open: 'false',
      },
    },
  }),
};
