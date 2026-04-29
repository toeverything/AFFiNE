<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{
  name: string;
  icon?: string;
}>();

const src = computed(() => {
  if (props.icon) return props.icon;
  return `https://raw.githubusercontent.com/PKief/vscode-material-icon-theme/main/icons/${props.name.toLowerCase()}.svg`;
});
</script>

<template>
  <img :src="src" :alt="`${name} Logo`" />
</template>

<style scoped>
img {
  display: inline;
  transform: translateY(5px);
  margin-right: 8px;
  width: 20px;
}
</style>
