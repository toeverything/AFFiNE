/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, test } from 'vitest';

import { BlockSuiteWorkspace } from '../../shared';
import { createAffineProviders, createLocalProviders } from '..';

let blockSuiteWorkspace: BlockSuiteWorkspace;

beforeEach(() => {
  blockSuiteWorkspace = new BlockSuiteWorkspace({
    room: 'test',
  });
});

describe('blocksuite providers', () => {
  test('should be valid provider', () => {
    [createLocalProviders, createAffineProviders].forEach(createProviders => {
      createProviders(blockSuiteWorkspace).forEach(provider => {
        expect(provider).toBeTypeOf('object');
        expect(provider).toHaveProperty('flavour');
        expect(provider).toHaveProperty('connect');
        expect(provider.connect).toBeTypeOf('function');
        expect(provider).toHaveProperty('disconnect');
        expect(provider.disconnect).toBeTypeOf('function');
      });
    });
  });
});
