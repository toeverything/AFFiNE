<template>
  <div class="blog-post-meta">
    <span class="post-date">{{ post.date.formatted }}</span> by
    <span v-html="formattedAuthors"></span>
  </div>
</template>

<script setup>
import { computed } from 'vue';

import { usePosts } from '../composables/use-posts';

const { post } = usePosts();

const formattedAuthors = computed(() => {
  return post.value.authors
    .map(
      author =>
        `<a class="author" href="${author.link}" target="_blank">${author.name}</a>`
    )
    .join(', ');
});
</script>

<style>
.blog-post-meta {
  margin-top: 8px;
  font-size: 14px;
}
.author {
  color: var(--vp-c-text-1) !important;
}
.post-date {
  color: var(--vp-c-text-2);
}
</style>
