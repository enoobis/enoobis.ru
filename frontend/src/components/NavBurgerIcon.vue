<script setup lang="ts">
defineProps<{
  open: boolean;
}>();
</script>

<template>
  <span class="nav-burger-icon" :class="{ open }" aria-hidden="true">
    <span class="nav-burger-line" />
    <span class="nav-burger-line" />
    <span class="nav-burger-line" />
  </span>
</template>

<style scoped>
.nav-burger-icon {
  position: relative;
  display: block;
  width: 18px;
  height: 14px;
}

.nav-burger-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
  transition:
    transform var(--dur-2) var(--ease-out),
    top var(--dur-2) var(--ease-out),
    opacity var(--dur-2) var(--ease-out);
}

.nav-burger-line:nth-child(1) {
  top: 0;
}

.nav-burger-line:nth-child(2) {
  top: 6px;
}

.nav-burger-line:nth-child(3) {
  top: 12px;
}

.nav-burger-icon.open .nav-burger-line:nth-child(1) {
  top: 6px;
  transform: rotate(45deg);
}

.nav-burger-icon.open .nav-burger-line:nth-child(2) {
  opacity: 0;
}

.nav-burger-icon.open .nav-burger-line:nth-child(3) {
  top: 6px;
  transform: rotate(-45deg);
}

@media (prefers-reduced-motion: reduce) {
  .nav-burger-line {
    transition: none;
  }
}
</style>
