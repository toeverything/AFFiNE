<template>
  <h1>BlockSuite Blog</h1>
  <div class="blog-posts-container">
    <div class="blog-post" v-for="post in posts">
      <a :href="post.url">
        <h2 class="blog-post-title">{{ post.title }}</h2>
      </a>
      <div class="blog-post-excerpt">
        {{ post.excerpt }}
        <a class="blog-post-read-more" :href="post.url">Read more →</a>
      </div>
      <div class="blog-post-date">{{ post.date.formatted }}</div>
    </div>
  </div>
</template>

<script setup>
import { usePosts } from '../composables/use-posts';

const { posts } = usePosts();
</script>

<style scoped>
h1 {
  margin: auto;
  margin-top: 30px;
  margin-bottom: 50px;
  font-size: 50px;
  font-weight: bolder;
  line-height: 50px;
  text-align: center;
}

@media (max-width: 768px) {
  h1 {
    font-size: 40px;
    line-height: 40px;
  }
}

.blog-posts-container {
  max-width: 800px;
  margin: auto;
  padding-left: 30px;
  padding-right: 30px;
}

.blog-post {
  margin-bottom: 40px;
  padding-bottom: 20px;
  border-bottom: 1px solid #eaecef;
}

.blog-post-title {
  margin: 0;
  font-size: 24px;
  font-weight: bold;
  color: var(--vp-c-text-1);
}

.blog-post-date {
  font-size: 14px;
  color: var(--vp-c-text-3);
}

.blog-post-excerpt {
  margin-top: 10px;
  margin-bottom: 5px;
  line-height: 1.6;
}

.dark .blog-post {
  border-bottom: 1px solid #343a40;
}

.blog-post-read-more:hover {
  text-decoration: underline;
}
</style>
