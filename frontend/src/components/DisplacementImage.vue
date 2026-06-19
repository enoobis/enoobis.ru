<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { displacementMapDataUrl } from "../utils/displacementMap";
import { prefersReducedMotion } from "../utils/reducedMotion";

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    enabled?: boolean;
    intensity?: number;
  }>(),
  {
    alt: "",
    enabled: true,
    intensity: 0.28,
  },
);

const root = ref<HTMLElement | null>(null);
const webglReady = ref(false);
const webglFailed = ref(false);
let instance: { destroy?: () => void } | null = null;
let loading = false;

const reduced = computed(() => prefersReducedMotion());
const showFallback = computed(() => !props.enabled || reduced.value || webglFailed.value);

async function mountEffect() {
  if (loading || !root.value || !props.src || !props.enabled || reduced.value) return;
  loading = true;
  webglFailed.value = false;
  webglReady.value = false;
  destroyEffect();
  try {
    const [{ default: hoverEffect }] = await Promise.all([import("hover-effect")]);
    const host = root.value;
    const map = displacementMapDataUrl();
    if (!map || !host) return;
    instance = hoverEffect({
      parent: host,
      image1: props.src,
      image2: props.src,
      displacementImage: map,
      intensity: props.intensity,
      imagesRatio: host.offsetHeight / Math.max(host.offsetWidth, 1) || 1,
    });
    webglReady.value = true;
  } catch {
    webglFailed.value = true;
    instance = null;
  } finally {
    loading = false;
  }
}

function destroyEffect() {
  instance?.destroy?.();
  instance = null;
  if (root.value) root.value.innerHTML = "";
  webglReady.value = false;
}

onMounted(() => {
  if (!showFallback.value) void mountEffect();
});

onUnmounted(destroyEffect);

watch(
  () => [props.src, props.enabled, reduced.value] as const,
  () => {
    if (showFallback.value) {
      destroyEffect();
      webglFailed.value = false;
      return;
    }
    void mountEffect();
  },
);
</script>

<template>
  <div ref="root" class="displacement-image">
    <img
      v-if="showFallback"
      :src="src"
      :alt="alt"
      class="displacement-fallback"
      loading="lazy"
    />
  </div>
</template>

<style scoped>
.displacement-image {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--surface);
}

.displacement-image :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover;
}

.displacement-fallback {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
