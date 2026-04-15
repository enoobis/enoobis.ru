<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  createAssignment,
  createCourse,
  createLecture,
  createStreamPost,
  enrollCourse,
  getClassroom,
  gradeSubmission,
  listAssignmentSubmissions,
  listCourses,
  patchAssignment,
  patchLecture,
  setClosedStudents,
  submitAssignment,
  unenrollCourse,
  uploadLectureAttachment,
  type Assignment,
  type AssignmentSubmission,
  type Course,
  type CourseClassroom,
  type Lecture,
} from "../api/courses";
import { useAuthStore } from "../stores/auth";

type Tab = "stream" | "lectures" | "assignments" | "people";

type VideoEmbed =
  | { kind: "iframe"; src: string }
  | { kind: "video"; src: string }
  | { kind: "link"; href: string }
  | null;

function lectureVideoEmbed(url: string): VideoEmbed {
  const u = url.trim();
  if (!u) return null;
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  if (yt) return { kind: "iframe", src: `https://www.youtube.com/embed/${yt[1]}` };
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: "iframe", src: `https://player.vimeo.com/video/${vm[1]}` };
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(u)) return { kind: "video", src: u };
  if (u.startsWith("http://") || u.startsWith("https://")) return { kind: "link", href: u };
  return null;
}

const auth = useAuthStore();
const courses = ref<Course[]>([]);
const classroom = ref<CourseClassroom | null>(null);
const selectedCourseId = ref("");
const tab = ref<Tab>("stream");
const err = ref("");

const title = ref("");
const description = ref("");
const isOpen = ref(true);
const studentsDraft = ref("");
const activeClosedId = ref<string | null>(null);

const streamBody = ref("");
const assignmentTitle = ref("");
const assignmentDescription = ref("");
const assignmentDueAt = ref("");
const assignmentMaxPoints = ref(100);
const submissionBody = ref<Record<string, string>>({});
const submissionsByAssignment = ref<Record<string, AssignmentSubmission[]>>({});
const grading = ref<Record<string, { points: number; comment: string }>>({});
const activeAssignmentForGrading = ref<string | null>(null);

const lectureTitle = ref("");
const lectureBody = ref("");
const lectureVideoUrl = ref("");
const lecturePendingFiles = ref<{ file_name: string; url: string }[]>([]);
const lectureUploading = ref(false);
const lectureTaskTitle = ref("");
const lectureTaskDesc = ref("");
const lectureTaskDue = ref("");
const lectureTaskMaxPoints = ref(100);

type LectureEditDraft = {
  id: string;
  title: string;
  body_text: string;
  video_url: string;
  attachments: { file_name: string; url: string }[];
};
const editingLecture = ref<LectureEditDraft | null>(null);
const lectureEditUploading = ref(false);

type AssignEditDraft = {
  id: string;
  title: string;
  description: string;
  due_at: string;
  max_points: number;
};
const editingAssignment = ref<AssignEditDraft | null>(null);

const addTaskForLectureId = ref<string | null>(null);
const addTaskTitle = ref("");
const addTaskDesc = ref("");
const addTaskDue = ref("");
const addTaskMaxPoints = ref(100);

const canTeach = computed(() => auth.role === "teacher" || auth.role === "admin");
const isTeacherInCurrent = computed(() => classroom.value?.is_teacher ?? false);

function assignmentsForLecture(lecId: string): Assignment[] {
  if (!classroom.value) return [];
  return classroom.value.assignments.filter((a) => a.lecture_id === lecId);
}

async function loadCourses() {
  err.value = "";
  if (!auth.token) return;
  try {
    courses.value = await listCourses(auth.token);
    if (!selectedCourseId.value && courses.value.length) {
      selectedCourseId.value = courses.value[0].id;
      await loadClassroom(selectedCourseId.value);
    } else if (selectedCourseId.value) {
      await loadClassroom(selectedCourseId.value);
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function loadClassroom(courseId: string) {
  if (!auth.token) return;
  try {
    classroom.value = await getClassroom(courseId, auth.token);
    selectedCourseId.value = courseId;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

onMounted(loadCourses);

async function onCreateCourse() {
  if (!auth.token) return;
  err.value = "";
  try {
    await createCourse(auth.token, {
      title: title.value,
      description: description.value,
      is_open: isOpen.value,
    });
    title.value = "";
    description.value = "";
    await loadCourses();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function onEnroll(courseId: string) {
  if (!auth.token) return;
  err.value = "";
  try {
    await enrollCourse(courseId, auth.token);
    await loadCourses();
    await loadClassroom(courseId);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function onUnenroll(courseId: string) {
  if (!auth.token) return;
  err.value = "";
  try {
    await unenrollCourse(courseId, auth.token);
    await loadCourses();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

function openClosedEditor(c: Course) {
  if (!canTeach.value || c.teacher_id !== auth.user?.id) return;
  activeClosedId.value = c.id;
  studentsDraft.value = "";
}

async function saveClosedStudents() {
  if (!auth.token || !activeClosedId.value) return;
  const ids = studentsDraft.value
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  err.value = "";
  try {
    await setClosedStudents(activeClosedId.value, ids, auth.token);
    activeClosedId.value = null;
    await loadCourses();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function onCreateStreamPost() {
  if (!auth.token || !classroom.value) return;
  const body = streamBody.value.trim();
  if (!body) return;
  err.value = "";
  try {
    await createStreamPost(classroom.value.course.id, body, auth.token);
    streamBody.value = "";
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function onCreateAssignment() {
  if (!auth.token || !classroom.value || !isTeacherInCurrent.value) return;
  err.value = "";
  try {
    await createAssignment(
      classroom.value.course.id,
      {
        title: assignmentTitle.value,
        description: assignmentDescription.value,
        due_at: assignmentDueAt.value,
        max_points: assignmentMaxPoints.value,
      },
      auth.token,
    );
    assignmentTitle.value = "";
    assignmentDescription.value = "";
    assignmentDueAt.value = "";
    assignmentMaxPoints.value = 100;
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function onSubmitAssignment(a: Assignment) {
  if (!auth.token || !classroom.value) return;
  const content = (submissionBody.value[a.id] || "").trim();
  if (!content) return;
  err.value = "";
  try {
    await submitAssignment(classroom.value.course.id, a.id, content, auth.token);
    submissionBody.value[a.id] = "";
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function openSubmissions(assignmentId: string) {
  if (!auth.token || !classroom.value || !isTeacherInCurrent.value) return;
  err.value = "";
  try {
    const list = await listAssignmentSubmissions(classroom.value.course.id, assignmentId, auth.token);
    submissionsByAssignment.value[assignmentId] = list;
    for (const s of list) {
      grading.value[s.id] = {
        points: s.grade_points ?? 0,
        comment: s.teacher_comment ?? "",
      };
    }
    activeAssignmentForGrading.value = assignmentId;
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function onLectureFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !auth.token || !classroom.value) return;
  err.value = "";
  lectureUploading.value = true;
  try {
    const r = await uploadLectureAttachment(classroom.value.course.id, file, auth.token);
    lecturePendingFiles.value = [...lecturePendingFiles.value, { file_name: r.file_name, url: r.url }];
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    lectureUploading.value = false;
  }
}

function removePendingLectureFile(idx: number) {
  lecturePendingFiles.value = lecturePendingFiles.value.filter((_, i) => i !== idx);
}

async function onCreateLecture() {
  if (!auth.token || !classroom.value || !isTeacherInCurrent.value) return;
  const t = lectureTitle.value.trim();
  if (!t) return;
  err.value = "";
  try {
    const taskTitle = lectureTaskTitle.value.trim();
    await createLecture(
      classroom.value.course.id,
      {
        title: t,
        body_text: lectureBody.value,
        video_url: lectureVideoUrl.value,
        attachments: lecturePendingFiles.value.length ? lecturePendingFiles.value : undefined,
        task: taskTitle
          ? {
              title: taskTitle,
              description: lectureTaskDesc.value || undefined,
              due_at: lectureTaskDue.value || undefined,
              max_points: lectureTaskMaxPoints.value,
            }
          : undefined,
      },
      auth.token,
    );
    lectureTitle.value = "";
    lectureBody.value = "";
    lectureVideoUrl.value = "";
    lecturePendingFiles.value = [];
    lectureTaskTitle.value = "";
    lectureTaskDesc.value = "";
    lectureTaskDue.value = "";
    lectureTaskMaxPoints.value = 100;
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

function startEditLecture(lec: Lecture) {
  editingLecture.value = {
    id: lec.id,
    title: lec.title,
    body_text: lec.body_text,
    video_url: lec.video_url,
    attachments: lec.attachments.map((x) => ({ file_name: x.file_name, url: x.url })),
  };
}

function cancelEditLecture() {
  editingLecture.value = null;
}

async function onLectureEditFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !auth.token || !classroom.value || !editingLecture.value) return;
  err.value = "";
  lectureEditUploading.value = true;
  try {
    const r = await uploadLectureAttachment(classroom.value.course.id, file, auth.token);
    editingLecture.value = {
      ...editingLecture.value,
      attachments: [...editingLecture.value.attachments, { file_name: r.file_name, url: r.url }],
    };
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  } finally {
    lectureEditUploading.value = false;
  }
}

function removeEditLectureFile(idx: number) {
  if (!editingLecture.value) return;
  editingLecture.value = {
    ...editingLecture.value,
    attachments: editingLecture.value.attachments.filter((_, i) => i !== idx),
  };
}

async function onSaveLectureEdit() {
  if (!auth.token || !classroom.value || !editingLecture.value) return;
  const d = editingLecture.value;
  const t = d.title.trim();
  if (!t) return;
  err.value = "";
  try {
    await patchLecture(
      classroom.value.course.id,
      d.id,
      {
        title: t,
        body_text: d.body_text,
        video_url: d.video_url,
        attachments: d.attachments,
      },
      auth.token,
    );
    editingLecture.value = null;
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

function startEditAssignment(a: Assignment) {
  editingAssignment.value = {
    id: a.id,
    title: a.title,
    description: a.description,
    due_at: a.due_at,
    max_points: a.max_points,
  };
}

function cancelEditAssignment() {
  editingAssignment.value = null;
}

async function onSaveAssignmentEdit() {
  if (!auth.token || !classroom.value || !editingAssignment.value) return;
  const d = editingAssignment.value;
  if (!d.title.trim()) return;
  err.value = "";
  try {
    await patchAssignment(classroom.value.course.id, d.id, {
      title: d.title.trim(),
      description: d.description,
      due_at: d.due_at,
      max_points: d.max_points,
    }, auth.token);
    editingAssignment.value = null;
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

function openAddTaskForm(lecId: string) {
  addTaskForLectureId.value = lecId;
  addTaskTitle.value = "";
  addTaskDesc.value = "";
  addTaskDue.value = "";
  addTaskMaxPoints.value = 100;
}

function cancelAddTask() {
  addTaskForLectureId.value = null;
}

async function onSaveAddTaskToLecture(lecId: string) {
  if (!auth.token || !classroom.value) return;
  const t = addTaskTitle.value.trim();
  if (!t) return;
  err.value = "";
  try {
    await createAssignment(
      classroom.value.course.id,
      {
        title: t,
        description: addTaskDesc.value || undefined,
        due_at: addTaskDue.value || undefined,
        max_points: addTaskMaxPoints.value,
        lecture_id: lecId,
      },
      auth.token,
    );
    addTaskForLectureId.value = null;
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

async function onGradeSubmission(assignmentId: string, s: AssignmentSubmission) {
  if (!auth.token || !classroom.value) return;
  const draft = grading.value[s.id];
  if (!draft) return;
  err.value = "";
  try {
    await gradeSubmission(
      classroom.value.course.id,
      assignmentId,
      s.id,
      { grade_points: Number(draft.points), teacher_comment: draft.comment },
      auth.token,
    );
    await openSubmissions(assignmentId);
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}
</script>

<template>
  <section>
    <h1>Курсы (Classroom)</h1>
    <p class="muted">Лента, лекции (видео, текст, файлы), задания, участники.</p>
    <p v-if="err" class="error">{{ err }}</p>

    <div v-if="canTeach" class="card" style="margin-bottom: 1rem">
      <h2>Создать курс</h2>
      <input v-model="title" placeholder="Название курса" />
      <textarea v-model="description" placeholder="Описание курса" rows="3" style="margin-top: 0.5rem" />
      <label style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem">
        <input v-model="isOpen" type="checkbox" style="width: auto" />
        Открытый курс
      </label>
      <button type="button" style="margin-top: 0.75rem" @click="onCreateCourse">Создать</button>
    </div>

    <div class="grid-2 course-layout">
      <aside class="card">
        <h2>Список курсов</h2>
        <div v-for="c in courses" :key="c.id" class="course-list-item" :class="{ active: selectedCourseId === c.id }">
          <button class="secondary" type="button" @click="loadClassroom(c.id)">{{ c.title }}</button>
          <div class="muted">{{ c.teacher_nickname }} · {{ c.is_open ? "открытый" : "закрытый" }}</div>
          <div style="display: flex; gap: 0.4rem; margin-top: 0.45rem; flex-wrap: wrap">
            <button v-if="c.is_open && !c.enrolled" type="button" @click="onEnroll(c.id)">Записаться</button>
            <button v-if="c.is_open && c.enrolled" class="secondary" type="button" @click="onUnenroll(c.id)">Покинуть</button>
            <button
              v-if="!c.is_open && canTeach && c.teacher_id === auth.user?.id"
              class="secondary"
              type="button"
              @click="openClosedEditor(c)"
            >
              Ученики (UUID)
            </button>
          </div>
        </div>
      </aside>

      <div class="card" v-if="classroom">
        <h2>{{ classroom.course.title }}</h2>
        <p class="muted">{{ classroom.course.description }}</p>

        <div class="tab-row">
          <button :class="{ secondary: tab !== 'stream' }" type="button" @click="tab = 'stream'">Лента</button>
          <button :class="{ secondary: tab !== 'lectures' }" type="button" @click="tab = 'lectures'">Лекции</button>
          <button :class="{ secondary: tab !== 'assignments' }" type="button" @click="tab = 'assignments'">Задания</button>
          <button :class="{ secondary: tab !== 'people' }" type="button" @click="tab = 'people'">Участники</button>
        </div>

        <template v-if="tab === 'stream'">
          <div class="card" style="margin-top: 0.7rem">
            <h3>Новый пост</h3>
            <textarea v-model="streamBody" rows="3" placeholder="Объявление / сообщение в курс" />
            <button type="button" style="margin-top: 0.5rem" @click="onCreateStreamPost">Опубликовать</button>
          </div>
          <div v-for="post in classroom.stream" :key="post.id" class="card" style="margin-top: 0.7rem">
            <div class="muted">{{ post.author_nickname }} · {{ post.created_at.slice(0, 16).replace("T", " ") }}</div>
            <p style="margin: 0.45rem 0 0">{{ post.body }}</p>
          </div>
          <p v-if="!classroom.stream.length" class="muted" style="margin-top: 0.7rem">Лента пока пустая.</p>
        </template>

        <template v-else-if="tab === 'lectures'">
          <div v-if="isTeacherInCurrent" class="card" style="margin-top: 0.7rem">
            <h3>Новая лекция</h3>
            <input v-model="lectureTitle" placeholder="Название лекции" />
            <textarea
              v-model="lectureBody"
              rows="5"
              placeholder="Текст лекции (можно оставить пустым, если есть видео, вложения или задание)"
              style="margin-top: 0.5rem"
            />
            <input
              v-model="lectureVideoUrl"
              placeholder="Ссылка на видео (YouTube, Vimeo или прямой URL mp4/webm)"
              style="margin-top: 0.5rem; width: 100%"
            />
            <div style="margin-top: 0.55rem">
              <input type="file" :disabled="lectureUploading" @change="onLectureFileChange" />
              <p class="muted" style="margin: 0.35rem 0 0; font-size: 0.9em">
                {{ lectureUploading ? "Загрузка…" : "До 20 МБ: pdf, документы, архивы, изображения, аудио, mp4 и др." }}
              </p>
              <ul v-if="lecturePendingFiles.length" class="pending-files">
                <li v-for="(f, i) in lecturePendingFiles" :key="f.url + i">
                  <span>{{ f.file_name }}</span>
                  <button class="secondary" type="button" @click="removePendingLectureFile(i)">Убрать</button>
                </li>
              </ul>
            </div>
            <div class="lecture-task-create" style="margin-top: 0.75rem">
              <h4 style="margin: 0 0 0.35rem">Задание к лекции (необязательно)</h4>
              <input v-model="lectureTaskTitle" placeholder="Название задания" />
              <textarea v-model="lectureTaskDesc" rows="2" placeholder="Описание" style="margin-top: 0.45rem" />
              <div class="grid-2" style="margin-top: 0.45rem">
                <input v-model="lectureTaskDue" placeholder="Дедлайн (например 2026-04-20 18:00)" />
                <input v-model.number="lectureTaskMaxPoints" type="number" min="1" max="1000" placeholder="Баллы" />
              </div>
            </div>
            <button type="button" style="margin-top: 0.65rem" :disabled="lectureUploading" @click="onCreateLecture">
              Опубликовать лекцию
            </button>
          </div>

          <div v-for="lec in classroom.lectures" :key="lec.id" class="card lecture-card">
            <template v-if="editingLecture?.id === lec.id">
              <h3>Редактирование лекции</h3>
              <input v-model="editingLecture.title" placeholder="Название" />
              <textarea v-model="editingLecture.body_text" rows="5" style="margin-top: 0.5rem" />
              <input v-model="editingLecture.video_url" placeholder="Видео URL" style="margin-top: 0.5rem; width: 100%" />
              <div style="margin-top: 0.5rem">
                <input type="file" :disabled="lectureEditUploading" @change="onLectureEditFileChange" />
                <p class="muted" style="margin: 0.35rem 0 0; font-size: 0.9em">
                  {{ lectureEditUploading ? "Загрузка…" : "Вложения (список ниже заменится при сохранении)" }}
                </p>
                <ul v-if="editingLecture.attachments.length" class="pending-files">
                  <li v-for="(f, i) in editingLecture.attachments" :key="f.url + i">
                    <span>{{ f.file_name }}</span>
                    <button class="secondary" type="button" @click="removeEditLectureFile(i)">Убрать</button>
                  </li>
                </ul>
              </div>
              <div style="margin-top: 0.55rem; display: flex; gap: 0.5rem; flex-wrap: wrap">
                <button type="button" :disabled="lectureEditUploading" @click="onSaveLectureEdit">Сохранить</button>
                <button class="secondary" type="button" @click="cancelEditLecture">Отмена</button>
              </div>
            </template>
            <template v-else>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; flex-wrap: wrap">
                <h3 style="margin: 0">{{ lec.title }}</h3>
                <button v-if="isTeacherInCurrent" class="secondary" type="button" @click="startEditLecture(lec)">
                  Редактировать
                </button>
              </div>
              <p class="muted">{{ lec.author_nickname }} · {{ lec.created_at.slice(0, 16).replace("T", " ") }}</p>
              <template v-for="ev in [lectureVideoEmbed(lec.video_url)]" :key="'v-' + lec.id">
                <div v-if="ev" class="lecture-video">
                  <iframe
                    v-if="ev.kind === 'iframe'"
                    :src="ev.src"
                    title="video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowfullscreen
                  />
                  <video v-else-if="ev.kind === 'video'" :src="ev.src" controls />
                  <a v-else-if="ev.kind === 'link'" :href="ev.href" target="_blank" rel="noopener noreferrer">
                    Открыть видео
                  </a>
                </div>
              </template>
              <p v-if="lec.body_text" class="lecture-body">{{ lec.body_text }}</p>
              <ul v-if="lec.attachments.length" class="attach-list">
                <li v-for="att in lec.attachments" :key="att.id">
                  <a :href="att.url" target="_blank" rel="noopener noreferrer">{{ att.file_name }}</a>
                </li>
              </ul>

              <div v-if="assignmentsForLecture(lec.id).length" class="lecture-assignments">
                <h4>Задания по лекции</h4>
                <div v-for="a in assignmentsForLecture(lec.id)" :key="a.id" class="card" style="margin-top: 0.45rem">
                  <template v-if="editingAssignment?.id === a.id">
                    <input v-model="editingAssignment.title" placeholder="Название" />
                    <textarea v-model="editingAssignment.description" rows="2" style="margin-top: 0.35rem" />
                    <div class="grid-2" style="margin-top: 0.35rem">
                      <input v-model="editingAssignment.due_at" placeholder="Дедлайн" />
                      <input v-model.number="editingAssignment.max_points" type="number" min="1" max="1000" />
                    </div>
                    <div style="margin-top: 0.45rem; display: flex; gap: 0.45rem">
                      <button type="button" @click="onSaveAssignmentEdit">Сохранить</button>
                      <button class="secondary" type="button" @click="cancelEditAssignment">Отмена</button>
                    </div>
                  </template>
                  <template v-else>
                    <strong>{{ a.title }}</strong>
                    <p class="muted" style="margin: 0.25rem 0">
                      Дедлайн: {{ a.due_at || "нет" }} · {{ a.max_points }} баллов · {{ a.author_nickname }}
                    </p>
                    <p v-if="a.description">{{ a.description }}</p>
                    <template v-if="isTeacherInCurrent">
                      <button class="secondary" type="button" style="margin-top: 0.35rem" @click="startEditAssignment(a)">
                        Изменить задание
                      </button>
                      <button class="secondary" type="button" style="margin-top: 0.35rem" @click="openSubmissions(a.id)">
                        Проверить сдачи
                      </button>
                    </template>
                    <template v-else>
                      <textarea
                        v-model="submissionBody[a.id]"
                        rows="2"
                        placeholder="Ссылка/текст сдачи"
                        style="margin-top: 0.35rem"
                      />
                      <button type="button" style="margin-top: 0.35rem" @click="onSubmitAssignment(a)">Сдать / пересдать</button>
                      <p v-if="a.my_submission" class="muted" style="margin-top: 0.35rem">
                        Статус: {{ a.my_submission.status }}
                        <span v-if="a.my_submission.grade_points !== null"> · Оценка: {{ a.my_submission.grade_points }}</span>
                      </p>
                    </template>
                  </template>
                </div>
              </div>

              <div v-if="isTeacherInCurrent" class="lecture-add-task" style="margin-top: 0.65rem">
                <template v-if="addTaskForLectureId === lec.id">
                  <h4 style="margin: 0 0 0.35rem">Новое задание к лекции</h4>
                  <input v-model="addTaskTitle" placeholder="Название" />
                  <textarea v-model="addTaskDesc" rows="2" placeholder="Описание" style="margin-top: 0.35rem" />
                  <div class="grid-2" style="margin-top: 0.35rem">
                    <input v-model="addTaskDue" placeholder="Дедлайн" />
                    <input v-model.number="addTaskMaxPoints" type="number" min="1" max="1000" />
                  </div>
                  <div style="margin-top: 0.45rem; display: flex; gap: 0.45rem">
                    <button type="button" @click="onSaveAddTaskToLecture(lec.id)">Добавить</button>
                    <button class="secondary" type="button" @click="cancelAddTask">Отмена</button>
                  </div>
                </template>
                <button v-else class="secondary" type="button" @click="openAddTaskForm(lec.id)">+ Задание к лекции</button>
              </div>
            </template>
          </div>
          <p v-if="!classroom.lectures.length" class="muted" style="margin-top: 0.7rem">Лекций пока нет.</p>
        </template>

        <template v-else-if="tab === 'assignments'">
          <div v-if="isTeacherInCurrent" class="card" style="margin-top: 0.7rem">
            <h3>Создать задание</h3>
            <input v-model="assignmentTitle" placeholder="Название задания" />
            <textarea
              v-model="assignmentDescription"
              rows="3"
              placeholder="Описание задания"
              style="margin-top: 0.5rem"
            />
            <div class="grid-2" style="margin-top: 0.5rem">
              <input v-model="assignmentDueAt" placeholder="Дедлайн (например 2026-04-20 18:00)" />
              <input v-model.number="assignmentMaxPoints" type="number" min="1" max="1000" placeholder="Баллы" />
            </div>
            <button type="button" style="margin-top: 0.6rem" @click="onCreateAssignment">Создать</button>
          </div>

          <div v-for="a in classroom.assignments" :key="a.id" class="card" style="margin-top: 0.7rem">
            <h3>{{ a.title }}</h3>
            <p class="muted">
              due: {{ a.due_at || "без дедлайна" }} · max: {{ a.max_points }} · {{ a.author_nickname }}
              <span v-if="a.lecture_id" class="muted"> · к лекции</span>
            </p>
            <p>{{ a.description }}</p>

            <template v-if="!isTeacherInCurrent">
              <textarea
                v-model="submissionBody[a.id]"
                rows="2"
                placeholder="Ссылка/текст вашей сдачи"
              />
              <button type="button" style="margin-top: 0.45rem" @click="onSubmitAssignment(a)">Сдать / пересдать</button>
              <p v-if="a.my_submission" class="muted" style="margin-top: 0.45rem">
                Статус: {{ a.my_submission.status }}
                <span v-if="a.my_submission.grade_points !== null"> · Оценка: {{ a.my_submission.grade_points }}</span>
                <span v-if="a.my_submission.teacher_comment"> · Коммент: {{ a.my_submission.teacher_comment }}</span>
              </p>
            </template>

            <template v-else>
              <button class="secondary" type="button" @click="openSubmissions(a.id)">Проверить сдачи</button>
            </template>
          </div>
          <p v-if="!classroom.assignments.length" class="muted" style="margin-top: 0.7rem">Заданий пока нет.</p>
        </template>

        <template v-else>
          <ul style="list-style: none; padding: 0; margin-top: 0.6rem">
            <li v-for="m in classroom.members" :key="m.id" class="card" style="margin-bottom: 0.5rem">
              <strong>{{ m.nickname }}</strong>
              <span class="muted"> · {{ m.role }}</span>
            </li>
          </ul>
        </template>
      </div>
    </div>

    <div v-if="activeClosedId" class="card" style="margin-top: 1rem">
      <h3>Доступ к закрытому курсу</h3>
      <p class="muted">Введите UUID учеников через пробел или новую строку.</p>
      <textarea v-model="studentsDraft" rows="4" placeholder="uuid..." />
      <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem">
        <button type="button" @click="saveClosedStudents">Сохранить</button>
        <button class="secondary" type="button" @click="activeClosedId = null">Отмена</button>
      </div>
    </div>

    <div v-if="activeAssignmentForGrading" class="card" style="margin-top: 1rem">
      <h3>Проверка сдач</h3>
      <div
        v-for="s in submissionsByAssignment[activeAssignmentForGrading] || []"
        :key="s.id"
        class="card"
        style="margin-bottom: 0.55rem"
      >
        <div class="muted">{{ s.student_nickname }} · {{ s.updated_at.slice(0, 16).replace("T", " ") }}</div>
        <p style="margin: 0.35rem 0">{{ s.content }}</p>
        <div class="grid-2">
          <input v-model.number="grading[s.id].points" type="number" min="0" placeholder="Оценка" />
          <input v-model="grading[s.id].comment" placeholder="Комментарий учителя" />
        </div>
        <button
          type="button"
          style="margin-top: 0.45rem"
          @click="onGradeSubmission(activeAssignmentForGrading, s)"
        >
          Поставить оценку
        </button>
      </div>
      <button class="secondary" type="button" @click="activeAssignmentForGrading = null">Закрыть</button>
    </div>
  </section>
</template>

<style scoped>
.course-layout {
  align-items: flex-start;
}

.course-list-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.6rem;
  margin-bottom: 0.55rem;
}

.course-list-item.active {
  border-color: var(--accent-dim);
}

.tab-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.45rem;
}

.pending-files {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
}

.pending-files li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--border);
}

.lecture-card {
  margin-top: 0.7rem;
}

.lecture-video {
  margin-top: 0.55rem;
}

.lecture-video iframe {
  width: 100%;
  max-width: 720px;
  aspect-ratio: 16 / 9;
  border: 0;
  border-radius: 8px;
}

.lecture-video video {
  width: 100%;
  max-width: 720px;
  border-radius: 8px;
}

.lecture-body {
  margin: 0.55rem 0 0;
  white-space: pre-wrap;
  line-height: 1.45;
}

.attach-list {
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
}
</style>
