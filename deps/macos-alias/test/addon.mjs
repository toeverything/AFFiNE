import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

import assert from 'assert';

const require = createRequire(import.meta.url);
const addon = require('../build/Release/volume.node');

describe('addon', function () {
  it('should find the volume name of /', function () {
    assert.equal(addon.getVolumeName('/'), 'Macintosh HD');
  });
});
