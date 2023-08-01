import assert from 'node:assert';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import temp from 'fs-temp';

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const lib = require('../');

var rawData = Buffer.from(
  'AAAAAAEqAAIAAApUZXN0IFRpdGxlAAAAAAAAAAAAAAAAAAAAAADO615USCsA' +
    'BQAAABMMVGVzdEJrZy50aWZmAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFM7rXlgAAAAAAAAAAP////8A' +
    'AA0CAAAAAAAAAAAAAAAAAAAACy5iYWNrZ3JvdW5kAAABAAQAAAATAAIAJFRl' +
    'c3QgVGl0bGU6LmJhY2tncm91bmQ6AFRlc3RCa2cudGlmZgAPABYACgBUAGUA' +
    'cwB0ACAAVABpAHQAbABlABIAGS8uYmFja2dyb3VuZC9UZXN0QmtnLnRpZmYA' +
    'ABMAEy9Wb2x1bWVzL1Rlc3QgVGl0bGUA//8AAA==',
  'base64'
);

describe('decode', function () {
  it('should parse a simple alias', function () {
    const info = lib.decode(rawData);

    assert.equal(info.version, 2);

    assert.deepEqual(info.volume, {
      name: 'Test Title',
      created: new Date('2014-01-02T18:20:04.000Z'),
      signature: 'H+',
      type: 'other',
      abspath: '/Volumes/Test Title',
    });

    assert.deepEqual(info.parent, {
      id: 19,
      name: '.background',
    });

    assert.deepEqual(info.target, {
      type: 'file',
      filename: 'TestBkg.tiff',
      id: 20,
      created: new Date('2014-01-02T18:20:08.000Z'),
      path: 'Test Title:.background:',
      abspath: '/.background/TestBkg.tiff',
    });
  });
});

describe('encode', function () {
  it('should encode a simple alias', function () {
    const info = lib.decode(rawData);
    const buf = lib.encode(info);

    assert.deepEqual(rawData, buf);
  });
});

describe('create', function () {
  it('should create a simple alias', function () {
    const buf = lib.create(path.join(__dirname, 'basics.mjs'));
    const info = lib.decode(buf);

    assert.equal('file', info.target.type);
    assert.equal('basics.mjs', info.target.filename);
  });
});

describe('isAlias', function () {
  let aliasFile, garbageFile;

  before(function () {
    aliasFile = temp.writeFileSync(
      Buffer.from('626f6f6b000000006d61726b00000000', 'hex')
    );
    garbageFile = temp.writeFileSync(Buffer.from('Hello my name is Linus!'));
  });

  after(function () {
    fs.unlinkSync(aliasFile);
    fs.unlinkSync(garbageFile);
  });

  it('should identify alias', function () {
    assert.equal(lib.isAlias(aliasFile), true);
  });

  it('should identify non-alias', function () {
    assert.equal(lib.isAlias(garbageFile), false);
  });
});
