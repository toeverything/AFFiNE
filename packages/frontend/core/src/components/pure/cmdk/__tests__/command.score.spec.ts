import { describe, expect, it } from 'vitest';

import { commandScore } from '../command-score';

describe('commandScore', function () {
  it('should match exact strings exactly', function () {
    expect(commandScore('hello', 'hello')).to.equal(1);
  });

  it('should prefer case-sensitive matches', function () {
    expect(commandScore('Hello', 'Hello')).to.be.greaterThan(
      commandScore('Hello', 'hello')
    );
  });

  it('should mark down prefixes', function () {
    expect(commandScore('hello', 'hello')).to.be.greaterThan(
      commandScore('hello', 'he')
    );
  });

  it('should score all prefixes the same', function () {
    expect(commandScore('help', 'he')).to.equal(commandScore('hello', 'he'));
  });

  it('should mark down word jumps', function () {
    expect(commandScore('hello world', 'hello')).to.be.greaterThan(
      commandScore('hello world', 'hewo')
    );
  });

  it('should score similar word jumps the same', function () {
    expect(commandScore('hello world', 'hewo')).to.equal(
      commandScore('hey world', 'hewo')
    );
  });

  it('should penalize long word jumps', function () {
    expect(commandScore('hello world', 'hewo')).to.be.greaterThan(
      commandScore('hello kind world', 'hewo')
    );
  });

  it('should match missing characters', function () {
    expect(commandScore('hello', 'hl')).to.be.greaterThan(0);
  });

  it('should penalize more for more missing characters', function () {
    expect(commandScore('hello', 'hllo')).to.be.greaterThan(
      commandScore('hello', 'hlo')
    );
  });

  it('should penalize more for missing characters than case', function () {
    expect(commandScore('go to Inbox', 'in')).to.be.greaterThan(
      commandScore('go to Unversity/Societies/CUE/info@cue.org.uk', 'in')
    );
  });

  it('should match transpotisions', function () {
    expect(commandScore('hello', 'hle')).to.be.greaterThan(0);
  });

  it('should not match with a trailing letter', function () {
    expect(commandScore('ss', 'sss')).to.equal(0.1);
  });

  it('should match long jumps', function () {
    expect(commandScore('go to @QuickFix', 'fix')).to.be.greaterThan(0);
    expect(commandScore('go to Quick Fix', 'fix')).to.be.greaterThan(
      commandScore('go to @QuickFix', 'fix')
    );
  });

  it('should work well with the presence of an m-dash', function () {
    expect(commandScore('no go — Windows', 'windows')).to.be.greaterThan(0);
  });

  it('should be robust to duplicated letters', function () {
    expect(commandScore('talent', 'tall')).to.be.equal(0.099);
  });

  it('should not allow letter insertion', function () {
    expect(commandScore('talent', 'tadlent')).to.be.equal(0);
  });

  it('should match - with " " characters', function () {
    expect(commandScore('Auto-Advance', 'Auto Advance')).to.be.equal(0.9999);
  });

  it('should score long strings quickly', function () {
    expect(
      commandScore(
        'go to this is a really long label that is really longthis is a really long label that is really longthis is a really long label that is really longthis is a really long label that is really long',
        'this is a'
      )
    ).to.be.equal(0.891);
  });
});
