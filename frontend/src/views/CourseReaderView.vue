<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import AppLoading from "../components/AppLoading.vue";
import MarkdownText from "../components/MarkdownText.vue";
import PageHeader from "../components/PageHeader.vue";
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
import { prettyCourseTitle } from "../utils/courseTitle";

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
    const title = prettyCourseTitle((l.chapter ?? "").trim());
    const last = out[out.length - 1];
    if (last && last.book === book && last.title === title) last.lectures.push(l);
    else out.push({ title, book, offset: i, lectures: [l] });
  });
  return out;
});

const hasBooks = computed(() => chapters.value.some((c) => c.book));
const activeChapter = computed(() => prettyCourseTitle((activeLecture.value?.chapter ?? "").trim()));
const openChapter = ref("");

function chapterIndex(ch: Chapter): number {
  return chapters.value.findIndex((c) => c.offset === ch.offset);
}

function toggleChapter(title: string) {
  const opening = openChapter.value !== title;
  openChapter.value = opening ? title : "";
  if (!opening) return;
  const ch = chapters.value.find(
    (c) => c.title === title && (!currentBook.value || c.book === currentBook.value),
  );
  const first = ch?.lectures[0];
  if (first && first.id !== activeId.value) openLecture(first.id);
}

const contentBooks = computed(() => {
  const out: { title: string; chapters: Chapter[] }[] = [];
  for (const ch of chapters.value) {
    const last = out[out.length - 1];
    if (last && last.title === ch.book) last.chapters.push(ch);
    else out.push({ title: ch.book, chapters: [ch] });
  }
  return out;
});

function queryString(name: string): string {
  const q = route.query[name];
  const raw = Array.isArray(q) ? q[0] : q;
  return typeof raw === "string" ? raw : "";
}

/* пока адрес ещё старый, «назад» не должен снова открывать книгу */
const forceCatalog = ref(false);

const currentBook = computed(() => {
  if (forceCatalog.value || !hasBooks.value) return "";
  const fromLec = (activeLecture.value?.book ?? "").trim();
  if (fromLec) return fromLec;
  const wanted = queryString("book");
  if (!wanted) return "";
  return contentBooks.value.find((b) => b.title === wanted)?.title ?? "";
});

const currentBookEntry = computed(
  () => contentBooks.value.find((b) => b.title === currentBook.value) ?? null,
);

const catalogMode = computed(
  () => !!classroom.value && hasBooks.value && !currentBook.value && !activeId.value,
);

/* содержание книги — тот же список по центру, без второй копии слева */

const bookLectures = computed(() => {
  if (!currentBook.value) return lectures.value;
  return lectures.value.filter((l) => (l.book ?? "").trim() === currentBook.value);
});

const contentsChapters = computed(() => currentBookEntry.value?.chapters ?? chapters.value);

watch(activeChapter, (title) => {
  if (title) openChapter.value = title;
});

watch(currentBook, (title) => {
  if (activeId.value) return;
  if (!title) {
    openChapter.value = "";
    return;
  }
  const first = chapters.value.find((c) => c.book === title);
  if (first?.title) openChapter.value = first.title;
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
    if (exists) {
      activeId.value = wanted;
    } else {
      const book = queryString("book");
      const first = book
        ? classroom.value.lectures.find((l) => (l.book ?? "").trim() === book)
        : classroom.value.lectures[0];
      if (first) {
        activeId.value = first.id;
        const q: Record<string, string> = { lecture: first.id };
        const b = (first.book ?? "").trim();
        if (b) q.book = b;
        void router.replace({ query: q });
      } else {
        activeId.value = "";
      }
    }
    if (activeChapter.value) openChapter.value = activeChapter.value;
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
  const lec = lectures.value.find((l) => l.id === id);
  const book = (lec?.book ?? "").trim();
  forceCatalog.value = false;
  activeId.value = id;
  topicsOpen.value = false;
  editing.value = null;
  const q: Record<string, string> = { lecture: id };
  if (book) q.book = book;
  void router.replace({ query: q });
  scrollMainTop();
}

function openBook(title: string) {
  if ((activeLecture.value?.book ?? "").trim() === title) return;
  forceCatalog.value = false;
  const first = lectures.value.find((l) => (l.book ?? "").trim() === title);
  if (first) {
    openLecture(first.id);
    return;
  }
  activeId.value = "";
  topicsOpen.value = false;
  editing.value = null;
  void router.replace({ query: { book: title } });
  scrollMainTop();
}

function showFolders() {
  chatOpen.value = false;
  if (activeChapter.value) openChapter.value = activeChapter.value;
  topicsOpen.value = true;
}

watch(
  () => [queryString("book"), queryString("lecture"), lectures.value.length] as const,
  ([book, lecture, n]) => {
    if (forceCatalog.value || !book || lecture || !n) return;
    const first = lectures.value.find((l) => (l.book ?? "").trim() === book);
    if (first) openLecture(first.id);
  },
);

function openContents() {
  forceCatalog.value = true;
  activeId.value = "";
  topicsOpen.value = false;
  chatOpen.value = false;
  editing.value = null;
  openChapter.value = "";
  void router.replace({ query: {} });
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
  void router.push("/courses");
}

function onReaderBack() {
  exitReader();
}

function syncReaderChrome() {
  const reading = !!classroom.value && !!activeId.value;
  document.documentElement.classList.toggle("course-reader", reading);
  if (reading) void nextTick(measureReaderTop);
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
    const book = queryString("book");
    void router.replace({ query: book ? { book } : {} });
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
  topicsOpen.value = false;
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
    if (id) forceCatalog.value = false;
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

watch(catalogMode, syncReaderChrome);
watch(activeId, syncReaderChrome);
watch(classroom, syncReaderChrome);
watch([chatOpen, topicsOpen], ([chat, topics]) => {
  document.documentElement.classList.toggle("reader-sheet", chat || topics);
});

onMounted(() => {
  document.addEventListener("keydown", onReaderKey);
  void load();
  void loadAiStatus();
  void loadChat();
  syncReaderChrome();
  window.addEventListener("resize", measureReaderTop);
  window.visualViewport?.addEventListener("resize", syncKeyboardInset);
  window.visualViewport?.addEventListener("scroll", syncKeyboardInset);
});

onBeforeUnmount(() => {
  document.documentElement.classList.remove("course-reader", "reader-sheet");
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

    <template v-else-if="classroom && catalogMode">
      <section class="catalog page-shell">
        <PageHeader :title="prettyCourseTitle(classroom.course.title)">
          <template #back>
            <button type="button" class="filter-icon-btn" aria-label="к курсам" @click="exitReader">
              <AppIcon name="back" :size="18" />
            </button>
          </template>
        </PageHeader>
        <ul class="list category-list">
          <li
            v-for="b in contentBooks"
            :key="b.title"
            v-show="b.title"
            class="catalog-hit"
            @click="openBook(b.title)"
          >
            <button type="button" class="catalog-row">
              <span class="catalog-row-title">{{ prettyCourseTitle(b.title) }}</span>
            </button>
          </li>
        </ul>
      </section>
    </template>

    <template v-else-if="classroom && !activeLecture">
      <section class="catalog page-shell">
        <PageHeader :title="prettyCourseTitle(currentBook || classroom.course.title)">
          <template #back>
            <button
              type="button"
              class="filter-icon-btn"
              :aria-label="currentBook ? 'к списку' : 'к курсам'"
              @click="currentBook ? openContents() : exitReader()"
            >
              <AppIcon name="back" :size="18" />
            </button>
          </template>
          <template v-if="bookLectures[0]" #actions>
            <button type="button" class="contents-start" @click="openLecture(bookLectures[0].id)">
              читать
            </button>
          </template>
        </PageHeader>
        <p v-if="!lectures.length" class="page-empty">тем нет</p>
        <template v-else>
          <section
            v-for="(ch, ci) in contentsChapters"
            :key="ch.title || ci"
            class="toc-block"
          >
            <h2 v-if="ch.title" class="toc-chapter">{{ prettyCourseTitle(ch.title) }}</h2>
            <ul class="list">
              <li
                v-for="l in ch.lectures"
                :key="l.id"
                class="catalog-hit"
                @click="openLecture(l.id)"
              >
                <button type="button" class="catalog-row">
                  <span class="catalog-row-title">{{ prettyCourseTitle(l.title) }}</span>
                  <AppIcon v-if="lectureDone(l.id)" name="seen" :size="15" class="topic-done" />
                </button>
              </li>
            </ul>
          </section>
        </template>
      </section>
    </template>

    <template v-else-if="classroom && activeLecture">
    <div class="reader-grid">
      <!-- темы -->
      <aside class="reader-topics" :class="{ open: topicsOpen }">
        <header class="side-head">
          <button type="button" class="filter-icon-btn" aria-label="назад" @click="onReaderBack">
            <AppIcon name="back" :size="18" />
          </button>
          <span class="side-title">{{ prettyCourseTitle(classroom.course.title) }}</span>
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
          <template v-for="(book, bi) in contentBooks" :key="`${book.title}:${bi}`">
            <div class="book-block">
              <button
                v-if="book.title"
                type="button"
                class="book"
                :class="{ on: book.title === currentBook }"
                @click="openBook(book.title)"
              >
                <span class="topic-title">{{ prettyCourseTitle(book.title) }}</span>
              </button>
              <div v-if="!book.title || book.title === currentBook" class="book-body">
                <section
                  v-for="ch in book.chapters"
                  :key="`${ch.book}:${ch.title}:${ch.offset}`"
                  class="chapter-group"
                >
                  <button
                    v-if="ch.title"
                    type="button"
                    class="chapter"
                    :class="{ on: openChapter === ch.title, nested: !!book.title }"
                    @click="toggleChapter(ch.title)"
                  >
                    <AppIcon
                      :name="openChapter === ch.title ? 'folderOpen' : 'folder'"
                      :size="16"
                      class="chapter-folder"
                    />
                    <span class="topic-title">{{ ch.title }}</span>
                  </button>
                  <div
                    v-if="!ch.title || openChapter === ch.title"
                    class="chapter-lectures"
                  >
                    <button
                      v-for="(l, li) in ch.lectures"
                      :key="l.id"
                      type="button"
                      class="topic topic-row"
                      :class="{
                        on: l.id === activeLecture?.id,
                        held: dragChapter === chapterIndex(ch) && dragIndex === li,
                        landed: l.id === landedId,
                        movable: isTeacher,
                        nested: !!ch.title,
                      }"
                      :data-chapter="chapterIndex(ch)"
                      @pointerdown="onTopicPointerDown($event, li, chapterIndex(ch))"
                      @click="onTopicClick(l.id)"
                    >
                      <span class="topic-num muted">{{ li + 1 }}</span>
                      <span class="topic-title">{{ prettyCourseTitle(l.title) }}</span>
                      <AppIcon v-if="lectureDone(l.id)" name="seen" :size="15" class="topic-done" />
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </template>
          <p v-if="!lectures.length" class="side-empty muted">тем нет</p>
        </nav>
      </aside>

      <!-- тема -->
      <main class="reader-main">
        <div class="main-bar">
          <button
            type="button"
            class="filter-icon-btn only-narrow"
            aria-label="темы"
            @click="chatOpen = false; topicsOpen = true"
          >
            <AppIcon name="list" :size="18" />
          </button>
          <div class="main-bar-actions">
            <button
              type="button"
              class="filter-icon-btn"
              aria-label="чат"
              @click="openChat"
            >
              <AppIcon name="chat" :size="18" />
            </button>
            <button
              v-if="activeLecture && !editing"
              type="button"
              class="filter-icon-btn"
              aria-label="скачать word"
              @click="downloadLecture"
            >
              <AppIcon name="download" :size="18" />
            </button>
            <button
              v-if="isTeacher && activeLecture && !editing"
              type="button"
              class="filter-icon-btn"
              aria-label="править"
              @click="startEdit"
            >
              <AppIcon name="edit" :size="18" />
            </button>
          </div>
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

        <div v-else ref="mainRef" class="reader-scroll">
        <article class="lecture">
          <h1 class="lecture-title">{{ prettyCourseTitle(activeLecture.title) }}</h1>

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

        </article>
        </div>
        <nav v-if="!editing" class="lecture-nav">
          <button
            v-if="prevLecture"
            type="button"
            class="lecture-nav-btn"
            :aria-label="prettyCourseTitle(prevLecture.title)"
            @click="openLecture(prevLecture.id)"
          >
            <AppIcon name="back" :size="18" />
          </button>
          <span v-else class="lecture-nav-slot" aria-hidden="true" />
          <button type="button" class="lecture-nav-home" aria-label="главы" @click="showFolders">
            <AppIcon name="folder" :size="18" />
          </button>
          <button
            v-if="nextLecture"
            type="button"
            class="lecture-nav-btn"
            :aria-label="prettyCourseTitle(nextLecture.title)"
            @click="openLecture(nextLecture.id)"
          >
            <AppIcon name="forward" :size="18" />
          </button>
          <span v-else class="lecture-nav-slot" aria-hidden="true" />
        </nav>
        <aside class="reader-chat" :class="{ open: chatOpen }" :inert="!chatOpen">
          <header class="side-head chat-head">
            <span class="chat-grabber" aria-hidden="true" />
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
      </main>
    </div>

    <div
      v-if="topicsOpen || chatOpen"
      class="panel-backdrop only-narrow"
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
  grid-template-columns: minmax(15.5rem, 18rem) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 2.5rem;
  height: calc(100dvh - var(--reader-top, 7rem));
  min-height: 0;
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
  position: relative;
  z-index: 95;
  padding-right: 0.75rem;
  border-right: 1px solid var(--border);
}

.reader-main {
  display: flex;
  flex-direction: column;
  justify-self: stretch;
  position: relative;
  width: 100%;
  max-width: none;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
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
  align-items: flex-start;
  gap: 0.55rem;
  width: 100%;
  min-height: 2.75rem;
  padding: 0.7rem 0.75rem;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  font-size: 1rem;
  line-height: 1.35;
  text-align: left;
  text-transform: lowercase;
  overflow: visible;
}

.book {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  width: 100%;
  min-height: 2.6rem;
  margin-top: 0;
  padding: 0.6rem 0.65rem;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--muted);
  font-size: 1rem;
  font-weight: 500;
  text-align: left;
  text-transform: lowercase;
  overflow: visible;
}

.book:first-child {
  margin-top: 0;
}

.book:hover,
.chapter:hover:not(.on) {
  background: var(--surface);
}

.book.on {
  background: transparent;
  color: var(--text);
}

.book-block {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.book-body {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.chapter.on {
  color: var(--text);
}

.chapter-folder {
  flex-shrink: 0;
  margin-top: 0.12rem;
  color: var(--muted);
}

.chapter.on .chapter-folder {
  color: var(--text);
}

.chapter .topic-title {
  word-spacing: 0.04em;
}

.topic.nested {
  padding-left: 1.6rem;
}

.chapter.nested {
  padding-left: 1.1rem;
}

.topic-list {
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
  align-content: start;
  overflow-y: scroll;
  overscroll-behavior: contain;
  touch-action: pan-y;
  min-height: 0;
  flex: 1;
  padding-bottom: 2.5rem;
  padding-left: 2cm;
  /* ползунок у левого края колонки глав */
  direction: rtl;
  scrollbar-color: color-mix(in srgb, var(--text) 28%, transparent) transparent;
}

.topic-list > * {
  direction: ltr;
}

.topic-list::-webkit-scrollbar,
.reader-scroll::-webkit-scrollbar {
  width: 6px;
}

.topic-list::-webkit-scrollbar-thumb,
.reader-scroll::-webkit-scrollbar-thumb,
.topic-list::-webkit-scrollbar-thumb:hover,
.reader-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--text) 28%, transparent);
}

.chapter-group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex-shrink: 0;
}

.chapter-lectures {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 0.15rem 0 0.15rem 0.35rem;
}

.topic {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  width: 100%;
  min-height: 2.6rem;
  padding: 0.65rem 0.75rem;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--muted);
  font-size: 1rem;
  line-height: 1.35;
  text-align: left;
  text-transform: lowercase;
  overflow: visible;
}

.topic:hover:not(.on) {
  background: var(--surface);
  color: var(--text);
}

.topic.on {
  background: transparent;
  color: var(--text);
}

.topic.on .topic-num,
.topic.on .topic-done {
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
  min-width: 1.25rem;
  margin-top: 0.12rem;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}

.topic-title {
  flex: 1;
  min-width: 0;
  display: block;
  overflow: visible;
  white-space: normal;
  overflow-wrap: break-word;
  line-height: 1.35;
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

.reader-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: scroll;
  overscroll-behavior: contain;
  padding-right: 2cm;
  scrollbar-color: color-mix(in srgb, var(--text) 28%, transparent) transparent;
}

.main-bar {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  width: 100%;
  padding: 0 0.15rem 0.85rem;
  background: var(--bg);
}

.main-bar-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  margin-left: auto;
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
  gap: 1.15rem;
  min-width: 0;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0.15rem 0.1rem 2.5rem;
}

.lecture :deep(.markdown-body.doc) {
  font-size: 1.0625rem;
  line-height: 1.75;
}
.lecture :deep(.markdown-body.doc p) {
  margin: 1rem 0;
}
.lecture :deep(.markdown-body.doc li) {
  margin: 0.4rem 0;
}
.lecture :deep(.markdown-body.doc h2) {
  font-size: 1.4rem;
  margin: 1.8rem 0 0.55rem;
}
.lecture :deep(.markdown-body.doc h3) {
  font-size: 1.2rem;
  margin: 1.45rem 0 0.4rem;
}

.lecture :deep(a),
.files a {
  overflow-wrap: anywhere;
}

.lecture-title {
  margin: 0;
  font-size: 1.85rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.2;
  overflow-wrap: anywhere;
  text-transform: lowercase;
}

.lecture-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  width: 100%;
  min-height: 3.75rem;
  padding: 0.35rem 0.1rem;
  border-top: 1px solid var(--border);
  background: var(--bg);
}

.lecture-nav-slot {
  width: 3rem;
  height: 3rem;
  flex-shrink: 0;
}

.lecture-nav-home,
.lecture-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  padding: 0;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.lecture-nav-home:hover,
.lecture-nav-btn:hover {
  background: var(--surface);
  color: var(--text);
}

/* ---------- содержание курса ---------- */

.lecture.contents {
  max-width: 100%;
  gap: 1.5rem;
}

.catalog {
  display: grid;
  gap: 0.9rem;
}

.catalog .list > li {
  padding: 0;
}

.catalog-hit {
  cursor: pointer;
}

.catalog-row {
  width: 100%;
  display: flex;
  align-items: center;
  padding: var(--space-3) 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  min-height: 44px;
  font: inherit;
}

.catalog-row:hover {
  background: transparent;
  color: var(--muted);
}

.catalog-row-title {
  min-width: 0;
  font-weight: 500;
  font-size: var(--text-md);
  overflow-wrap: anywhere;
}

.toc-block + .toc-block {
  margin-top: 1.35rem;
}

.toc-chapter {
  margin: 0;
  padding-top: 0.35rem;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--muted);
  text-transform: lowercase;
}

.catalog-row .topic-done {
  margin-left: auto;
  color: var(--muted);
}

.contents-start {
  padding: 0.45rem 1.1rem;
  border-radius: var(--radius-pill);
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

/* чат только над текстом, главы слева не закрывает */
.reader-chat {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: auto;
  z-index: 4;
  display: flex;
  flex-direction: column;
  width: auto;
  height: min(72%, 100%);
  max-height: 100%;
  padding: var(--space-3) var(--layout-pad)
    calc(max(var(--space-3), env(safe-area-inset-bottom)) + var(--kb, 0px));
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: calc(var(--radius) + 6px) calc(var(--radius) + 6px) 0 0;
  transform: none;
  visibility: hidden;
  pointer-events: none;
}

.reader-chat.open {
  visibility: visible;
  pointer-events: auto;
}

.chat-head {
  align-items: flex-start;
  padding-top: 0.6rem;
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
  color: var(--text);
  overflow-wrap: anywhere;
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
    height: calc(100dvh - var(--reader-top, 4.5rem));
    min-height: 0;
  }

  .only-narrow {
    display: inline-flex;
  }

  .reader-main {
    justify-self: stretch;
    width: 100%;
    max-width: none;
    height: 100%;
    overflow: hidden;
  }

  .lecture {
    padding: 0.35rem 0.15rem 2rem;
  }

  .lecture-title {
    font-size: 1.7rem;
  }

  .lecture :deep(.markdown-body.doc) {
    font-size: 1.05rem;
    line-height: 1.7;
  }

  .lecture-nav {
    min-height: 3.75rem;
    padding: 0.25rem 0.35rem max(0.25rem, env(safe-area-inset-bottom));
  }

  .reader-topics {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 96;
    width: 100%;
    max-height: none;
    padding: var(--layout-pad) var(--layout-pad) 0;
    background: var(--bg);
    border-right: none;
    border-radius: 0;
    transform: translateX(-110%);
    transition: transform var(--dur-3) var(--ease-snap);
    pointer-events: none;
    overflow: hidden;
  }

  .topic-list {
    gap: 1.35rem;
    padding-bottom: max(2.5rem, env(safe-area-inset-bottom));
  }

  .chapter,
  .topic {
    min-height: 3rem;
  }

  .reader-topics.open {
    transform: translateX(0);
    pointer-events: auto;
  }

  .reader-chat {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    z-index: 96;
    display: flex;
    flex-direction: column;
    width: auto;
    height: min(78dvh, calc(100dvh - 3.5rem));
    max-height: calc(100dvh - 3.5rem);
    /* без translate: закрытая шторка не растягивает страницу пустым полем */
    padding: var(--space-3) var(--layout-pad)
      calc(max(var(--space-3), env(safe-area-inset-bottom)) + var(--kb, 0px));
    background: var(--bg);
    border: 1px solid var(--border);
    border-bottom: none;
    border-radius: calc(var(--radius) + 6px) calc(var(--radius) + 6px) 0 0;
    transform: none;
    visibility: hidden;
  }

  .reader-chat.open {
    visibility: visible;
    pointer-events: auto;
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

  .panel-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 94;
    background: var(--overlay-soft);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reader-topics,
  .reader-chat {
    transition: none;
  }
}
</style>
