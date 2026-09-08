import Sinon from 'sinon';

import { EventBus } from '../../base';
import { EventName } from '../../base/event/def';

export class MockEventBus {
  private readonly stub = Sinon.createStubInstance(EventBus);

  emit: Sinon.SinonStub = this.stub.emitAsync;
  emitAsync: Sinon.SinonStub = this.stub.emitAsync;
  emitDetached: Sinon.SinonStub = this.stub.emitAsync;
  broadcast: Sinon.SinonStub = this.stub.broadcast;

  last<Event extends EventName>(
    name: Event
  ): { name: Event; payload: Events[Event] } {
    const call = this.emitAsync
      .getCalls()
      .reverse()
      .find(call => call.args[0] === name);
    if (!call) {
      throw new Error(`Event ${name} never called`);
    }

    return {
      name,
      payload: call.args[1],
    };
  }

  count(name: EventName) {
    return this.emitAsync.getCalls().filter(call => call.args[0] === name)
      .length;
  }
}
