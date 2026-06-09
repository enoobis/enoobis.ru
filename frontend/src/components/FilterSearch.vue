<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import AppIcon from "./AppIcon.vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    active?: boolean;
    autofocus?: boolean;
  }>(),
  { placeholder: "поиск", active: false, autofocus: false },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  input: [value: string];
  enter: [];
}>();

const inputEl = ref<HTMLInputElement | null>(null);

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit("update:modelValue", value);
  emit("input", value);
}

onMounted(async () => {
  if (props.autofocus) {
    await nextTick();
    inputEl.value?.focus();
  }
});

defineExpose({ focus: () => inputEl.value?.focus() });
</script>

<template>
  <div class="filter-search" :class="{ active }">
    <AppIcon name="search" :size="18" />
    <input
      ref="inputEl"
      :value="modelValue"
      type="search"
      :placeholder="placeholder"
      @input="onInput"
      @keydown.enter.prevent="emit('enter')"
    />
    <slot />
  </div>
</template>
