<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import AppLoading from "../components/AppLoading.vue";
import MarkdownText from "../components/MarkdownText.vue";
import {
  deleteAssignment,
  deleteLecture,
  getClassroom,
  patchLecture,
  reorderLectures,
  submitAssignment,
  uploadSubmissionFile,
  type Assignment,
  type CourseClassroom,
  type Lecture,
  type SubmissionAttachment,
} from "../api/courses";
import {
  askCourseTutor,
  clearChatHistory,
  getAiStatus,
  getChatHistory,
  type AiChatMessage,
  type AiStatus,
} from "../api/ai";
import { useAuthStore } from "../stores/auth";

type VideoEmbed =
  | { kind: "iframe"; src: string }
  | { kind: "video"; src: string }
  | { kind: "link"; href: string }
  | null;

function videoEmbed(url: string): VideoEmbed {
  const u = (url ?? "").trim();
  if (!u) return null;
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  if (yt) return { kind: "iframe", src: `https://www.youtube.com/embed/${yt[1]}` };
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: "iframe", src: `https://player.vimeo.com/video/${vm[1]}` };
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(u)) return { kind: "video", src: u };
  if (u.startsWith("http://") || u.startsWith("https://")) return { kind: "link", href: u };
  return null;
}

const AI_ERRORS: Record<string, string> = {
  daily_limit: "лимит на сегодня исчерпан",
  ai_disabled: "нет ключа gemini",
  ai_key_invalid: "ключ gemini неверный",
  ai_key_forbidden: "ключ не даёт доступ к generative language api",
  ai_region_blocked: "gemini не работает из региона сервера",
  ai_model_missing: "такой модели нет",
  ai_bad_request: "gemini отклонил запрос",
  ai_rate_limited: "gemini перегружен, попробуй позже",
  ai_unreachable: "gemini недоступен",
  ai_upstream: "сбой на стороне google",
  ai_empty: "пустой ответ",
  ai_bad_json: "модель вернула не json",
  ai_failed: "gemini вернул ошибку",
  too_many_requests: "слишком часто, подожди минуту",
};

function errorText(e: unknown): string {
  if (!(e instanceof Error)) return "ошибка";
  const base = AI_ERRORS[e.message] ?? e.message;
  const detail = (e as Error & { detail?: string }).detail;
  return detail ? `${base}: ${detail}` : base;
}

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const courseId = computed(() => String(route.params.courseId ?? ""));
const classroom = ref<CourseClassroom | null>(null);
const loading = ref(false);
const err = ref("");
const activeId = ref("");

const topicsOpen = ref(false);
const chatOpen = ref(false);

const lectures = computed(() => classroom.value?.lectures ?? []);
const isTeacher = computed(() => classroom.value?.is_teacher === true);

const activeLecture = computed<Lecture | null>(
  () => lectures.value.find((l) => l.id === activeId.value) ?? null,
);

type Chapter = { title: string; book: string; offset: number; lectures: Lecture[] };

/* главы идут подряд, поэтому режем плоский список по смене book+chapter */
const chapters = computed<Chapter[]>(() => {
  const out: Chapter[] = [];
  lectures.value.forEach((l, i) => {
    const book = (l.book ?? "").trim();
    const title = (l.chapter ?? "").trim();
    const last = out[out.length - 1];
    if (last && last.book === book && last.title === title) last.lectures.push(l);
    else out.push({ title, book, offset: i, lectures: [l] });
  });
  return out;
});

const hasBooks = computed(() => chapters.value.some((c) => c.book));
const activeChapter = computed(() => (activeLecture.value?.chapter ?? "").trim());
const activeBook = computed(() => (activeLecture.value?.book ?? "").trim());
const openChapter = ref("");
const openBook = ref("");

function toggleChapter(title: string) {
  openChapter.value = openChapter.value === title ? "" : title;
}

function toggleBook(title: string) {
  if (openBook.value === title) {
    openBook.value = "";
    return;
  }
  openBook.value = title;
  const first = chapters.value.find((c) => c.book === title);
  if (first?.title) openChapter.value = first.title;
}

function isBookStart(ci: number): boolean {
  const ch = chapters.value[ci];
  if (!ch?.book) return false;
  return chapters.value[ci - 1]?.book !== ch.book;
}

function bookOpen(book: string): boolean {
  if (!hasBooks.value || !book) return true;
  return openBook.value === book;
}

watch(activeChapter, (title) => {
  if (title) openChapter.value = title;
});

watch(activeBook, (title) => {
  if (title) openBook.value = title;
});

const contentBooks = computed(() => {
  const out: { title: string; chapters: Chapter[] }[] = [];
  for (const ch of chapters.value) {
    const last = out[out.length - 1];
    if (last && last.title === ch.book) last.chapters.push(ch);
    else out.push({ title: ch.book, chapters: [ch] });
  }
  return out;
});

const activeIndex = computed(() =>
  activeLecture.value ? lectures.value.findIndex((l) => l.id === activeLecture.value?.id) : -1,
);

const prevLecture = computed(() =>
  activeIndex.value > 0 ? lectures.value[activeIndex.value - 1] ?? null : null,
);

const nextLecture = computed(() => {
  const i = activeIndex.value;
  if (i < 0 || i >= lectures.value.length - 1) return null;
  return lectures.value[i + 1] ?? null;
});

function tasksFor(lectureId: string): Assignment[] {
  return (classroom.value?.assignments ?? []).filter((a) => a.lecture_id === lectureId);
}

function lectureDone(lectureId: string): boolean {
  const tasks = tasksFor(lectureId);
  if (!tasks.length) return false;
  return tasks.every((a) => !!a.my_submission);
}

async function load() {
  if (!auth.token || !courseId.value) return;
  loading.value = true;
  err.value = "";
  try {
    classroom.value = await getClassroom(courseId.value, auth.token);
    const wanted = String(route.query.lecture ?? "");
    const exists = classroom.value.lectures.some((l) => l.id === wanted);
    activeId.value = exists ? wanted : "";
    openChapter.value = activeChapter.value;
  } catch (e) {
    err.value = errorText(e);
  } finally {
    loading.value = false;
    void nextTick(measureReaderTop);
  }
}

const readerRef = ref<HTMLElement | null>(null);
const mainRef = ref<HTMLElement | null>(null);

/* высота читалки = экран минус её отступ сверху, замеряем по факту */
function measureReaderTop() {
  const el = readerRef.value;
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY;
  el.style.setProperty("--reader-top", `${Math.round(top) + 24}px`);
}

/* клавиатура телефона не должна прятать поле ввода чата */
function syncKeyboardInset() {
  const el = readerRef.value;
  const vv = window.visualViewport;
  if (!el || !vv) return;
  const inset = window.innerHeight - vv.height - vv.offsetTop;
  /* меньше 120px — это схлопнувшаяся панель браузера, а не клавиатура */
  el.style.setProperty("--kb", inset > 120 ? `${Math.round(inset)}px` : "0px");
}

function scrollMainTop() {
  if (mainRef.value) mainRef.value.scrollTop = 0;
  window.scrollTo({ top: 0 });
}

function openLecture(id: string) {
  activeId.value = id;
  topicsOpen.value = false;
  editing.value = null;
  void router.replace({ query: { ...route.query, lecture: id } });
  scrollMainTop();
}

function openContents() {
  activeId.value = "";
  topicsOpen.value = false;
  editing.value = null;
  openChapter.value = "";
  void router.replace({ query: { ...route.query, lecture: undefined } });
  scrollMainTop();
}

/* ---------- перетаскивание тем (преподаватель) ---------- */

const topicListRef = ref<HTMLElement | null>(null);
const dragIndex = ref(-1);
const dragChapter = ref(-1);
const landedId = ref("");
const dragging = computed(() => dragIndex.value >= 0);

let pressIndex = -1;
let pressChapter = -1;
let pressY = 0;
let pressTimer = 0;
let orderBefore: string[] = [];
let dragged = false;

/* порядок меняем только внутри главы: иначе тема уезжает в чужой раздел */
function rowTops(): number[] {
  const rows =
    topicListRef.value?.querySelectorAll<HTMLElement>(
      `.topic-row[data-chapter="${dragChapter.value}"]`,
    ) ?? [];
  return Array.from(rows).map((el) => {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  });
}

function blockTouchScroll(e: TouchEvent) {
  if (dragging.value) e.preventDefault();
}

function beginDrag(index: number, chapter: number) {
  dragIndex.value = index;
  dragChapter.value = chapter;
  dragged = true;
  orderBefore = lectures.value.map((l) => l.id);
  document.addEventListener("touchmove", blockTouchScroll, { passive: false });
}

function endPress() {
  window.clearTimeout(pressTimer);
  pressIndex = -1;
  pressChapter = -1;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);
  document.removeEventListener("touchmove", blockTouchScroll);
}

function onTopicPointerDown(e: PointerEvent, index: number, chapter: number) {
  if (!isTeacher.value || e.button > 0) return;
  pressIndex = index;
  pressChapter = chapter;
  pressY = e.clientY;
  dragged = false;
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  /* палец: тянем после удержания, чтобы список можно было листать */
  if (e.pointerType !== "mouse") {
    pressTimer = window.setTimeout(() => {
      if (pressIndex >= 0) beginDrag(pressIndex, pressChapter);
    }, 280);
  }
}

function onPointerMove(e: PointerEvent) {
  if (pressIndex < 0 || !classroom.value) return;
  if (!dragging.value) {
    const far = Math.abs(e.clientY - pressY) > 6;
    if (!far) return;
    if (e.pointerType !== "mouse") {
      window.clearTimeout(pressTimer);
      endPress();
      return;
    }
    beginDrag(pressIndex, pressChapter);
  }

  const offset = chapters.value[dragChapter.value]?.offset ?? 0;
  const tops = rowTops();
  let to = tops.findIndex((mid) => e.clientY < mid);
  if (to < 0) to = tops.length - 1;
  if (to < 0 || to === dragIndex.value) return;

  const list = [...lectures.value];
  const [moved] = list.splice(offset + dragIndex.value, 1);
  list.splice(offset + to, 0, moved);
  classroom.value = { ...classroom.value, lectures: list };
  dragIndex.value = to;
}

function onPointerUp() {
  const wasDragging = dragging.value;
  const offset = chapters.value[dragChapter.value]?.offset ?? 0;
  const movedId = wasDragging ? lectures.value[offset + dragIndex.value]?.id : "";
  dragIndex.value = -1;
  dragChapter.value = -1;
  endPress();
  if (!wasDragging) return;
  landedId.value = movedId ?? "";
  window.setTimeout(() => {
    if (landedId.value === movedId) landedId.value = "";
  }, 1000);
  void saveOrder();
}

async function saveOrder() {
  if (!auth.token || !classroom.value) return;
  const ids = lectures.value.map((l) => l.id);
  if (ids.join() === orderBefore.join()) return;
  err.value = "";
  try {
    await reorderLectures(classroom.value.course.id, ids, auth.token);
  } catch (e) {
    err.value = errorText(e);
    await load();
  }
}

function onTopicClick(id: string) {
  if (dragged) {
    dragged = false;
    return;
  }
  openLecture(id);
}

async function downloadLecture() {
  const l = activeLecture.value;
  if (!l) return;
  err.value = "";
  try {
    const { downloadLectureDocx } = await import("../utils/lectureDocx");
    await downloadLectureDocx(l.title, l.body_text);
  } catch {
    err.value = "не вышло собрать документ";
  }
}

function exitReader() {
  void router.push(`/courses/${courseId.value}/lectures`);
}

/* ---------- сдача задания ---------- */

const answer = ref<Record<string, string>>({});
const pendingFiles = ref<Record<string, File[]>>({});
const sending = ref<Record<string, boolean>>({});
const openTaskId = ref("");

function toggleTask(id: string) {
  openTaskId.value = openTaskId.value === id ? "" : id;
}

function pickFiles(taskId: string, ev: Event) {
  const input = ev.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  const bucket = pendingFiles.value[taskId] ?? [];
  for (const f of files) {
    if (bucket.length >= 10) break;
    if (f.size > 2 * 1024 * 1024) {
      err.value = `${f.name}: больше 2 мб`;
      continue;
    }
    bucket.push(f);
  }
  pendingFiles.value[taskId] = bucket;
}

function dropFile(taskId: string, idx: number) {
  pendingFiles.value[taskId]?.splice(idx, 1);
}

async function submitTask(a: Assignment) {
  if (!auth.token || !classroom.value) return;
  const content = (answer.value[a.id] ?? "").trim();
  const files = pendingFiles.value[a.id] ?? [];
  if (!content && !files.length) return;
  sending.value[a.id] = true;
  err.value = "";
  try {
    const uploaded: Omit<SubmissionAttachment, "id" | "created_at">[] = [];
    for (const file of files) {
      const r = await uploadSubmissionFile(classroom.value.course.id, a.id, file, auth.token);
      uploaded.push({
        file_name: r.file_name,
        url: r.url,
        size_bytes: r.size_bytes,
        mime_type: r.mime_type,
      });
    }
    await submitAssignment(classroom.value.course.id, a.id, content, auth.token, uploaded);
    answer.value[a.id] = "";
    pendingFiles.value[a.id] = [];
    await load();
  } catch (e) {
    err.value = errorText(e);
  } finally {
    sending.value[a.id] = false;
  }
}

/* ---------- правка темы (преподаватель) ---------- */

const editing = ref<{ id: string; title: string; body_text: string; video_url: string } | null>(
  null,
);
const savingEdit = ref(false);

function startEdit() {
  const l = activeLecture.value;
  if (!l) return;
  editing.value = {
    id: l.id,
    title: l.title,
    body_text: l.body_text,
    video_url: l.video_url,
  };
}

async function saveEdit() {
  if (!auth.token || !classroom.value || !editing.value) return;
  savingEdit.value = true;
  err.value = "";
  try {
    await patchLecture(
      classroom.value.course.id,
      editing.value.id,
      {
        title: editing.value.title.trim(),
        body_text: editing.value.body_text,
        video_url: editing.value.video_url.trim(),
      },
      auth.token,
    );
    editing.value = null;
    await load();
  } catch (e) {
    err.value = errorText(e);
  } finally {
    savingEdit.value = false;
  }
}

async function removeLecture() {
  if (!auth.token || !classroom.value || !editing.value || savingEdit.value) return;
  const tasks = tasksFor(editing.value.id).length;
  const warn = tasks ? ` и ${tasks} заданий с оценками` : "";
  if (!window.confirm(`удалить тему${warn}?`)) return;
  savingEdit.value = true;
  err.value = "";
  try {
    await deleteLecture(classroom.value.course.id, editing.value.id, auth.token);
    editing.value = null;
    activeId.value = "";
    void router.replace({ query: { ...route.query, lecture: undefined } });
    await load();
  } catch (e) {
    err.value = errorText(e);
  } finally {
    savingEdit.value = false;
  }
}

async function removeTask(assignmentId: string) {
  if (!auth.token || !classroom.value) return;
  if (!window.confirm("удалить задание вместе со сдачами?")) return;
  err.value = "";
  try {
    await deleteAssignment(classroom.value.course.id, assignmentId, auth.token);
    await load();
  } catch (e) {
    err.value = errorText(e);
  }
}

/* ---------- чат с gemini ---------- */

const ai = ref<AiStatus | null>(null);
const chat = ref<AiChatMessage[]>([]);
const chatInput = ref("");
const chatBusy = ref(false);
const chatErr = ref("");
const chatBodyRef = ref<HTMLElement | null>(null);
const chatFieldRef = ref<HTMLTextAreaElement | null>(null);

async function loadAiStatus() {
  if (!auth.token) return;
  try {
    ai.value = await getAiStatus(auth.token);
  } catch {
    ai.value = null;
  }
}

async function loadChat() {
  if (!auth.token || !courseId.value) return;
  try {
    const r = await getChatHistory(auth.token, courseId.value);
    chat.value = r.messages;
    void scrollChatDown();
  } catch {
    chat.value = [];
  }
}

async function scrollChatDown() {
  await nextTick();
  const el = chatBodyRef.value;
  if (el) el.scrollTop = el.scrollHeight;
}

async function openChat() {
  chatOpen.value = true;
  await nextTick();
  chatFieldRef.value?.focus();
  void scrollChatDown();
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text || chatBusy.value || !auth.token || !classroom.value) return;
  chatErr.value = "";
  chat.value.push({ role: "user", text });
  chatInput.value = "";
  chatBusy.value = true;
  void scrollChatDown();
  try {
    const r = await askCourseTutor(auth.token, {
      course_id: classroom.value.course.id,
      lecture_id: activeLecture.value?.id ?? null,
      message: text,
    });
    chat.value.push({ role: "model", text: r.reply });
    if (ai.value) ai.value = { ...ai.value, chat_used: r.used, chat_limit: r.limit };
  } catch (e) {
    chatErr.value = errorText(e);
    chat.value.pop();
    chatInput.value = text;
  } finally {
    chatBusy.value = false;
    void scrollChatDown();
  }
}

function onChatKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void sendChat();
  }
}

async function clearChat() {
  chat.value = [];
  chatErr.value = "";
  if (!auth.token || !courseId.value) return;
  try {
    await clearChatHistory(auth.token, courseId.value);
  } catch {
    /* локально уже очищено */
  }
}

watch(activeId, () => {
  openTaskId.value = "";
});

watch(courseId, () => {
  void load();
  void loadChat();
});

watch(
  () => String(route.query.lecture ?? ""),
  (id) => {
    if (id === activeId.value) return;
    activeId.value = id;
  },
);

function onReaderKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (chatOpen.value) chatOpen.value = false;
    else if (topicsOpen.value) topicsOpen.value = false;
    return;
  }
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (editing.value) return;
  if (e.key === "ArrowLeft" && prevLecture.value) {
    e.preventDefault();
    openLecture(prevLecture.value.id);
    return;
  }
  if (e.key === "ArrowRight" && nextLecture.value) {
    e.preventDefault();
    openLecture(nextLecture.value.id);
  }
}

onMounted(() => {
  document.documentElement.classList.add("course-reader");
  document.addEventListener("keydown", onReaderKey);
  void load();
  void loadAiStatus();
  void loadChat();
  void nextTick(measureReaderTop);
  window.addEventListener("resize", measureReaderTop);
  window.visualViewport?.addEventListener("resize", syncKeyboardInset);
  window.visualViewport?.addEventListener("scroll", syncKeyboardInset);
});

onBeforeUnmount(() => {
  document.documentElement.classList.remove("course-reader");
  document.removeEventListener("keydown", onReaderKey);
  window.removeEventListener("resize", measureReaderTop);
  window.visualViewport?.removeEventListener("resize", syncKeyboardInset);
  window.visualViewport?.removeEventListener("scroll", syncKeyboardInset);
  endPress();
});
</script>

<template>
  <section ref="readerRef" class="reader">
    <AppLoading v-if="loading && !classroom" class="page-empty" />
    <p v-else-if="err && !classroom" class="page-empty">{{ err }}</p>

    <template v-else-if="classroom">
    <div class="reader-grid">
      <!-- темы -->
      <aside class="reader-topics" :class="{ open: topicsOpen }">
        <header class="side-head">
          <button type="button" class="filter-icon-btn" aria-label="к курсу" @click="exitReader">
            <AppIcon name="back" :size="18" />
          </button>
          <button type="button" class="side-title side-title-btn" @click="openContents">
            {{ classroom.course.title }}
          </button>
          <button
            type="button"
            class="filter-icon-btn only-narrow"
            aria-label="закрыть"
            @click="topicsOpen = false"
          >
            <AppIcon name="close" :size="18" />
          </button>
        </header>

        <nav ref="topicListRef" class="topic-list" :class="{ dragging }">
          <template v-for="(ch, ci) in chapters" :key="`${ch.book}:${ch.title}:${ci}`">
            <button
              v-if="hasBooks && isBookStart(ci)"
              type="button"
              class="book"
              :class="{ on: ch.book === activeBook }"
              @click="toggleBook(ch.book)"
            >
              <AppIcon
                name="forward"
                :size="14"
                class="chapter-chev"
                :class="{ open: openBook === ch.book }"
              />
              <span class="topic-title">{{ ch.book }}</span>
            </button>

            <template v-if="bookOpen(ch.book)">
            <button
              v-if="ch.title"
              type="button"
              class="chapter"
              :class="{ on: ch.title === activeChapter && ch.book === activeBook, nested: hasBooks }"
              @click="toggleChapter(ch.title)"
            >
              <AppIcon
                name="forward"
                :size="14"
                class="chapter-chev"
                :class="{ open: openChapter === ch.title }"
              />
              <span class="topic-title">{{ ch.title }}</span>
            </button>

            <button
              v-for="(l, li) in !ch.title || openChapter === ch.title ? ch.lectures : []"
              :key="l.id"
              type="button"
              class="topic topic-row"
              :class="{
                on: l.id === activeLecture?.id,
                held: dragChapter === ci && dragIndex === li,
                landed: l.id === landedId,
                movable: isTeacher,
                nested: !!ch.title,
              }"
              :data-chapter="ci"
              @pointerdown="onTopicPointerDown($event, li, ci)"
              @click="onTopicClick(l.id)"
            >
              <span class="topic-num muted">{{ li + 1 }}</span>
              <span class="topic-title">{{ l.title }}</span>
              <AppIcon v-if="lectureDone(l.id)" name="seen" :size="15" class="topic-done" />
            </button>
            </template>
          </template>
          <p v-if="!lectures.length" class="side-empty muted">тем нет</p>
        </nav>
      </aside>

      <!-- тема -->
      <main ref="mainRef" class="reader-main">
        <div class="main-bar">
          <button
            type="button"
            class="filter-icon-btn only-narrow"
            aria-label="темы"
            @click="topicsOpen = true"
          >
            <AppIcon name="list" :size="18" />
          </button>
          <span class="main-bar-title">{{ activeLecture?.title ?? "содержание" }}</span>
          <button
            type="button"
            class="filter-icon-btn"
            aria-label="чат"
            @click="openChat"
          >
            <AppIcon name="chat" :size="17" />
          </button>
          <button
            v-if="activeLecture && !editing"
            type="button"
            class="filter-icon-btn"
            aria-label="скачать word"
            @click="downloadLecture"
          >
            <AppIcon name="download" :size="17" />
          </button>
          <button
            v-if="isTeacher && activeLecture && !editing"
            type="button"
            class="filter-icon-btn"
            aria-label="править"
            @click="startEdit"
          >
            <AppIcon name="edit" :size="17" />
          </button>
        </div>

        <p v-if="err" class="error">{{ err }}</p>

        <form v-if="editing" class="edit-form" @submit.prevent="saveEdit">
          <input v-model="editing.title" placeholder="название темы" />
          <input v-model="editing.video_url" placeholder="видео url" />
          <textarea v-model="editing.body_text" rows="16" placeholder="текст темы, markdown" />
          <div class="edit-actions">
            <button type="submit" :disabled="savingEdit">
              {{ savingEdit ? "…" : "сохранить" }}
            </button>
            <button type="button" class="secondary" @click="editing = null">отмена</button>
            <button
              type="button"
              class="secondary edit-remove"
              :disabled="savingEdit"
              @click="removeLecture"
            >
              удалить тему
            </button>
          </div>
        </form>

        <article v-else-if="activeLecture" class="lecture">
          <h1 class="lecture-title">{{ activeLecture.title }}</h1>

          <template v-for="ev in [videoEmbed(activeLecture.video_url)]" :key="activeLecture.id">
            <div v-if="ev" class="lecture-video">
              <iframe
                v-if="ev.kind === 'iframe'"
                :src="ev.src"
                title="видео"
                allowfullscreen
                loading="lazy"
              />
              <video v-else-if="ev.kind === 'video'" :src="ev.src" controls />
              <a v-else :href="ev.href" target="_blank" rel="noopener noreferrer">видео</a>
            </div>
          </template>

          <MarkdownText
            v-if="activeLecture.body_text"
            :text="activeLecture.body_text"
            variant="doc"
          />

          <ul v-if="activeLecture.attachments.length" class="files">
            <li v-for="f in activeLecture.attachments" :key="f.id">
              <a :href="f.url" target="_blank" rel="noopener noreferrer">{{ f.file_name }}</a>
            </li>
          </ul>

          <section v-if="tasksFor(activeLecture.id).length" class="tasks">
            <h2 class="tasks-title">задания</h2>
            <div v-for="a in tasksFor(activeLecture.id)" :key="a.id" class="task">
              <button type="button" class="task-head" @click="toggleTask(a.id)">
                <span class="task-name">{{ a.title }}</span>
                <span class="task-score muted">
                  <template v-if="a.my_submission && a.my_submission.grade_points !== null">
                    {{ a.my_submission.grade_points }} / {{ a.max_points }}
                  </template>
                  <template v-else-if="a.my_submission">сдано</template>
                  <template v-else>{{ a.max_points }} б</template>
                </span>
              </button>

              <div v-if="openTaskId === a.id" class="task-body">
                <MarkdownText v-if="a.description" :text="a.description" />

                <div v-if="isTeacher" class="task-teacher">
                  <p class="muted small">проверка работ — в классе курса</p>
                  <button type="button" class="task-remove" @click="removeTask(a.id)">
                    удалить задание
                  </button>
                </div>
                <template v-else>
                  <p v-if="a.my_submission?.teacher_comment" class="task-comment muted">
                    {{ a.my_submission.teacher_comment }}
                  </p>
                  <textarea
                    v-model="answer[a.id]"
                    rows="3"
                    placeholder="ответ — текст или ссылка"
                  />
                  <ul v-if="pendingFiles[a.id]?.length" class="files">
                    <li v-for="(f, i) in pendingFiles[a.id]" :key="i">
                      <span>{{ f.name }}</span>
                      <button type="button" class="ghost-x" @click="dropFile(a.id, i)">×</button>
                    </li>
                  </ul>
                  <div class="task-actions">
                    <label class="attach">
                      <AppIcon name="image" :size="15" />
                      <span>файл</span>
                      <input type="file" multiple hidden @change="pickFiles(a.id, $event)" />
                    </label>
                    <button type="button" :disabled="sending[a.id]" @click="submitTask(a)">
                      {{ sending[a.id] ? "…" : a.my_submission ? "пересдать" : "сдать" }}
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </section>

          <nav class="lecture-nav">
            <button
              v-if="prevLecture"
              type="button"
              class="lecture-nav-btn"
              @click="openLecture(prevLecture.id)"
            >
              <AppIcon name="back" :size="18" />
              <span>{{ prevLecture.title }}</span>
            </button>
            <span v-else />
            <button type="button" class="lecture-nav-home" @click="openContents">
              содержание
            </button>
            <button
              v-if="nextLecture"
              type="button"
              class="lecture-nav-btn lecture-nav-btn--next"
              @click="openLecture(nextLecture.id)"
            >
              <span>{{ nextLecture.title }}</span>
              <AppIcon name="forward" :size="18" />
            </button>
            <span v-else />
          </nav>
        </article>

        <article v-else-if="lectures.length" class="lecture contents">
          <header class="contents-head">
            <h1 class="lecture-title">{{ classroom.course.title }}</h1>
            <button type="button" class="contents-start" @click="openLecture(lectures[0].id)">
              читать
            </button>
          </header>
          <section v-for="(book, bi) in contentBooks" :key="book.title || bi" class="contents-book">
            <h2 v-if="book.title" class="contents-book-title">{{ book.title }}</h2>
            <div class="contents-chapters">
              <section v-for="(ch, ci) in book.chapters" :key="ch.title || ci" class="contents-chapter">
                <h3 v-if="ch.title" class="contents-chapter-title">{{ ch.title }}</h3>
                <button
                  v-for="l in ch.lectures"
                  :key="l.id"
                  type="button"
                  class="contents-topic"
                  @click="openLecture(l.id)"
                >
                  <span class="topic-title">{{ l.title }}</span>
                  <AppIcon v-if="lectureDone(l.id)" name="seen" :size="15" class="topic-done" />
                </button>
              </section>
            </div>
          </section>
        </article>

        <p v-else class="page-empty">тем нет</p>
      </main>
    </div>

      <!-- чат -->
      <aside class="reader-chat" :class="{ open: chatOpen }">
        <header class="side-head chat-head">
          <span class="chat-grabber only-narrow" aria-hidden="true" />
          <div class="chat-titles">
            <span class="side-title">ии чат</span>
            <span v-if="activeLecture" class="chat-topic muted">
              по теме: {{ activeLecture.title }}
            </span>
          </div>
          <button
            v-if="chat.length"
            type="button"
            class="filter-icon-btn"
            aria-label="очистить"
            @click="clearChat"
          >
            <AppIcon name="clear" :size="18" />
          </button>
          <button
            type="button"
            class="filter-icon-btn"
            aria-label="закрыть"
            @click="chatOpen = false"
          >
            <AppIcon name="close" :size="18" />
          </button>
        </header>

        <div ref="chatBodyRef" class="chat-body">
          <p v-if="!ai?.enabled" class="chat-hint muted">чат выключен</p>
          <p v-else-if="!chat.length" class="chat-hint muted">спроси по этой теме</p>
          <div
            v-for="(m, i) in chat"
            :key="i"
            class="bubble"
            :class="m.role === 'user' ? 'mine' : 'ai'"
          >
            <MarkdownText :text="m.text" />
          </div>
          <p v-if="chatBusy" class="chat-hint muted">думает…</p>
          <p v-if="chatErr" class="chat-hint">{{ chatErr }}</p>
        </div>

        <form class="chat-form" @submit.prevent="sendChat">
          <textarea
            ref="chatFieldRef"
            v-model="chatInput"
            rows="1"
            :disabled="!ai?.enabled || chatBusy"
            placeholder="?"
            @keydown="onChatKeydown"
          />
          <button
            type="submit"
            class="filter-icon-btn"
            aria-label="отправить"
            :disabled="!ai?.enabled || chatBusy || !chatInput.trim()"
          >
            <AppIcon name="send" :size="18" />
          </button>
        </form>
      </aside>

      <!-- мобильный вход в чат -->
      <button
        v-if="!chatOpen && !topicsOpen"
        type="button"
        class="ask-bar only-narrow"
        @click="openChat"
      >
        <span>?</span>
        <AppIcon name="chat" :size="18" />
      </button>

    <div
      v-if="topicsOpen || chatOpen"
      class="panel-backdrop"
      :class="{ 'only-narrow': !chatOpen }"
      @click="topicsOpen = false; chatOpen = false"
    />
    </template>
  </section>
</template>

<style scoped>
.reader {
  width: 100%;
}

/* читалка занимает экран целиком: страница не скроллится, колонки не уезжают */
.reader-grid {
  display: grid;
  grid-template-columns: clamp(240px, 16vw, 340px) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: clamp(1.5rem, 1.2rem + 0.6vw, 2.5rem);
  height: calc(100dvh - var(--reader-top, 7rem));
  min-height: 24rem;
}

.reader-topics,
.reader-chat {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  height: 100%;
  min-height: 0;
}

.reader-topics {
  padding-right: 0.75rem;
  border-right: 1px solid var(--border);
}

.reader-main {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 1.5rem;
}

.side-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2rem;
}

.side-title {
  min-width: 0;
  font-weight: 500;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: lowercase;
}

.reader-topics .side-title {
  flex: 1;
}

.side-title-btn {
  padding: 0;
  min-height: 0;
  border: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.side-title-btn:hover {
  background: transparent;
  color: var(--muted);
}

.chapter {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  min-height: 0;
  padding: 0.55rem 0.5rem;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  font-size: var(--text-sm);
  text-align: left;
  text-transform: lowercase;
}

.book {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  min-height: 0;
  margin-top: 0.5rem;
  padding: 0.55rem 0.5rem;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 500;
  text-align: left;
  text-transform: lowercase;
}

.book:first-child {
  margin-top: 0;
}

.book:hover,
.chapter:hover {
  background: var(--surface);
}

.book.on,
.chapter.on {
  font-weight: 500;
}

.chapter-chev {
  flex-shrink: 0;
  color: var(--muted);
  transition: transform var(--dur-2) var(--ease-out);
}

.chapter-chev.open {
  transform: rotate(90deg);
}

/* название главы длинное: лучше две строки, чем многоточие */
.chapter .topic-title {
  white-space: normal;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  line-height: 1.3;
}

.topic.nested {
  padding-left: 1.6rem;
}

.chapter.nested {
  padding-left: 1.1rem;
}

.topic-list {
  display: grid;
  gap: 1px;
  align-content: start;
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
  flex: 1;
}

.topic {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 0;
  padding: 0.5rem 0.65rem;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--muted);
  font-size: var(--text-sm);
  text-align: left;
  text-transform: lowercase;
}

.topic:hover,
.topic.on {
  background: var(--surface);
  color: var(--text);
}

.topic.movable {
  cursor: grab;
}

/* поднятая тема — инверсия, видно куда она едет */
.topic.held {
  cursor: grabbing;
  background: var(--text);
  color: var(--bg);
}

.topic.held .topic-num {
  color: var(--bg);
}

/* куда приземлилась — гаснет за секунду */
.topic.landed {
  animation: topic-landed 1s var(--ease-out);
}

@keyframes topic-landed {
  from {
    background: var(--surface2);
  }
  to {
    background: transparent;
  }
}

.topic-list.dragging {
  user-select: none;
}

.topic-list.dragging .topic:not(.held) {
  transition: transform var(--dur-2) var(--ease-out);
}

.topic-num {
  flex-shrink: 0;
  min-width: 1.1rem;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.topic-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topic-done {
  flex-shrink: 0;
  opacity: 0.7;
}

.side-empty {
  margin: 0;
  padding: 0.5rem 0.65rem;
  font-size: var(--text-sm);
}

.reader-main {
  min-width: 0;
  padding-bottom: var(--space-8);
}

.main-bar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding-bottom: var(--space-2);
  margin-bottom: var(--space-3);
  background: var(--bg);
}

.main-bar-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: var(--text-sm);
  text-transform: lowercase;
}

/* без minmax(0,1fr) одна длинная ссылка растягивает колонку и режет весь текст */
.lecture,
.tasks,
.task-body,
.files,
.edit-form,
.chat-body,
.topic-list {
  grid-template-columns: minmax(0, 1fr);
}

.lecture {
  display: grid;
  gap: 0.85rem;
  min-width: 0;
  width: 100%;
  max-width: clamp(46rem, 28rem + 28vw, 84rem);
  margin: 0;
  padding-bottom: var(--space-8);
}

.lecture :deep(.markdown-body.doc) {
  font-size: clamp(1.06rem, 0.88rem + 0.22vw, 1.22rem);
  line-height: 1.55;
}

.lecture :deep(a),
.files a {
  overflow-wrap: anywhere;
}

.lecture-title {
  margin: 0;
  font-size: clamp(1.45rem, 1.2rem + 0.32vw, 1.75rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.25;
  text-transform: lowercase;
}

.lecture-nav {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  padding-top: var(--space-8);
}

.lecture-nav-home {
  padding: 0;
  min-height: 0;
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: var(--text-sm);
  text-transform: lowercase;
  cursor: pointer;
}

.lecture-nav-home:hover {
  background: transparent;
  color: var(--text);
}

.lecture-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: var(--text-sm);
  text-align: left;
  text-transform: lowercase;
  cursor: pointer;
}

.lecture-nav-btn--next {
  justify-self: end;
  margin-left: 0;
  text-align: right;
}

.lecture-nav-btn:hover {
  color: var(--text);
  background: transparent;
}

.lecture-nav-btn span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- содержание курса ---------- */

.lecture.contents {
  max-width: 100%;
  gap: 1.5rem;
}

.contents-head {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.contents-start {
  padding: 0.45rem 1.1rem;
  border-radius: var(--radius-pill);
}

.contents-book {
  display: grid;
  gap: 0.85rem;
}

.contents-book-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 500;
  text-transform: lowercase;
}

.contents-chapters {
  display: grid;
  gap: 1rem 2rem;
  grid-template-columns: 1fr;
}

@media (min-width: 1100px) {
  .contents-chapters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1600px) {
  .contents-chapters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 2200px) {
  .contents-chapters {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.contents-chapter {
  display: grid;
  align-content: start;
  gap: 0.05rem;
}

.contents-chapter-title {
  margin: 0 0 0.3rem;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--muted);
  text-transform: lowercase;
}

.contents-topic {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 0;
  padding: 0.28rem 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  font-size: var(--text-md);
  text-align: left;
  text-transform: lowercase;
}

.contents-topic:hover {
  background: transparent;
  color: var(--muted);
}

.lecture-video {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface);
}

.lecture-video iframe,
.lecture-video video {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: none;
}

.edit-form {
  display: grid;
  gap: var(--space-3);
}

.edit-form textarea {
  line-height: 1.6;
  font-family: var(--mono);
  font-size: var(--text-sm);
}

.edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.edit-remove {
  margin-left: auto;
  color: var(--muted);
}

.task-teacher {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.task-remove {
  padding: 0;
  border: none;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
}

.task-remove:hover {
  color: var(--text);
}

.files {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
  font-size: var(--text-sm);
}

.files li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.ghost-x {
  padding: 0;
  min-height: 0;
  width: 1.4rem;
  border: none;
  background: transparent;
  color: var(--muted);
}

.tasks {
  display: grid;
  gap: 0.4rem;
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}

.tasks-title {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--muted);
  text-transform: lowercase;
}

.task {
  border-bottom: 1px solid var(--border);
}

.task:last-child {
  border-bottom: none;
}

.task-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
  padding: 0.7rem 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
}

.task-head:hover {
  background: transparent;
}

.task-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-score {
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.task-body {
  display: grid;
  gap: var(--space-3);
  padding: 0 0 var(--space-4);
}

.task-comment {
  margin: 0;
  font-size: var(--text-sm);
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.attach {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  color: var(--muted);
  font-size: var(--text-sm);
  cursor: pointer;
}

.attach:hover {
  color: var(--text);
}

/* ---------- чат ---------- */

/* панель чата — шторка, не третья колонка: чтение занимает экран */
.reader-chat {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 96;
  width: min(26rem, 92vw);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-right: none;
  border-radius: var(--radius) 0 0 var(--radius);
  background: var(--bg);
  transform: translateX(110%);
  transition: transform var(--dur-3) var(--ease-snap);
}

.reader-chat.open {
  transform: translateX(0);
}

.chat-head {
  align-items: flex-start;
}

.chat-titles {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 0.1rem;
}

.chat-topic {
  font-size: var(--text-2xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: lowercase;
}

.chat-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: grid;
  align-content: start;
  gap: 0.5rem;
  font-size: var(--text-sm);
}

.chat-hint {
  margin: 0;
  font-size: var(--text-xs);
}

.bubble {
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  min-width: 0;
}

.bubble.mine {
  background: var(--surface);
}

.bubble.ai {
  background: transparent;
  border-color: transparent;
  padding-left: 0;
  padding-right: 0;
}

.chat-form {
  display: flex;
  align-items: flex-end;
  gap: 0.35rem;
  flex-shrink: 0;
}

.chat-form textarea {
  flex: 1;
  min-height: var(--control-h);
  max-height: 8rem;
  resize: none;
  border-radius: var(--radius);
  font-size: var(--text-sm);
}

.only-narrow {
  display: none;
}

.panel-backdrop {
  display: none;
}

.panel-backdrop:not(.only-narrow) {
  display: block;
  position: fixed;
  inset: 0;
  z-index: 94;
  background: var(--overlay-soft);
}

/* ---------- телефон: центр читается, чат в одно касание ---------- */

@media (max-width: 1024px) {
  .reader-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto;
    height: auto;
    min-height: 0;
  }

  .only-narrow {
    display: inline-flex;
  }

  /* на телефоне листаем страницу, а не колонку */
  .reader-main {
    height: auto;
    overflow-y: visible;
    overflow-x: clip;
    padding-right: 0;
    padding-bottom: calc(var(--control-h) + var(--space-8));
  }

  .main-bar {
    position: static;
    padding-bottom: 0;
  }

  .lecture-title {
    font-size: 1.35rem;
  }

  /* на узком экране крупный кегль рвёт строки, читаем чуть мельче */
  .lecture :deep(.markdown-body.doc) {
    font-size: 1.04rem;
  }

  .reader-topics {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 96;
    width: min(86vw, 21rem);
    max-height: none;
    padding: var(--layout-pad) var(--layout-pad)
      max(var(--layout-pad), env(safe-area-inset-bottom));
    background: var(--bg);
    border-right: 1px solid var(--border);
    border-radius: 0;
    transform: translateX(-110%);
    transition: transform var(--dur-3) var(--ease-snap);
  }

  .topic {
    min-height: 2.75rem;
    font-size: var(--text-md);
  }

  .reader-topics.open {
    transform: translateX(0);
  }

  .reader-chat {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    z-index: 96;
    width: auto;
    height: 86dvh;
    max-height: calc(100dvh - 2.5rem);
    /* шторка всегда прижата к низу, клавиатура поднимает только содержимое */
    padding: var(--space-3) var(--layout-pad)
      calc(max(var(--space-3), env(safe-area-inset-bottom)) + var(--kb, 0px));
    background: var(--bg);
    border: 1px solid var(--border);
    border-bottom: none;
    border-radius: calc(var(--radius) + 6px) calc(var(--radius) + 6px) 0 0;
    transform: translateY(110%);
    transition: transform var(--dur-3) var(--ease-snap);
  }

  .reader-chat.open {
    transform: translateY(0);
  }

  .chat-grabber {
    position: absolute;
    top: 0.5rem;
    left: 50%;
    width: 2.2rem;
    height: 3px;
    border-radius: var(--radius-pill);
    background: var(--border);
    transform: translateX(-50%);
  }

  .chat-head {
    padding-top: 0.6rem;
  }

  .chat-body {
    font-size: var(--text-md);
  }

  .chat-form textarea {
    font-size: 16px;
  }

  .ask-bar {
    position: fixed;
    left: var(--layout-pad);
    right: var(--layout-pad);
    bottom: max(var(--layout-pad), env(safe-area-inset-bottom));
    z-index: 92;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-height: var(--control-h);
    padding: 0 0.5rem 0 1.1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--muted);
    font-size: var(--text-sm);
    text-transform: lowercase;
  }

  .panel-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 94;
    background: var(--overlay-soft);
  }
}

/* на телефоне три колонки не влезают: «содержание» уходит под стрелки */
@media (max-width: 640px) {
  .lecture-nav {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    row-gap: 1.25rem;
  }

  .lecture-nav > :first-child {
    grid-area: 1 / 1;
  }

  .lecture-nav > :last-child {
    grid-area: 1 / 2;
  }

  .lecture-nav-home {
    grid-area: 2 / 1 / 3 / 3;
    justify-self: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reader-topics,
  .reader-chat {
    transition: none;
  }
}
</style>
