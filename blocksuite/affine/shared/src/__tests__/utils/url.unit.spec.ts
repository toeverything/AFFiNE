import { describe, expect, test } from 'vitest';

import { isValidUrl } from '../../utils/url.js';

describe('isValidUrl: determining whether a URL is valid is very complicated', () => {
  test('basic case', () => {
    expect(isValidUrl('')).toEqual(false);
    expect(isValidUrl('1.co')).toEqual(true);
    expect(isValidUrl('https://www.example.com')).toEqual(true);
    expect(isValidUrl('www.example.com')).toEqual(true);
    expect(isValidUrl('http://www.github.com/toeverything/blocksuite')).toEqual(
      true
    );
  });

  test('CAUTION: any link include allowed schema is a valid url!', () => {
    expect(isValidUrl('http://www.example.cm')).toEqual(true);
    expect(isValidUrl('https://x ')).toEqual(true);
    expect(isValidUrl('mailto://w:80')).toEqual(true);
  });

  test('link include a unknown schema is not a valid url', () => {
    expect(isValidUrl('xxx://www.example.com')).toEqual(false);
    expect(isValidUrl('https://')).toEqual(false);
    expect(isValidUrl('http://w.... !@#*(!!!!')).toEqual(false);
  });

  test('URL without protocol is a valid URL', () => {
    expect(isValidUrl('www.example.com')).toEqual(true);
    expect(isValidUrl('example.co')).toEqual(true);
    expect(isValidUrl('example.cm')).toEqual(true);
    expect(isValidUrl('1.1.1.1')).toEqual(false);

    expect(isValidUrl('example.c')).toEqual(false);
  });

  test('special cases', () => {
    expect(isValidUrl('example.com.')).toEqual(false);

    // I don't know why
    // private & local networks is excluded
    expect(isValidUrl('127.0.0.1')).toEqual(false);
    expect(isValidUrl('10.0.0.1')).toEqual(false);
    expect(isValidUrl('localhost')).toEqual(false);
    expect(isValidUrl('0.0.0.0')).toEqual(false);

    expect(isValidUrl('128.0.0.1')).toEqual(false);
    expect(isValidUrl('1.0.0.1')).toEqual(false);
  });

  test('email link is a valid URL', () => {
    // See https://www.rapidtables.com/web/html/mailto.html
    expect(isValidUrl('mailto:name@email.com')).toEqual(true);
    expect(
      isValidUrl(
        'mailto:name@rapidtables.com?subject=The%20subject%20of%20the%20mail'
      )
    ).toEqual(true);
    expect(
      isValidUrl(
        'mailto:name1@rapidtables.com?cc=name2@rapidtables.com&bcc=name3@rapidtables.com&subject=The%20subject%20of%20the%20email&body=The%20body%20of%20the%20email'
      )
    ).toEqual(true);
    // multiple email recipients
    expect(isValidUrl('mailto:name1@mail.com,name2@mail.com')).toEqual(true);
  });

  test('misc case', () => {
    // Emoji domain
    expect(isValidUrl('xn--i-7iq.ws')).toEqual(true);
    expect(
      isValidUrl('https://username:password@www.example.com:80/?q_a=1234567')
    ).toEqual(true);

    expect(isValidUrl('新华网.cn')).toEqual(true);
    expect(isValidUrl('example.com/中文/にほんご')).toEqual(true);

    // It's a valid url, but we don't want to support it
    // Longest TLD up to date is `.xn--vermgensberatung-pwb`, at 24 characters in Punycode and 17 when decoded [vermögensberatung].
    // See also https://stackoverflow.com/questions/9238640/how-long-can-a-tld-possibly-be#:~:text=Longest%20TLD%20up%20to%20date,17%20when%20decoded%20%5Bverm%C3%B6gensberatung%5D.
    expect(isValidUrl('example.xn--vermgensberatung-pwb')).toEqual(false);
  });

  test('should allow ip address url when origin is same', () => {
    expect(isValidUrl('http://127.0.0.1', 'http://127.0.0.1')).toEqual(true);
  });
});
