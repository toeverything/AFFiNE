import { useRoute } from 'vitepress';
import { computed } from 'vue';

import { data as posts } from './posts.data';

export function usePosts() {
  const route = useRoute();
  const path = route.path;

  function findCurrentIndex() {
    const result = posts.findIndex(p => p.url === route.path);
    if (result === -1) console.error(`blog post missing: ${route.path}`);
    return result;
  }

  const post = computed(() => posts[findCurrentIndex()]);

  return { posts, post, path };
}
