<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

withDefaults(
  defineProps<{
    upCount?: number;
    downCount?: number;
    commentCount?: number;
  }>(),
  { upCount: 0, downCount: 0, commentCount: 0 },
);

const ICON = 12;
</script>

<template>
  <span v-if="upCount || downCount || commentCount" class="post-meta-stats">
    <span v-if="upCount || downCount" class="stat">
      <AppIcon name="voteUp" :size="ICON" />
      <span class="nums">
        <span v-if="upCount">{{ upCount }}</span>
        <span v-if="upCount && downCount" class="sep">·</span>
        <span v-if="downCount">{{ downCount }}</span>
      </span>
      <AppIcon v-if="downCount" name="voteDown" :size="ICON" />
    </span>
    <span v-if="commentCount" class="stat">
      <AppIcon name="comment" :size="ICON" />
      <span>{{ commentCount }}</span>
    </span>
  </span>
</template>

<style scoped>
.post-meta-stats {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 0.12rem;
  line-height: 1;
}
.nums {
  font-variant-numeric: tabular-nums;
  font-size: 0.78rem;
}
.sep {
  opacity: 0.45;
}
.stat > span:last-child {
  font-size: 0.78rem;
}
</style>
