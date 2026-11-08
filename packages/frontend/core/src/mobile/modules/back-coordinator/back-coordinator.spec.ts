import { Framework } from '@toeverything/infra';
import { describe, expect, it, vi } from 'vitest';

import { MobileBackCoordinator } from './back-coordinator';

const createCoordinator = () => {
  const framework = new Framework();
  framework.service(MobileBackCoordinator);
  return framework.provider().get(MobileBackCoordinator);
};

describe('MobileBackCoordinator', () => {
  it('handles visual layers in registration order and disposes descendants', () => {
    const coordinator = createCoordinator();
    const calls: string[] = [];
    const parent = coordinator.registerVisual({
      handle: () => {
        calls.push('parent');
      },
    });
    coordinator.registerVisual({
      parent: parent.id,
      handle: () => {
        calls.push('child');
      },
    });

    expect(coordinator.request('system-back')).toBe(true);
    expect(calls).toEqual(['child']);
    parent.dispose();
    expect(coordinator.request('system-back')).toBe(false);
  });

  it.each(['system-back', 'ui-back'] as const)(
    'uses semantic back for %s but never pops a root',
    intent => {
      const coordinator = createCoordinator();
      const back = vi.fn();
      coordinator.setDestination({ kind: 'doc', back });
      expect(coordinator.request(intent)).toBe(true);
      expect(back).toHaveBeenCalledWith(intent);
      coordinator.setDestination({ kind: 'all-docs', back });
      expect(coordinator.request(intent)).toBe(false);
    }
  );

  it.each([
    'home',
    'all-docs',
    'all-collections',
    'all-tags',
    'journal',
  ] as const)('passes back through at the %s root', kind => {
    const coordinator = createCoordinator();
    const back = vi.fn();
    coordinator.setDestination({ kind, back });
    expect(coordinator.request('system-back')).toBe(false);
    expect(coordinator.request('ui-back')).toBe(false);
    expect(coordinator.beginInteractive()).toBe(false);
    expect(back).not.toHaveBeenCalled();
  });

  it('keeps ui-up separate from source back', () => {
    const coordinator = createCoordinator();
    const back = vi.fn();
    const up = vi.fn();
    coordinator.setDestination({ kind: 'doc', back, up });
    coordinator.request('ui-up');
    expect(up).toHaveBeenCalledOnce();
    expect(back).not.toHaveBeenCalled();
    coordinator.setDestination({ kind: 'doc', back });
    expect(coordinator.request('ui-up')).toBe(false);
  });

  it('commits or cancels one stable interactive target', () => {
    const coordinator = createCoordinator();
    const back = vi.fn();
    coordinator.setDestination({ kind: 'doc', back });
    expect(coordinator.beginInteractive()).toBe(true);
    coordinator.cancelInteractive();
    expect(back).not.toHaveBeenCalled();
    expect(coordinator.beginInteractive()).toBe(true);
    expect(coordinator.commitInteractive()).toBe(true);
    expect(back).toHaveBeenCalledWith('interactive-gesture');
  });

  it('clears visual, destination and restoration state on reset', () => {
    const coordinator = createCoordinator();
    coordinator.setSnapshot('home', { anchor: 'doc:a', expanded: ['folder'] });
    coordinator.setDestination({ kind: 'doc', back: vi.fn() });
    coordinator.registerVisual({ handle: vi.fn() });
    coordinator.pushSource({ workspaceId: 'a', location: '/home' });
    coordinator.reset();
    expect(coordinator.snapshot('home')).toBeUndefined();
    expect(coordinator.canHandle$.value).toBe(false);
    expect(coordinator.request('ui-back')).toBe(false);
    expect(coordinator.popSource('a')).toBeUndefined();
  });

  it('keeps explicit source tokens workspace-scoped and LIFO', () => {
    const coordinator = createCoordinator();
    coordinator.pushSource({ workspaceId: 'a', location: '/home' });
    coordinator.pushSource({ workspaceId: 'a', location: '/doc-a' });
    expect(coordinator.popSource('b')).toBeUndefined();
    expect(coordinator.popSource('a')?.location).toBe('/doc-a');
    expect(coordinator.popSource('a')?.location).toBe('/home');
  });

  it('keeps cold deep links source-free and returns warm or inaccessible targets to their explicit source', () => {
    const coordinator = createCoordinator();
    const replace = vi.fn();
    coordinator.setDestination({ kind: 'doc' });
    expect(coordinator.request('ui-back')).toBe(false);

    coordinator.pushSource({ workspaceId: 'a', location: '/home' });
    coordinator.setDestination({
      kind: 'doc',
      back: () => {
        const source = coordinator.popSource('a');
        if (!source) return false;
        replace(source.location);
        return true;
      },
    });
    expect(coordinator.request('ui-back')).toBe(true);
    expect(replace).toHaveBeenCalledWith('/home');
  });

  it('closes nested menu, confirm and modal layers without reaching the destination', () => {
    const coordinator = createCoordinator();
    const calls: string[] = [];
    const destination = vi.fn();
    coordinator.setDestination({ kind: 'doc', back: destination });
    const modal = coordinator.registerVisual({
      handle: () => {
        calls.push('modal');
      },
    });
    const confirm = coordinator.registerVisual({
      parent: modal.id,
      handle: () => {
        calls.push('confirm');
      },
    });
    const menu = coordinator.registerVisual({
      parent: confirm.id,
      handle: () => {
        calls.push('menu');
      },
    });

    expect(coordinator.request('system-back')).toBe(true);
    menu.dispose();
    expect(coordinator.request('system-back')).toBe(true);
    confirm.dispose();
    expect(coordinator.request('system-back')).toBe(true);
    expect(calls).toEqual(['menu', 'confirm', 'modal']);
    expect(destination).not.toHaveBeenCalled();
  });
});
