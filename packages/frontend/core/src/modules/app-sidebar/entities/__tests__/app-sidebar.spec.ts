import { Framework, MemoryMemento } from '@toeverything/infra';
import { beforeEach, describe, expect, test } from 'vitest';

import { AppSidebarState } from '../../providers/storage';
import { AppSidebar } from '../app-sidebar';

describe('AppSidebar', () => {
  let framework: Framework;
  let memento: MemoryMemento;
  let sidebar: AppSidebar;

  beforeEach(() => {
    framework = new Framework();
    memento = new MemoryMemento();
    framework.entity(AppSidebar, [AppSidebarState]);
    framework.impl(AppSidebarState, memento);
    sidebar = framework.provider().get(AppSidebar);
  });

  test('default values', () => {
    expect(sidebar.open$.value).toBe(true);
    expect(sidebar.width$.value).toBe(248);
    expect(sidebar.smallScreenMode$.value).toBe(false);
    expect(sidebar.hovering$.value).toBe(false);
  });

  test('state setters update live data and storage', () => {
    sidebar.setOpen(false);
    expect(sidebar.open$.value).toBe(false);
    expect(memento.get('open')).toBe(false);

    sidebar.toggleSidebar();
    expect(sidebar.open$.value).toBe(true);
    expect(memento.get('open')).toBe(true);

    sidebar.setWidth(260);
    expect(sidebar.width$.value).toBe(260);
    expect(memento.get('width')).toBe(260);

    sidebar.setSmallScreenMode(true);
    expect(sidebar.smallScreenMode$.value).toBe(true);
    sidebar.setHovering(true);
    expect(sidebar.hovering$.value).toBe(true);
    sidebar.setPreventHovering(true);
    expect(sidebar.preventHovering$.value).toBe(true);
    sidebar.setResizing(true);
    expect(sidebar.resizing$.value).toBe(true);
  });

  test('getCachedAppSidebarOpenState', () => {
    sidebar.setOpen(false);
    expect(sidebar.getCachedAppSidebarOpenState()).toBe(false);
  });
});
