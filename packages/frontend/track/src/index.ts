import { enableAutoTrack, makeTracker } from './auto';
import { mixpanel } from './mixpanel';

export const track = makeTracker((event, props) => {
  mixpanel.track(event, props);
});

export { enableAutoTrack, mixpanel };
export default track;
