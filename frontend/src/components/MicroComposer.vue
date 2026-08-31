<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { createMicro, uploadMicroImage, type MicroPost } from "../api/micro";
import { useAuthStore } from "../stores/auth";
import { useSessionStore } from "../stores/session";

const props = defineProps<{
  parentId?: string | null;
  placeholder?: string;
  autofocus?: boolean;
  connected?: boolean;
}>();

const emit = defineEmits<{
  (e: "posted", post: MicroPost): void;
}>();

const auth = useAuthStore();
const session = useSessionStore();
const body = ref("");
const imageUrl = ref("");
const sending = ref(false);
const uploading = ref(false);
const dragOver = ref(false);
const err = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const wrap = ref<HTMLElement | null>(null);
const area = ref<HTMLTextAreaElement | null>(null);

const expanded = ref(false);
const open = computed(() => expanded.value || !!props.parentId);
const initials = computed(() => (auth.nickname || "?").slice(0, 2));
const avatarBroken = ref(false);

function grow() {
  const el = area.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function onFocusOut(e: FocusEvent) {
  const next = e.relatedTarget as Node | null;
  if (next && wrap.value?.contains(next)) return;
  if (!body.value.trim() && !imageUrl.value) expanded.value = false;
}

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
    expanded.value = false;
    void nextTick(grow);
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
    ref="wrap"
    class="composer"
    :class="{ drag: dragOver, open, connected }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
    @focusout="onFocusOut"
  >
    <div class="rail">
      <span class="avatar">
        <img
          v-if="session.avatarUrl && !avatarBroken"
          :src="session.avatarUrl"
          alt=""
          @error="avatarBroken = true"
        />
        <span v-else>{{ initials }}</span>
      </span>
      <span v-if="connected" class="thread-line" aria-hidden="true" />
    </div>

    <div class="field">
      <textarea
        ref="area"
        v-model="body"
        :placeholder="placeholder ?? 'что нового?'"
        rows="1"
        :autofocus="autofocus"
        :maxlength="limit"
        @focus="expanded = true"
        @input="grow"
        @keydown="onKeydown"
        @paste="onPaste"
      />

      <div v-if="imageUrl" class="preview">
        <img :src="imageUrl" alt="" />
        <button type="button" class="remove" title="убрать" @click="clearImage">×</button>
      </div>

      <div v-if="open" class="row">
        <button class="ghost" type="button" :disabled="uploading" title="добавить картинку" @click="onPick">
          {{ uploading ? "загрузка…" : "картинка" }}
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          hidden
          @change="onFile"
        />
        <span v-if="remaining < 60" class="counter" :class="{ over: remaining < 0 }">
          {{ remaining }}
        </span>
        <button type="button" :disabled="!canSend" @click="send">
          {{ sending ? "…" : parentId ? "ответить" : "опубликовать" }}
        </button>
      </div>
      <p v-if="err" class="error small">{{ err }}</p>
    </div>
  </div>
</template>

<style scoped>
.composer {
  display: grid;
  grid-template-columns: var(--avatar-md) 1fr;
  gap: 0.75rem;
  padding: 0.9rem 0;
  border-bottom: 1px solid var(--border);
}
.composer.connected {
  padding-bottom: 0;
  border-bottom: none;
}
.composer.drag {
  outline: 1px dashed var(--text);
  outline-offset: 0.25rem;
}

.rail {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
.thread-line {
  position: absolute;
  top: calc(var(--avatar-md) + 0.5rem);
  bottom: -0.9rem;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--hover-border);
}
.avatar {
  width: var(--avatar-md);
  height: var(--avatar-md);
  flex: 0 0 var(--avatar-md);
  border-radius: var(--avatar-radius);
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--surface);
  color: var(--muted);
  font-weight: 500;
  font-size: 0.78rem;
  text-transform: lowercase;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--avatar-radius);
}

.field {
  min-width: 0;
  display: grid;
  gap: 0.5rem;
  align-content: start;
}
textarea {
  resize: none;
  overflow: hidden;
  border: none;
  background: transparent;
  padding: 0;
  font-size: 1rem;
  line-height: 1.6;
  min-height: 1.75rem;
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
  margin-right: auto;
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 0;
  min-height: 0;
  font-size: var(--text-sm);
}
.ghost:hover:not(:disabled) {
  background: transparent;
  color: var(--text);
}
.counter {
  color: var(--muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.counter.over {
  color: var(--text);
}
.small {
  font-size: var(--text-sm);
}
button[type="button"]:not(.ghost):not(.remove) {
  padding: 0.4rem 0.95rem;
  min-height: 36px;
  border-radius: 999px;
  font-size: 0.88rem;
  font-weight: 600;
  background: var(--text);
  color: var(--bg);
  border: 1px solid var(--text);
}
button[type="button"]:not(.ghost):not(.remove):disabled {
  opacity: 0.35;
  background: var(--surface2);
  color: var(--muted);
  border-color: var(--border);
}
@media (max-width: 640px) {
  textarea {
    font-size: 16px;
  }
}
</style>
