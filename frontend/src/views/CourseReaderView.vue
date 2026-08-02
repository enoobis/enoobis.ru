<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import AppLoading from "../components/AppLoading.vue";
import MarkdownText from "../components/MarkdownText.vue";
import {
  createLecture,
  deleteAssignment,
  deleteLecture,
  getClassroom,
  patchLecture,
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
  generateCourseOutline,
  generateLectureDraft,
  getAiStatus,
  getChatHistory,
  type AiChatMessage,
  type AiLectureTask,
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
const canGenerate = computed(() => isTeacher.value && ai.value?.enabled && ai.value?.can_generate);

const activeLecture = computed<Lecture | null>(
  () => lectures.value.find((l) => l.id === activeId.value) ?? lectures.value[0] ?? null,
);

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
    activeId.value = exists ? wanted : (classroom.value.lectures[0]?.id ?? "");
  } catch (e) {
    err.value = errorText(e);
  } finally {
    loading.value = false;
  }
}

function openLecture(id: string) {
  activeId.value = id;
  topicsOpen.value = false;
  editing.value = null;
  void router.replace({ query: { ...route.query, lecture: id } });
  window.scrollTo({ top: 0 });
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

/* ---------- генерация (преподаватель) ---------- */

type GenMode = "course" | "lecture";

const genOpen = ref(false);
const genMode = ref<GenMode>("course");
const genTopic = ref("");
const genNotes = ref("");
const genCount = ref(10);
const genBusy = ref(false);
const genErr = ref("");
const genProgress = ref("");
const genDraft = ref<{ title: string; body: string; task: AiLectureTask | null } | null>(null);

function openGen() {
  genOpen.value = true;
  genErr.value = "";
  genProgress.value = "";
}

function closeGen() {
  if (genBusy.value) return;
  genOpen.value = false;
  genDraft.value = null;
  genQueue.value = [];
  genErr.value = "";
  genProgress.value = "";
}

type Draft = { body: string; task: AiLectureTask | null };
type DraftContext = { scope?: string; covered?: string[]; upcoming?: string[] };

async function draftFor(
  topic: string,
  courseTitle: string,
  ctx: DraftContext = {},
): Promise<Draft> {
  if (!auth.token) return { body: "", task: null };
  const draft = await generateLectureDraft(auth.token, {
    topic,
    course_title: courseTitle,
    notes: genNotes.value.trim() || undefined,
    ...ctx,
  });
  return { body: draft.body, task: draft.task };
}

/* весь курс: программа -> темы по одной, каждая сохраняется сразу */

type QueueItem = { title: string; summary: string; state: "wait" | "run" | "done" | "fail" };

const genQueue = ref<QueueItem[]>([]);
const genStop = ref(false);

const genDone = computed(() => genQueue.value.filter((t) => t.state === "done").length);
const genFailed = computed(() => genQueue.value.filter((t) => t.state === "fail").length);
const genPct = computed(() =>
  genQueue.value.length ? Math.round((genDone.value / genQueue.value.length) * 100) : 0,
);
const genStatus = computed(() => {
  const total = genQueue.value.length;
  if (!total) return genProgress.value;
  const head = `${genDone.value} из ${total}`;
  if (genProgress.value) return `${head} · ${genProgress.value}`;
  if (genFailed.value) return `${head} · не вышло ${genFailed.value}`;
  return `${head} · готово`;
});

function errCode(e: unknown): string {
  return e instanceof Error ? e.message : "";
}

/** лимиты на минуту переживаем ожиданием, ключ и дневной лимит — нет */
function isFatal(e: unknown): boolean {
  return ["daily_limit", "ai_disabled", "ai_key_invalid", "ai_key_forbidden", "ai_region_blocked"].includes(
    errCode(e),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeLecture(item: QueueItem, courseTitle: string, index: number) {
  if (!auth.token || !classroom.value) return;
  const draft = await draftFor(item.title, courseTitle, {
    scope: item.summary || undefined,
    covered: genQueue.value.slice(0, index).map((t) => t.title),
    upcoming: genQueue.value.slice(index + 1).map((t) => t.title),
  });
  await createLecture(
    classroom.value.course.id,
    {
      title: item.title,
      body_text: draft.body,
      video_url: "",
      ...(draft.task ? { task: draft.task } : {}),
    },
    auth.token,
  );
}

async function makeLectureWithRetry(item: QueueItem, courseTitle: string, index: number) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await makeLecture(item, courseTitle, index);
      return;
    } catch (e) {
      const code = errCode(e);
      const throttled = code === "ai_rate_limited" || code === "too_many_requests";
      if (!throttled || attempt >= 2 || genStop.value) throw e;
      for (let left = 20; left > 0 && !genStop.value; left -= 1) {
        genProgress.value = `лимит запросов, жду ${left} с`;
        await sleep(1000);
      }
    }
  }
}

async function runQueue() {
  if (!classroom.value) return;
  const courseTitle = classroom.value.course.title;
  for (const [i, item] of genQueue.value.entries()) {
    if (genStop.value) break;
    if (item.state === "done") continue;
    item.state = "run";
    genProgress.value = item.title;
    try {
      await makeLectureWithRetry(item, courseTitle, i);
      item.state = "done";
      await load();
    } catch (e) {
      item.state = "fail";
      if (isFatal(e)) {
        genErr.value = errorText(e);
        break;
      }
    }
  }
  genProgress.value = "";
}

async function generateWholeCourse() {
  if (!auth.token || !classroom.value) return;
  genStop.value = false;
  genQueue.value = [];
  genProgress.value = "составляю программу";
  const outline = await generateCourseOutline(auth.token, {
    title: classroom.value.course.title,
    description: classroom.value.course.description,
    count: genCount.value,
    notes: genNotes.value.trim() || undefined,
  });
  if (!outline.topics.length) throw new Error("пустая программа");
  genQueue.value = outline.topics.map((t) => ({
    title: t.title,
    summary: t.summary,
    state: "wait",
  }));
  genProgress.value = "";
  await runQueue();
}

async function retryFailed() {
  if (genBusy.value) return;
  genStop.value = false;
  genErr.value = "";
  for (const item of genQueue.value) if (item.state === "fail") item.state = "wait";
  genBusy.value = true;
  try {
    await runQueue();
  } finally {
    genBusy.value = false;
  }
}

async function runGenerate() {
  if (!auth.token || !classroom.value || genBusy.value) return;
  genBusy.value = true;
  genErr.value = "";
  try {
    if (genMode.value === "course") {
      await generateWholeCourse();
    } else {
      if (!genTopic.value.trim()) {
        genErr.value = "нужна тема";
        return;
      }
      const topic = genTopic.value.trim();
      genProgress.value = "пишу тему";
      const draft = await draftFor(topic, classroom.value.course.title, {
        covered: lectures.value.map((l) => l.title),
      });
      genDraft.value = { title: topic, ...draft };
      genProgress.value = "";
    }
  } catch (e) {
    genErr.value = errorText(e);
    genProgress.value = "";
  } finally {
    genBusy.value = false;
  }
}

async function saveGenerated() {
  if (!auth.token || !classroom.value || genBusy.value) return;
  genBusy.value = true;
  genErr.value = "";
  try {
    if (genDraft.value) {
      await createLecture(
        classroom.value.course.id,
        {
          title: genDraft.value.title,
          body_text: genDraft.value.body,
          video_url: "",
          ...(genDraft.value.task ? { task: genDraft.value.task } : {}),
        },
        auth.token,
      );
    }
    genOpen.value = false;
    genDraft.value = null;
    await load();
  } catch (e) {
    genErr.value = errorText(e);
  } finally {
    genBusy.value = false;
  }
}

watch(activeId, () => {
  openTaskId.value = "";
});

function onEscape(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (genOpen.value) closeGen();
  else if (chatOpen.value) chatOpen.value = false;
  else if (topicsOpen.value) topicsOpen.value = false;
}

onMounted(() => {
  document.documentElement.classList.add("course-reader");
  document.addEventListener("keydown", onEscape);
  void load();
  void loadAiStatus();
  void loadChat();
});

onBeforeUnmount(() => {
  document.documentElement.classList.remove("course-reader");
  document.removeEventListener("keydown", onEscape);
});
</script>

<template>
  <section class="reader">
    <AppLoading v-if="loading && !classroom" class="page-empty" />
    <p v-else-if="err && !classroom" class="page-empty">{{ err }}</p>

    <div v-else-if="classroom" class="reader-grid">
      <!-- темы -->
      <aside class="reader-topics" :class="{ open: topicsOpen }">
        <header class="side-head">
          <button type="button" class="filter-icon-btn" aria-label="к курсу" @click="exitReader">
            <AppIcon name="back" :size="18" />
          </button>
          <span class="side-title">{{ classroom.course.title }}</span>
        </header>

        <nav class="topic-list">
          <button
            v-for="l in lectures"
            :key="l.id"
            type="button"
            class="topic"
            :class="{ on: l.id === activeLecture?.id }"
            @click="openLecture(l.id)"
          >
            <span class="topic-title">{{ l.title }}</span>
            <AppIcon v-if="lectureDone(l.id)" name="seen" :size="15" class="topic-done" />
          </button>
          <p v-if="!lectures.length" class="side-empty muted">тем нет</p>
        </nav>

        <button v-if="canGenerate" type="button" class="side-gen secondary" @click="openGen">
          <AppIcon name="spark" :size="16" />
          <span>сгенерировать</span>
        </button>
      </aside>

      <!-- тема -->
      <main class="reader-main">
        <div class="main-bar">
          <button
            type="button"
            class="filter-icon-btn only-narrow"
            aria-label="темы"
            @click="topicsOpen = true"
          >
            <AppIcon name="list" :size="18" />
          </button>
          <span class="main-bar-title">{{ activeLecture?.title ?? "" }}</span>
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
        </article>

        <p v-else class="page-empty">тем нет</p>
      </main>

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
            class="filter-icon-btn only-narrow"
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
            placeholder="что непонятно?"
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
        <span>что непонятно?</span>
        <AppIcon name="chat" :size="18" />
      </button>
    </div>

    <div
      v-if="topicsOpen || chatOpen"
      class="panel-backdrop only-narrow"
      @click="topicsOpen = false; chatOpen = false"
    />

    <Teleport to="body">
      <div v-if="genOpen" class="gen-root" role="presentation">
        <button type="button" class="gen-backdrop" aria-label="закрыть" @click="closeGen" />
        <div class="gen-dialog" role="dialog" aria-modal="true" aria-label="генерация">
          <div class="filter-tabs">
            <button
              type="button"
              class="filter-tab"
              :class="{ on: genMode === 'course' }"
              @click="genMode = 'course'"
            >
              весь курс
            </button>
            <button
              type="button"
              class="filter-tab"
              :class="{ on: genMode === 'lecture' }"
              @click="genMode = 'lecture'"
            >
              одна тема
            </button>
          </div>

          <label v-if="genMode === 'course'" class="gen-field">
            <span class="muted small">минимум тем, больше можно</span>
            <input v-model.number="genCount" type="number" min="3" max="40" />
          </label>

          <input v-else v-model="genTopic" placeholder="тема" />

          <textarea
            v-model="genNotes"
            rows="4"
            placeholder="что должно быть в курсе: темы, подтемы, требования"
          />

          <div v-if="genMode === 'lecture' && genDraft" class="gen-preview">
            <MarkdownText :text="genDraft.body" variant="doc" />
          </div>

          <div v-if="genQueue.length" class="gen-progress">
            <div class="gen-bar"><span :style="{ width: `${genPct}%` }" /></div>
            <p class="muted small">{{ genStatus }}</p>
          </div>
          <p v-else-if="genProgress" class="muted small">{{ genProgress }}</p>
          <p v-if="genErr" class="error">{{ genErr }}</p>

          <div class="gen-actions">
            <button
              v-if="genMode === 'course' && genBusy"
              type="button"
              class="secondary"
              @click="genStop = true"
            >
              {{ genStop ? "останавливаю…" : "стоп" }}
            </button>
            <button
              v-else-if="genMode === 'course' && genFailed"
              type="button"
              class="secondary"
              @click="retryFailed"
            >
              повторить {{ genFailed }}
            </button>
            <button v-else type="button" class="secondary" :disabled="genBusy" @click="runGenerate">
              {{ genBusy ? "…" : genMode === "course" ? "создать курс" : "сгенерировать" }}
            </button>
            <button
              v-if="genMode === 'lecture'"
              type="button"
              :disabled="genBusy || !genDraft"
              @click="saveGenerated"
            >
              добавить
            </button>
            <button type="button" class="secondary" :disabled="genBusy" @click="closeGen">
              закрыть
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.reader {
  width: 100%;
}

.reader-grid {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr) 320px;
  gap: var(--space-4);
  align-items: start;
}

.reader-topics,
.reader-chat {
  position: sticky;
  top: 4.5rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.reader-topics {
  max-height: calc(100dvh - 6rem);
}

/* чат тянется на всю высоту экрана, чтобы поле ввода стояло внизу */
.reader-chat {
  height: calc(100dvh - 6rem);
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

.topic-list {
  display: grid;
  gap: 1px;
  overflow-y: auto;
  min-height: 0;
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
  font-size: 0.88rem;
  text-align: left;
  text-transform: lowercase;
}

.topic:hover,
.topic.on {
  background: var(--surface);
  color: var(--text);
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
  font-size: 0.85rem;
}

.side-gen {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.reader-main {
  min-width: 0;
  padding-bottom: var(--space-8);
}

.main-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: var(--space-3);
}

.main-bar-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 0.85rem;
  text-transform: lowercase;
}

.lecture {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}

.lecture-title {
  margin: 0;
  font-size: 1.45rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.2;
  text-transform: lowercase;
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
  font-size: 0.86rem;
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
  font-size: 0.82rem;
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
  font-size: 0.86rem;
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
  font-size: 0.82rem;
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
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
}

.task-body {
  display: grid;
  gap: var(--space-3);
  padding: 0 0 var(--space-4);
}

.task-comment {
  margin: 0;
  font-size: 0.86rem;
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
  font-size: 0.86rem;
  cursor: pointer;
}

.attach:hover {
  color: var(--text);
}

/* ---------- чат ---------- */

.reader-chat {
  border-left: 1px solid var(--border);
  padding-left: var(--space-4);
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
  font-size: 0.75rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: lowercase;
}

.chat-body {
  flex: 1;
  min-height: 12rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: grid;
  align-content: start;
  gap: 0.5rem;
  font-size: 0.88rem;
}

.chat-hint {
  margin: 0;
  font-size: 0.82rem;
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
  font-size: 0.9rem;
}

/* ---------- генерация ---------- */

.gen-root {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: var(--layout-pad);
}

.gen-backdrop {
  position: absolute;
  inset: 0;
  border: none;
  border-radius: 0;
  background: rgba(0, 0, 0, 0.55);
}

.gen-dialog {
  position: relative;
  display: grid;
  gap: var(--space-3);
  width: min(100%, 34rem);
  max-height: 85dvh;
  overflow-y: auto;
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
}

.gen-field {
  display: grid;
  gap: 0.3rem;
}

.gen-preview {
  max-height: 40dvh;
  overflow-y: auto;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.88rem;
}

.gen-progress {
  display: grid;
  gap: 0.4rem;
}

.gen-bar {
  height: 2px;
  background: var(--border);
  overflow: hidden;
}

.gen-bar span {
  display: block;
  height: 100%;
  background: var(--text);
  transition: width var(--dur-3) var(--ease-out);
}

.gen-actions {
  display: flex;
  gap: 0.4rem;
}

.gen-actions > * {
  flex: 1;
}

.only-narrow {
  display: none;
}

.panel-backdrop {
  display: none;
}

/* ---------- телефон: центр читается, чат в одно касание ---------- */

@media (max-width: 1024px) {
  .reader-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .only-narrow {
    display: inline-flex;
  }

  .reader-main {
    padding-bottom: calc(var(--control-h) + var(--space-8));
  }

  .reader-topics {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 96;
    width: min(84vw, 20rem);
    max-height: none;
    /* верх экрана занимает шапка сайта */
    padding: calc(var(--layout-pad) + 3.4rem) var(--layout-pad) var(--layout-pad);
    background: var(--bg);
    border-right: 1px solid var(--border);
    transform: translateX(-110%);
    transition: transform var(--dur-3) var(--ease-snap);
  }

  .reader-topics.open {
    transform: translateX(0);
  }

  .reader-chat {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 96;
    height: 88dvh;
    max-height: none;
    padding: var(--space-3) var(--layout-pad)
      max(var(--space-3), env(safe-area-inset-bottom));
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
    font-size: 0.94rem;
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
    font-size: 0.92rem;
    text-transform: lowercase;
  }

  .panel-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 94;
    background: rgba(0, 0, 0, 0.45);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reader-topics,
  .reader-chat {
    transition: none;
  }
}
</style>
