<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
</script>

<template>
  <el-button @click="count++">
    {{ count }}
  </el-button>
</template>

<style scoped></style>
