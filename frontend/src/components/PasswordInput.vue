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
      <span class="pass-icons" aria-hidden="true">
        <span class="pass-ico pass-ico-off">
          <AppIcon name="seen" :size="16" />
        </span>
        <span class="pass-ico pass-ico-on">
          <AppIcon name="hidden" :size="16" />
        </span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.pass {
  position: relative;
  display: flex;
  overflow: hidden;
  border-radius: var(--radius-pill);
}
.pass input {
  padding-right: 2.6rem;
}
.pass-toggle {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 2.6rem;
  height: auto;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--muted);
  display: grid;
  place-items: center;
  transition: color var(--dur-2) var(--ease-out);
}
.pass-toggle:hover {
  color: var(--text);
  background: transparent;
}
.pass.shown .pass-toggle {
  color: var(--text);
}
.pass-icons {
  position: relative;
  width: 20px;
  height: 20px;
}
.pass-ico {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity var(--dur-1) linear;
}
.pass-ico-off {
  opacity: 1;
}
.pass.shown .pass-ico-off {
  opacity: 0;
}
.pass.shown .pass-ico-on {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .pass-toggle,
  .pass-ico {
    transition: none;
  }
}
</style>
