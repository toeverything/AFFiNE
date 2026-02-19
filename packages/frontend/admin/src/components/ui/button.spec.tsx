/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  afterEach(() => {
    cleanup();
  });

  test('uses token-aligned default styles', () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.className).toContain('rounded-lg');
    expect(button.className).toContain('bg-primary');
    expect(button.className).toContain('focus-visible:ring-ring/30');
  });

  test('supports outline/sm variant with disabled state', () => {
    render(
      <Button variant="outline" size="sm" disabled={true}>
        Cancel
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(button.className).toContain('border-border');
    expect(button.className).toContain('h-8');
    expect(button.className).toContain('text-xs');
    expect(button.hasAttribute('disabled')).toBe(true);
  });
});
