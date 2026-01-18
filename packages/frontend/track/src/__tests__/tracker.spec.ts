/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const sendTelemetryEvent = vi.fn().mockResolvedValue({ queued: true });
const setTelemetryContext = vi.fn();

vi.mock('../telemetry', () => ({
  sendTelemetryEvent,
  setTelemetryContext,
}));

const buildConfig = {
  appVersion: '0.0.0',
  appBuildType: 'stable',
  editorVersion: '0.0.0',
  isElectron: false,
  isMobileEdition: false,
  distribution: 'test',
};

beforeEach(() => {
  (globalThis as any).BUILD_CONFIG = buildConfig;
  localStorage.clear();
  sessionStorage.clear();
  sendTelemetryEvent.mockClear();
  setTelemetryContext.mockClear();
  vi.useRealTimers();
  vi.resetModules();
});

async function loadTracker() {
  return await import('../tracker');
}

describe('tracker session signals', () => {
  test('sends first_visit and session_start on first event', async () => {
    const { tracker } = await loadTracker();

    tracker.track('test_event');

    const events = sendTelemetryEvent.mock.calls.map(call => call[0]);
    expect(events.map(event => event.eventName)).toEqual([
      'first_visit',
      'session_start',
      'test_event',
    ]);

    const firstVisit = events[0];
    expect(typeof (firstVisit.params as any).session_id).toBe('number');
    expect((firstVisit.params as any).session_number).toBe(1);
    expect((firstVisit.params as any).engagement_time_msec).toBe(1);
  });

  test('does not repeat first_visit for later events', async () => {
    const { tracker } = await loadTracker();

    tracker.track('event_a');
    tracker.track('event_b');

    const names = sendTelemetryEvent.mock.calls.map(call => call[0].eventName);
    expect(names.filter(name => name === 'first_visit')).toHaveLength(1);
    expect(names.filter(name => name === 'session_start')).toHaveLength(1);
  });

  test('increments session_number after idle timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { tracker } = await loadTracker();

    tracker.track('event_a');
    sendTelemetryEvent.mockClear();

    vi.setSystemTime(new Date('2024-01-01T01:00:00Z'));
    tracker.track('event_b');

    const events = sendTelemetryEvent.mock.calls.map(call => call[0]);
    const sessionStart = events.find(
      event => event.eventName === 'session_start'
    );
    expect((sessionStart?.params as any).session_number).toBe(2);
  });
});
