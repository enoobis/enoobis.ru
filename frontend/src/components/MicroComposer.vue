<script setup lang="ts">
import { computed, ref } from "vue";
import { createMicro, uploadMicroImage, type MicroPost } from "../api/micro";
import { useAuthStore } from "../stores/auth";

const props = defineProps<{
  parentId?: string | null;
  placeholder?: string;
  autofocus?: boolean;
}>();

const emit = defineEmits<{
  (e: "posted", post: MicroPost): void;
}>();

const auth = useAuthStore();
const body = ref("");
const imageUrl = ref("");
const sending = ref(false);
const uploading = ref(false);
const dragOver = ref(false);
const err = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

const limit = 480;
const remaining = computed(() => limit - body.value.length);
const canSend = computed(
  () =>
    !sending.value &&
    !uploading.value &&
    (body.value.trim().length > 0 || imageUrl.value.length > 0) &&
    remaining.value >= 0,
);

async function send() {
  if (!auth.token || !canSend.value) return;
  err.value = "";
  sending.value = true;
  try {
    const post = await createMicro(auth.token, {
      body: body.value.trim(),
      image_url: imageUrl.value || undefined,
      parent_id: props.parentId ?? null,
    });
    body.value = "";
    imageUrl.value = "";
    emit("posted", post);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    sending.value = false;
  }
}

async function uploadFile(file: File) {
  if (!auth.token) return;
  if (!file.type.startsWith("image/")) {
    err.value = "только картинки";
    return;
  }
  err.value = "";
  uploading.value = true;
  try {
    const r = await uploadMicroImage(file, auth.token);
    imageUrl.value = r.url;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка загрузки";
  } finally {
    uploading.value = false;
  }
}

function onPick() {
  fileInput.value?.click();
}

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void uploadFile(f);
  if (fileInput.value) fileInput.value.value = "";
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (f) void uploadFile(f);
}

function onPaste(e: ClipboardEvent) {
  const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
  const f = item?.getAsFile();
  if (f) {
    e.preventDefault();
    void uploadFile(f);
  }
}

function clearImage() {
  imageUrl.value = "";
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    void send();
  }
}
</script>

<template>
  <div
    class="composer"
    :class="{ drag: dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <textarea
      v-model="body"
      :placeholder="placeholder ?? 'текст'"
      rows="2"
      :autofocus="autofocus"
      :maxlength="limit"
      @keydown="onKeydown"
      @paste="onPaste"
    />

    <div v-if="imageUrl" class="preview">
      <img :src="imageUrl" alt="" />
      <button type="button" class="remove" title="убрать" @click="clearImage">×</button>
    </div>

    <div class="row">
      <button class="ghost" type="button" :disabled="uploading" :title="'добавить картинку'" @click="onPick">
        {{ uploading ? "загрузка…" : "+ картинка" }}
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        hidden
        @change="onFile"
      />
      <span class="counter muted small" :class="{ over: remaining < 0 }">{{ remaining }}</span>
      <button type="button" :disabled="!canSend" @click="send">
        {{ sending ? "…" : parentId ? "ответить" : "опубликовать" }}
      </button>
    </div>
    <p v-if="err" class="error small">{{ err }}</p>
  </div>
</template>

<style scoped>
.composer {
  display: grid;
  gap: 0.5rem;
  padding: 0.7rem 0;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s ease;
}
.composer.drag {
  background: var(--surface);
  border-radius: var(--radius);
  border-bottom-color: transparent;
  outline: 1px dashed var(--text);
  outline-offset: -2px;
}
textarea {
  resize: none;
  border: none;
  background: transparent;
  padding: 0;
  font-size: 1rem;
  line-height: 1.5;
  min-height: 2.75rem;
}
textarea::placeholder {
  color: var(--muted);
}
textarea:focus {
  outline: none;
}
.preview {
  position: relative;
  display: inline-block;
  max-width: 240px;
}
.preview img {
  max-width: 100%;
  max-height: 180px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  display: block;
}
.remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  min-height: 22px;
  padding: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.7);
  color: var(--text);
  border: none;
  font-size: 0.9rem;
  line-height: 1;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.ghost {
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 0;
  min-height: 0;
  font-size: 0.82rem;
}
.ghost:hover:not(:disabled) {
  background: transparent;
  color: var(--text);
}
.counter {
  margin-left: auto;
}
.counter.over {
  color: var(--danger);
}
.small {
  font-size: 0.78rem;
}
button[type="button"]:not(.ghost):not(.remove) {
  padding: 0.35rem 0.85rem;
  min-height: 40px;
  border-radius: 999px;
  font-size: 0.85rem;
}
@media (max-width: 640px) {
  textarea {
    font-size: 16px;
  }
}
</style>
