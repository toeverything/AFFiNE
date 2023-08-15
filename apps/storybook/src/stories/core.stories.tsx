import { routes } from '@affine/core/router';
import { expect } from '@storybook/jest';
import type { StoryContext, StoryFn } from '@storybook/react';
import { userEvent } from '@storybook/testing-library';
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
};

export const Index: StoryFn = () => {
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
  await new Promise(resolve => setTimeout(resolve, 1000));
  const settingModalBtn = canvasElement.querySelector(
    '[data-testid="settings-modal-trigger"]'
  ) as Element;
  expect(settingModalBtn).not.toBeNull();
  await userEvent.click(settingModalBtn);
};
SettingPage.decorators = [withRouter, withCleanLocalStorage];
SettingPage.parameters = {
  reactRouter: reactRouterParameters({
    routing: reactRouterOutlets(routes),
  }),
};
