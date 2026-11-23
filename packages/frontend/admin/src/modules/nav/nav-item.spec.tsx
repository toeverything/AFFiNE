/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test } from 'vitest';

import { NavItem } from './nav-item';

describe('NavItem', () => {
  afterEach(() => {
    cleanup();
  });

  test('applies selected style when route matches', () => {
    render(
      <MemoryRouter initialEntries={['/admin/accounts']}>
        <NavItem to="/admin/accounts" label="Accounts" icon={<span>i</span>} />
      </MemoryRouter>
    );

    const link = screen.getByRole('link');
    expect(link.className).toContain('bg-sidebar-active');
    expect(link.className).toContain('text-sidebar-foreground');
  });

  test('keeps label hidden in collapsed mode', () => {
    render(
      <MemoryRouter initialEntries={['/admin/accounts']}>
        <NavItem
          to="/admin/dashboard"
          label="Dashboard"
          isCollapsed={true}
          icon={<span>i</span>}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText('Dashboard')).toBeNull();
    expect(screen.getByRole('link').className).toContain('w-9');
  });
});
