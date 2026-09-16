<script setup lang="ts">
import { ref } from "vue";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
  autocomplete?: string;
  minlength?: number;
  required?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [string] }>();

const shown = ref(false);
</script>

<template>
  <div class="pass" :class="{ shown }">
    <input
      :value="props.modelValue"
      :type="shown ? 'text' : 'password'"
      :placeholder="props.placeholder"
      :autocomplete="props.autocomplete"
      :minlength="props.minlength"
      :required="props.required"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      type="button"
      class="pass-toggle"
      :aria-label="shown ? 'скрыть пароль' : 'показать пароль'"
      :aria-pressed="shown"
      @click="shown = !shown"
    >
      <Transition name="pass-icon" mode="out-in">
        <AppIcon :key="shown ? 'on' : 'off'" :name="shown ? 'hidden' : 'seen'" :size="18" />
      </Transition>
    </button>
  </div>
</template>

<style scoped>
.pass {
  position: relative;
  display: flex;
}
.pass input {
  padding-right: calc(var(--input-pad-x) + 1.9rem);
}
.pass-toggle {
  position: absolute;
  top: 50%;
  right: 0.45rem;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  min-height: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted);
  transition:
    color var(--dur-2) var(--ease-out),
    background var(--dur-2) var(--ease-out);
}
.pass-toggle:hover {
  color: var(--text);
  background: var(--hover-surface);
}
.pass.shown .pass-toggle {
  color: var(--text);
}
.pass-icon-enter-active,
.pass-icon-leave-active {
  transition:
    opacity var(--dur-1) var(--ease-out),
    transform var(--dur-2) var(--ease-spring);
}
.pass-icon-enter-from {
  opacity: 0;
  transform: scale(0.7);
}
.pass-icon-leave-to {
  opacity: 0;
  transform: scale(1.25);
}
@media (prefers-reduced-motion: reduce) {
  .pass-toggle,
  .pass-icon-enter-active,
  .pass-icon-leave-active {
    transition: none;
  }
}
</style>
