<template>
  <!-- 'code-options' is a build-in prop, do not edit it -->
  <Sandbox
    :rtl="rtl"
    :template="'vanilla-ts'"
    :light-theme="lightTheme"
    :dark-theme="darkTheme"
    :options="{
      ...props, // do not forget it
      coderHeight: Number(props.coderHeight),
      previewHeight: Number(props.previewHeight),
      showLineNumbers: true,
    }"
    :custom-setup="{
      ...props, // do not forget it
      deps: {
        yjs: 'latest',
        '@toeverything/theme': 'latest',
        '@blocksuite/presets': 'canary',
      },
    }"
    :code-options="codeOptions"
  >
    <slot />
  </Sandbox>
</template>

<script setup lang="ts">
import { Sandbox, sandboxProps } from 'vitepress-plugin-sandpack';

const props = defineProps({
  ...sandboxProps,
  coderHeight: String,
  previewHeight: String,
});
</script>
