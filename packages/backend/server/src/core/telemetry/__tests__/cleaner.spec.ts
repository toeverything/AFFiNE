import test from 'ava';

import {
  cleanTelemetryEvent,
  sanitizeParams,
  sanitizeUserProperties,
} from '../cleaner';
import { TelemetryDeduper } from '../deduper';

test('sanitizeParams applies renames, drops, and normalization', t => {
  const params = {
    page: 'home',
    status: true,
    docId: 'doc-1',
    other: { foo: 'bar' },
    nested: { value: 'x' },
    enabled: false,
  };

  const sanitized = sanitizeParams(params);

  t.is(sanitized.ui_page, 'home');
  t.is(sanitized.result, 'success');
  t.is(sanitized.nested_setting_value, 'x');
  t.is(sanitized.enabled, 'off');
  t.false('doc_id' in sanitized);
  t.false(Object.keys(sanitized).some(key => key.includes('other')));
});

test('sanitizeUserProperties filters and maps values', t => {
  const props = {
    appVersion: '1.2.3',
    pro: true,
    $email: 'test@example.com',
    isMobile: true,
  };

  const sanitized = sanitizeUserProperties(props);

  t.deepEqual(sanitized, {
    app_version: '1.2.3',
    plan_tier: 'pro',
    is_mobile: '1',
  });
});

test('cleanTelemetryEvent maps page view metadata', t => {
  const cleaned = cleanTelemetryEvent(
    {
      schemaVersion: 1,
      eventName: 'track_pageview',
      clientId: 'client-1',
      eventId: 'event-1',
      params: {
        location: 'https://example.com/docs?tab=1',
        title: 'Example',
      },
      context: {
        url: 'https://example.com/docs?tab=1',
      },
    },
    {
      timestampMicros: 123456,
    }
  );

  t.truthy(cleaned);
  t.is(cleaned?.eventName, 'page_view');
  t.is(cleaned?.params.page_location, 'https://example.com/docs?tab=1');
  t.is(cleaned?.params.page_path, '/docs?tab=1');
  t.is(cleaned?.params.page_title, 'Example');
});

test('TelemetryDeduper drops duplicates within ttl', t => {
  const deduper = new TelemetryDeduper(1000, 10);
  const key = 'client-1:event-1';

  t.false(deduper.isDuplicate(key, 0));
  t.true(deduper.isDuplicate(key, 500));
  t.false(deduper.isDuplicate(key, 1500));
});
