import { createApp, h } from 'vue';

export const app = createApp({
  render() {
    return h(
      'div', // type
      { id: 'foo', class: 'bar' }, // props
      ['hello, world, this is Vue']
    );
  },
});
