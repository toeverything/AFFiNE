import { allEvents as events } from './events';
import { allHandlers as handlers } from './handlers';

// this will be used by preload script to expose all handlers and events to the renderer process
// - register in exposeInMainWorld in preload
// - provide type hints
export { events, handlers };
