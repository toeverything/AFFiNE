class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  url = '';
  eventSourceInitDict = {};
  eventListenerMap = {};

  constructor(url, eventSourceInitDict) {
    console.log('new MockEventSource', url, eventSourceInitDict);
    window.MockEventSourceInstance = this;
    this.url = url;
    this.eventSourceInitDict = eventSourceInitDict;
  }

  addEventListener(event, cb) {
    console.log('MockEventSource addEventListener', event, cb);
    this.eventListenerMap[event] = cb;
  }

  close() {
    console.log('MockEventSource close');
    window.MockEventSourceInstance = null;
  }

  triggerEvent(event, data) {
    if (this.eventListenerMap[event]) {
      this.eventListenerMap[event]({ data });
    }
  }
}

window.EventSource = MockEventSource;

console.log('MockEventSource loaded');
