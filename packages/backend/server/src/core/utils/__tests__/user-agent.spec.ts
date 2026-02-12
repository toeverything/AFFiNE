import test from 'ava';

import {
  isMobileRequest,
  isMobileUserAgent,
  parseRequestUserAgent,
  parseUserAgent,
} from '../user-agent';

const mobileUserAgent =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const desktopUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

test('returns desktop for empty user agent values', t => {
  t.false(isMobileUserAgent(undefined));

  t.deepEqual(parseUserAgent(undefined), {
    ua: '',
    deviceType: 'desktop',
    isMobile: false,
  });
});

test('detects mobile and desktop user agents', t => {
  const mobile = parseUserAgent(mobileUserAgent);
  t.true(mobile.isMobile);
  t.is(mobile.deviceType, 'mobile');

  const desktop = parseUserAgent(desktopUserAgent);
  t.false(desktop.isMobile);
  t.is(desktop.deviceType, 'desktop');
});

test('prefers sec-ch-ua-mobile over user-agent when available', t => {
  const mobileFromHint = parseRequestUserAgent({
    'user-agent': desktopUserAgent,
    'sec-ch-ua-mobile': '?1',
  });
  t.true(mobileFromHint.isMobile);
  t.is(mobileFromHint.deviceType, 'mobile');
  t.true(isMobileRequest({ 'sec-ch-ua-mobile': '?1' }));

  const desktopFromHint = parseRequestUserAgent({
    'user-agent': mobileUserAgent,
    'sec-ch-ua-mobile': '?0',
  });
  t.false(desktopFromHint.isMobile);
  t.is(desktopFromHint.deviceType, 'desktop');
});

test('uses sec-ch-ua-platform as fallback hint', t => {
  const parsed = parseRequestUserAgent({
    'sec-ch-ua-platform': '"Android"',
  });
  t.true(parsed.isMobile);
  t.is(parsed.deviceType, 'mobile');

  const desktop = parseRequestUserAgent({
    'sec-ch-ua-platform': '"Windows"',
  });
  t.false(desktop.isMobile);
  t.is(desktop.deviceType, 'desktop');
  t.false(isMobileUserAgent(undefined));
});
