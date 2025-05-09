import { enableAutoTrack, makeTracker } from './auto';
import { type Events } from './events';
import { mixpanel } from './mixpanel';
import { sentry } from './sentry';
export const track = makeTracker((event, props) => {
  mixpanel.track(event, props);
});

export { enableAutoTrack, type Events, mixpanel, sentry };
export default track;
