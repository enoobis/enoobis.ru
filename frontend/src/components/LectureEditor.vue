<script setup lang="ts">
import { nextTick, ref } from "vue";
import AppIcon from "./AppIcon.vue";
import MarkdownText from "./MarkdownText.vue";
import { uploadLectureAttachment } from "../api/courses";
import { useAuthStore } from "../stores/auth";

const body = defineModel<string>({ required: true });

const props = defineProps<{
  courseId: string;
}>();

const auth = useAuthStore();
const field = ref<HTMLTextAreaElement | null>(null);
const uploading = ref(false);
const err = ref("");

function insertAt(snippet: string, selectInside = false) {
  const el = field.value;
  if (!el) {
    body.value += snippet;
    return;
  }
  const start = el.selectionStart ?? body.value.length;
  const end = el.selectionEnd ?? start;
  const left = body.value.slice(0, start);
  const right = body.value.slice(end);
  body.value = `${left}${snippet}${right}`;
  void nextTick(() => {
    const from = left.length;
    const to = selectInside ? from + snippet.length : from + snippet.length;
    el.focus();
    el.setSelectionRange(from, to);
  });
}

function wrap(mark: string) {
  const el = field.value;
  if (!el) {
    body.value += `${mark}текст${mark}`;
    return;
  }
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? start;
  const left = body.value.slice(0, start);
  const selected = body.value.slice(start, end) || "текст";
  const right = body.value.slice(end);
  body.value = `${left}${mark}${selected}${mark}${right}`;
  void nextTick(() => {
    const from = left.length + mark.length;
    el.focus();
    el.setSelectionRange(from, from + selected.length);
  });
}

function heading() {
  const el = field.value;
  const start = el?.selectionStart ?? 0;
  const before = body.value.slice(0, start);
  const lead = before.length && !before.endsWith("\n") ? "\n" : "";
  insertAt(`${lead}## `);
}

async function addImage(file: File) {
  if (!auth.token || !file.type.startsWith("image/")) return;
  err.value = "";
  uploading.value = true;
  try {
    const r = await uploadLectureAttachment(props.courseId, file, auth.token);
    const name = file.name.replace(/\.[^.]+$/, "");
    insertAt(`\n![${name}](${r.url})\n`);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "не загрузилось";
  } finally {
    uploading.value = false;
  }
}

function onPick(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) void addImage(file);
}

function onDrop(ev: DragEvent) {
  ev.preventDefault();
  const files = Array.from(ev.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
  for (const f of files) void addImage(f);
}

function onPaste(ev: ClipboardEvent) {
  const items = ev.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (!item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (!file) continue;
    ev.preventDefault();
    void addImage(file);
  }
}
</script>

<template>
  <div class="lec-edit">
    <div class="tools" role="toolbar" aria-label="текст">
      <button type="button" class="tool" aria-label="жирный" @click="wrap('**')">
        <AppIcon name="bold" :size="16" />
      </button>
      <button type="button" class="tool" aria-label="курсив" @click="wrap('*')">
        <AppIcon name="italic" :size="16" />
      </button>
      <button type="button" class="tool" aria-label="заголовок" @click="heading">
        <AppIcon name="heading" :size="16" />
      </button>
      <label class="tool" :aria-label="uploading ? 'загрузка' : 'фото'">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="onPick" />
        <AppIcon name="image" :size="16" />
      </label>
    </div>
    <p v-if="err" class="error">{{ err }}</p>
    <div class="split">
      <textarea
        ref="field"
        v-model="body"
        class="write"
        spellcheck="false"
        placeholder="текст"
        @drop="onDrop"
        @dragover.prevent
        @paste="onPaste"
      />
      <div class="see">
        <MarkdownText v-if="body.trim()" :text="body" variant="doc" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.lec-edit {
  display: grid;
  gap: 0.55rem;
  min-height: 0;
}

.tools {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}

.tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.tool:hover {
  background: var(--surface);
  color: var(--text);
}

.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  min-height: 0;
  flex: 1;
}

.write,
.see {
  min-height: 22rem;
  min-width: 0;
}

.write {
  width: 100%;
  resize: vertical;
  line-height: 1.65;
  font-family: var(--mono);
  font-size: 0.95rem;
}

.see {
  overflow: auto;
  padding: 0.2rem 0.15rem 1rem;
}

.error {
  margin: 0;
  font-size: var(--text-sm);
}
</style>
