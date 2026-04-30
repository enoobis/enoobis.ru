<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  createAssignment,
  createCourse,
  createStreamComment,
  createLecture,
  createStreamPost,
  enrollCourse,
  joinCourseByCode,
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

type Tab = "stream" | "lectures" | "assignments" | "people" | "grades" | "calendar";
type GradebookCell = {
  assignment: Assignment;
  submission: AssignmentSubmission | null;
};

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
const route = useRoute();
const router = useRouter();
const courses = ref<Course[]>([]);
const classroom = ref<CourseClassroom | null>(null);
const selectedCourseId = ref("");
const allowedTabs: readonly Tab[] = ["stream", "lectures", "assignments", "people", "grades", "calendar"];
function normalizeTab(value: unknown): Tab {
  if (typeof value === "string" && allowedTabs.includes(value as Tab)) return value as Tab;
  return "stream";
}
const tab = ref<Tab>(normalizeTab(route.params.tab));
const err = ref("");

const title = ref("");
const description = ref("");
const isOpen = ref(true);
const studentsDraft = ref("");
const joinCode = ref("");
const activeClosedId = ref<string | null>(null);

const streamBody = ref("");
const assignmentTitle = ref("");
const assignmentDescription = ref("");
const assignmentDueAt = ref("");
const assignmentMaxPoints = ref(100);
const submissionBody = ref<Record<string, string>>({});
const streamCommentBody = ref<Record<string, string>>({});
const submissionsByAssignment = ref<Record<string, AssignmentSubmission[]>>({});
const grading = ref<Record<string, { points: number; comment: string }>>({});
const activeAssignmentForGrading = ref<string | null>(null);
const teacherSubmissionsByAssignment = ref<Record<string, AssignmentSubmission[]>>({});
const teacherGradebookLoading = ref(false);
const teacherGradebookError = ref("");
const teacherGradebookLoadedFor = ref("");

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
const selectedCourseMeta = computed(() => courses.value.find((c) => c.id === selectedCourseId.value) ?? null);

const courseStats = computed(() => ({
  stream: classroom.value?.stream.length ?? 0,
  lectures: classroom.value?.lectures.length ?? 0,
  assignments: classroom.value?.assignments.length ?? 0,
  members: classroom.value?.members.length ?? 0,
}));

function roleLabel(role: string): string {
  if (role === "teacher") return "преподаватель";
  if (role === "admin") return "админ";
  if (role === "student") return "студент";
  return role;
}

function parseDueDate(raw: string): Date | null {
  const value = raw?.trim();
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDateTime(raw: string): string {
  const parsed = parseDueDate(raw);
  if (!parsed) return raw || "без дедлайна";
  return parsed.toLocaleString("ru-RU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const calendarAssignments = computed(() => {
  if (!classroom.value) return [];
  return classroom.value.assignments
    .filter((a) => parseDueDate(a.due_at))
    .map((a) => ({
      ...a,
      dueDate: parseDueDate(a.due_at)!,
    }))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
});

const teacherGradebookMatrix = computed<Record<string, Record<string, AssignmentSubmission>>>(() => {
  const matrix: Record<string, Record<string, AssignmentSubmission>> = {};
  for (const [assignmentId, list] of Object.entries(teacherSubmissionsByAssignment.value)) {
    for (const submission of list) {
      if (!matrix[submission.student_id]) matrix[submission.student_id] = {};
      matrix[submission.student_id][assignmentId] = submission;
    }
  }
  return matrix;
});

const teacherGradebookRows = computed(() => {
  if (!classroom.value || !isTeacherInCurrent.value) return [];
  const assignments = classroom.value.assignments;
  const students = classroom.value.members.filter((m) => m.role === "student");
  const maxTotal = assignments.reduce((sum, a) => sum + a.max_points, 0);
  return students.map((student) => {
    const cells: GradebookCell[] = assignments.map((assignment) => ({
      assignment,
      submission: teacherGradebookMatrix.value[student.id]?.[assignment.id] ?? null,
    }));
    let gradedCount = 0;
    let pointsEarned = 0;
    let submittedCount = 0;
    for (const cell of cells) {
      if (!cell.submission) continue;
      submittedCount += 1;
      if (cell.submission.grade_points !== null) {
        gradedCount += 1;
        pointsEarned += cell.submission.grade_points;
      }
    }
    return {
      student,
      cells,
      submittedCount,
      gradedCount,
      pointsEarned,
      pointsTotal: maxTotal,
    };
  });
});

const studentGradeRows = computed(() => {
  if (!classroom.value || isTeacherInCurrent.value) return [];
  const assignments = classroom.value.assignments;
  const me = classroom.value.members.find((m) => m.id === auth.user?.id);
  if (!me) return [];
  let pointsEarned = 0;
  let pointsTotal = 0;
  for (const a of assignments) {
    if (a.my_submission?.grade_points !== null && a.my_submission?.grade_points !== undefined) {
      pointsEarned += a.my_submission.grade_points;
      pointsTotal += a.max_points;
    }
  }
  return [
    {
      student: me,
      pointsEarned,
      pointsTotal,
      progress: `${assignments.length} заданий`,
    },
  ];
});

function assignmentsForLecture(lecId: string): Assignment[] {
  if (!classroom.value) return [];
  return classroom.value.assignments.filter((a) => a.lecture_id === lecId);
}

function syncRouteState(courseId: string, nextTab: Tab = tab.value) {
  if (!courseId) return;
  const currentCourseId = typeof route.params.courseId === "string" ? route.params.courseId : "";
  const currentTab = normalizeTab(route.params.tab);
  if (currentCourseId === courseId && currentTab === nextTab) return;
  router
    .replace({
      name: "course-classroom",
      params: { courseId, tab: nextTab },
    })
    .catch(() => undefined);
}

async function openCourse(courseId: string) {
  await loadClassroom(courseId);
  syncRouteState(courseId);
}

function invalidateTeacherGradebook() {
  teacherGradebookLoadedFor.value = "";
  teacherSubmissionsByAssignment.value = {};
}

async function loadTeacherGradebook(force = false) {
  if (!auth.token || !classroom.value || !isTeacherInCurrent.value) return;
  const courseId = classroom.value.course.id;
  const assignmentIds = classroom.value.assignments.map((a) => a.id);
  const cacheKey = `${courseId}:${assignmentIds.join(",")}`;
  if (!force && teacherGradebookLoadedFor.value === cacheKey) return;
  teacherGradebookLoading.value = true;
  teacherGradebookError.value = "";
  try {
    const pairs = await Promise.all(
      classroom.value.assignments.map(async (assignment) => {
        const submissions = await listAssignmentSubmissions(courseId, assignment.id, auth.token!);
        return [assignment.id, submissions] as const;
      }),
    );
    teacherSubmissionsByAssignment.value = Object.fromEntries(pairs);
    teacherGradebookLoadedFor.value = cacheKey;
  } catch (e) {
    teacherGradebookError.value = e instanceof Error ? e.message : "Ошибка загрузки ведомости";
  } finally {
    teacherGradebookLoading.value = false;
  }
}

async function loadCourses() {
  err.value = "";
  if (!auth.token) return;
  try {
    courses.value = await listCourses(auth.token);
    const routeCourseId = typeof route.params.courseId === "string" ? route.params.courseId : "";
    const hasRouteCourse = routeCourseId && courses.value.some((c) => c.id === routeCourseId);
    const initialCourseId = hasRouteCourse ? routeCourseId : selectedCourseId.value;
    if (!initialCourseId && courses.value.length) {
      selectedCourseId.value = courses.value[0].id;
      await loadClassroom(selectedCourseId.value);
      syncRouteState(selectedCourseId.value);
    } else if (initialCourseId) {
      selectedCourseId.value = initialCourseId;
      await loadClassroom(initialCourseId);
      syncRouteState(initialCourseId);
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
    invalidateTeacherGradebook();
    if (tab.value === "grades") await loadTeacherGradebook(true);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Ошибка";
  }
}

onMounted(loadCourses);

watch(
  () => route.params.tab,
  (next) => {
    tab.value = normalizeTab(next);
  },
);

watch(
  () => route.params.courseId,
  async (next) => {
    const nextCourse = typeof next === "string" ? next : "";
    if (!nextCourse || nextCourse === selectedCourseId.value || !auth.token) return;
    if (courses.value.some((c) => c.id === nextCourse)) {
      await loadClassroom(nextCourse);
    }
  },
);

watch(tab, async (next) => {
  if (selectedCourseId.value) syncRouteState(selectedCourseId.value, next);
  if (next === "grades") await loadTeacherGradebook();
});

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

async function onJoinByCode() {
  if (!auth.token) return;
  const code = joinCode.value.trim();
  if (!code) return;
  err.value = "";
  try {
    const joined = await joinCourseByCode(code, auth.token);
    joinCode.value = "";
    await loadCourses();
    await loadClassroom(joined.id);
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

async function onCreateStreamComment(postId: string) {
  if (!auth.token || !classroom.value) return;
  const body = (streamCommentBody.value[postId] || "").trim();
  if (!body) return;
  err.value = "";
  try {
    await createStreamComment(classroom.value.course.id, postId, body, auth.token);
    streamCommentBody.value[postId] = "";
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
  <section class="classroom-page">
    <div class="classroom-hero card">
      <h1>Курсы</h1>
      <p class="muted">Classroom-режим: лента, задания, участники, календарь и оценки.</p>
    </div>
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

    <div class="card" style="margin-bottom: 1rem">
      <h2>Вступить по коду курса</h2>
      <div class="join-by-code">
        <input v-model="joinCode" placeholder="Введите код курса (например A1B2C3)" @keyup.enter="onJoinByCode" />
        <button type="button" @click="onJoinByCode">Вступить</button>
      </div>
    </div>

    <div class="courses-board card">
      <div class="courses-board-head">
        <h2>Мои курсы</h2>
        <p class="muted">Карточки как в Classroom: быстро открыть курс, записаться или выйти.</p>
      </div>
      <div class="courses-grid">
        <article v-for="c in courses" :key="c.id" class="course-tile" :class="{ active: selectedCourseId === c.id }">
          <button class="course-tile-cover" type="button" @click="openCourse(c.id)">
            <span class="course-tile-chip">{{ c.is_open ? "открытый" : "закрытый" }}</span>
            <strong>{{ c.title }}</strong>
            <span class="muted">Преподаватель: {{ c.teacher_nickname }}</span>
            <span class="muted">Код: {{ c.course_code }}</span>
          </button>
          <div class="course-tile-actions">
            <button class="secondary" type="button" @click="openCourse(c.id)">
              {{ selectedCourseId === c.id ? "Открыт" : "Открыть" }}
            </button>
            <button v-if="c.is_open && !c.enrolled" type="button" @click="onEnroll(c.id)">Записаться</button>
            <button v-if="c.is_open && c.enrolled" class="secondary" type="button" @click="onUnenroll(c.id)">Покинуть</button>
            <button
              v-if="!c.is_open && canTeach && c.teacher_id === auth.user?.id"
              class="secondary"
              type="button"
              @click="openClosedEditor(c)"
            >
              Доступ (UUID)
            </button>
          </div>
        </article>
      </div>
      <p v-if="!courses.length" class="muted">Пока нет доступных курсов.</p>
    </div>

    <div class="card classroom-main" v-if="classroom">
        <header class="classroom-header">
          <p class="classroom-header-label">Класс</p>
          <h2>{{ classroom.course.title }}</h2>
          <p class="muted">{{ classroom.course.description }}</p>
          <p v-if="selectedCourseMeta" class="muted">
            Ведёт:
            <RouterLink :to="`/u/${selectedCourseMeta.teacher_nickname}`">{{ selectedCourseMeta.teacher_nickname }}</RouterLink>
          </p>
          <p class="muted">Код курса: <strong>{{ classroom.course.course_code }}</strong></p>
        </header>
        <div class="classroom-meta-row">
          <span class="badge">Постов: {{ courseStats.stream }}</span>
          <span class="badge">Материалов: {{ courseStats.lectures }}</span>
          <span class="badge">Заданий: {{ courseStats.assignments }}</span>
          <span class="badge">Участников: {{ courseStats.members }}</span>
        </div>
        <div class="quick-actions">
          <button class="secondary" type="button" @click="tab = 'stream'">Написать в ленту</button>
          <button class="secondary" type="button" @click="tab = 'assignments'">Перейти к заданиям</button>
          <button class="secondary" type="button" @click="tab = 'people'">Открыть участников</button>
          <button class="secondary" type="button" @click="tab = 'calendar'">Смотреть дедлайны</button>
        </div>

        <div class="tab-row">
          <button class="tab-pill" :class="{ active: tab === 'stream' }" type="button" @click="tab = 'stream'">Лента</button>
          <button class="tab-pill" :class="{ active: tab === 'lectures' }" type="button" @click="tab = 'lectures'">Материалы</button>
          <button class="tab-pill" :class="{ active: tab === 'assignments' }" type="button" @click="tab = 'assignments'">Задания</button>
          <button class="tab-pill" :class="{ active: tab === 'people' }" type="button" @click="tab = 'people'">Участники</button>
          <button class="tab-pill" :class="{ active: tab === 'grades' }" type="button" @click="tab = 'grades'">Оценки</button>
          <button class="tab-pill" :class="{ active: tab === 'calendar' }" type="button" @click="tab = 'calendar'">Календарь</button>
        </div>

        <template v-if="tab === 'stream'">
          <div class="card" style="margin-top: 0.7rem">
            <h3>Новый пост</h3>
            <textarea v-model="streamBody" rows="3" placeholder="Объявление / сообщение в курс" />
            <button type="button" style="margin-top: 0.5rem" @click="onCreateStreamPost">Опубликовать</button>
          </div>
          <div v-for="post in classroom.stream" :key="post.id" class="card" style="margin-top: 0.7rem">
            <div class="muted">
              <RouterLink :to="`/u/${post.author_nickname}`">{{ post.author_nickname }}</RouterLink>
              · {{ post.created_at.slice(0, 16).replace("T", " ") }}
            </div>
            <p style="margin: 0.45rem 0 0">{{ post.body }}</p>
            <div class="stream-comments">
              <div v-if="post.comments.length" class="stream-comment-list">
                <div v-for="comment in post.comments" :key="comment.id" class="stream-comment">
                  <div class="muted">
                    <RouterLink :to="`/u/${comment.author_nickname}`">{{ comment.author_nickname }}</RouterLink>
                    · {{ comment.created_at.slice(0, 16).replace("T", " ") }}
                  </div>
                  <p>{{ comment.body }}</p>
                </div>
              </div>
              <div class="stream-comment-form">
                <input
                  v-model="streamCommentBody[post.id]"
                  placeholder="Комментарий к посту"
                  @keyup.enter="onCreateStreamComment(post.id)"
                />
                <button class="secondary" type="button" @click="onCreateStreamComment(post.id)">Ответить</button>
              </div>
            </div>
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
              <p class="muted">
                <RouterLink :to="`/u/${lec.author_nickname}`">{{ lec.author_nickname }}</RouterLink>
                · {{ lec.created_at.slice(0, 16).replace("T", " ") }}
              </p>
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
                      Дедлайн: {{ a.due_at || "нет" }} · {{ a.max_points }} баллов ·
                      <RouterLink :to="`/u/${a.author_nickname}`">{{ a.author_nickname }}</RouterLink>
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
              due: {{ a.due_at || "без дедлайна" }} · max: {{ a.max_points }} ·
              <RouterLink :to="`/u/${a.author_nickname}`">{{ a.author_nickname }}</RouterLink>
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

        <template v-else-if="tab === 'people'">
          <ul style="list-style: none; padding: 0; margin-top: 0.6rem">
            <li v-for="m in classroom.members" :key="m.id" class="card" style="margin-bottom: 0.5rem">
              <strong><RouterLink :to="`/u/${m.nickname}`">{{ m.nickname }}</RouterLink></strong>
              <span class="muted"> · {{ roleLabel(m.role) }}</span>
            </li>
          </ul>
        </template>
        <template v-else-if="tab === 'grades'">
          <div class="card" style="margin-top: 0.7rem">
            <h3>Сводка оценок</h3>
            <template v-if="isTeacherInCurrent">
              <p class="muted">Ведомость строится автоматически по текущим сдачам по каждому заданию.</p>
              <p v-if="teacherGradebookError" class="error">{{ teacherGradebookError }}</p>
              <p v-else-if="teacherGradebookLoading" class="muted">Загрузка ведомости…</p>
              <div v-else-if="teacherGradebookRows.length" class="gradebook-wrap">
                <table class="gradebook-table">
                  <thead>
                    <tr>
                      <th>Студент</th>
                      <th v-for="a in classroom.assignments" :key="'h-' + a.id">{{ a.title }}</th>
                      <th>Итог</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in teacherGradebookRows" :key="row.student.id">
                      <td class="gradebook-student">{{ row.student.nickname }}</td>
                      <td v-for="cell in row.cells" :key="row.student.id + '-' + cell.assignment.id">
                        <span v-if="!cell.submission" class="muted">—</span>
                        <span v-else-if="cell.submission.grade_points !== null" class="grade-chip grade-chip-ok">
                          {{ cell.submission.grade_points }} / {{ cell.assignment.max_points }}
                        </span>
                        <span v-else class="grade-chip grade-chip-pending">сдано</span>
                      </td>
                      <td>
                        <strong>{{ row.pointsEarned }} / {{ row.pointsTotal }}</strong>
                        <div class="muted">{{ row.gradedCount }} проверено · {{ row.submittedCount }} сдано</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="muted">Студентов пока нет или задания ещё не созданы.</p>
            </template>
            <div v-else class="grades-grid">
              <div class="grades-head">Студент</div>
              <div class="grades-head">Прогресс</div>
              <div class="grades-head">Баллы</div>
              <template v-for="row in studentGradeRows" :key="row.student.id">
                <div>{{ row.student.nickname }}</div>
                <div class="muted">{{ row.progress }}</div>
                <div>{{ row.pointsEarned }} / {{ row.pointsTotal }}</div>
              </template>
            </div>
          </div>
        </template>
        <template v-else-if="tab === 'calendar'">
          <div class="card" style="margin-top: 0.7rem">
            <h3>Ближайшие дедлайны</h3>
            <div v-if="calendarAssignments.length">
              <div v-for="item in calendarAssignments" :key="item.id" class="calendar-item">
                <div>
                  <strong>{{ item.title }}</strong>
                  <p class="muted" style="margin: 0.2rem 0 0">
                    {{ item.lecture_id ? "К лекции" : "Общее задание" }} · {{ item.max_points }} баллов
                  </p>
                </div>
                <span class="badge">{{ formatDateTime(item.due_at) }}</span>
              </div>
            </div>
            <p v-else class="muted">Пока нет заданий с дедлайном.</p>
          </div>
        </template>
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
.classroom-page {
  display: grid;
  gap: 1rem;
}

.classroom-hero {
  background: linear-gradient(135deg, #101010 0%, #151515 100%);
}

.courses-board {
  display: grid;
  gap: 0.8rem;
}

.join-by-code {
  display: grid;
  gap: 0.5rem;
}

@media (min-width: 760px) {
  .join-by-code {
    grid-template-columns: 1fr auto;
  }
}

.courses-board-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  align-items: baseline;
}

.courses-grid {
  display: grid;
  gap: 0.75rem;
}

@media (min-width: 760px) {
  .courses-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.course-tile {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: #0d0d0d;
  overflow: hidden;
  display: grid;
}

.course-tile.active {
  border-color: #3b3b3b;
  box-shadow: 0 0 0 1px #3b3b3b inset;
}

.course-tile-cover {
  width: 100%;
  border: 0;
  border-radius: 0;
  background: linear-gradient(135deg, #1d1f24 0%, #141517 100%);
  padding: 0.9rem;
  min-height: 132px;
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.3rem;
  text-align: left;
}

.course-tile-cover strong {
  font-size: 1.02rem;
}

.course-tile-chip {
  border: 1px solid #444;
  border-radius: 999px;
  font-size: 0.72rem;
  padding: 0.12rem 0.48rem;
  margin-bottom: auto;
  background: #0f0f0f;
}

.course-tile-actions {
  padding: 0.65rem;
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.classroom-header {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: linear-gradient(135deg, #151822 0%, #101318 100%);
  padding: 0.95rem;
  margin-bottom: 0.65rem;
}

.classroom-header-label {
  margin: 0 0 0.2rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.76rem;
  color: var(--muted);
}

.classroom-main {
  min-height: 520px;
}

.tab-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.45rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.55rem;
}

.tab-pill {
  background: transparent;
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 0.42rem 0.92rem;
  min-height: auto;
}

.tab-pill.active {
  background: #1f1f1f;
  border-color: #3a3a3a;
}

.tab-pill:not(.active) {
  color: var(--muted);
}

.course-select {
  width: 100%;
  justify-content: flex-start;
}

.classroom-main {
  min-height: 520px;
}

.classroom-meta-row {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
  margin: 0.45rem 0 0.6rem;
}

.quick-actions {
  display: grid;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}

@media (min-width: 760px) {
  .quick-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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

.stream-comments {
  margin-top: 0.65rem;
  border-top: 1px solid var(--border);
  padding-top: 0.55rem;
}

.stream-comment-list {
  display: grid;
  gap: 0.45rem;
}

.stream-comment {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.45rem 0.55rem;
  background: #0f0f0f;
}

.stream-comment p {
  margin: 0.15rem 0 0;
  white-space: pre-wrap;
}

.stream-comment-form {
  margin-top: 0.55rem;
  display: grid;
  gap: 0.4rem;
}

@media (min-width: 760px) {
  .stream-comment-form {
    grid-template-columns: 1fr auto;
  }
}

.grades-grid {
  margin-top: 0.65rem;
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 0.45rem;
  align-items: center;
}

.grades-head {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.gradebook-wrap {
  overflow-x: auto;
  margin-top: 0.65rem;
}

.gradebook-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}

.gradebook-table th,
.gradebook-table td {
  border: 1px solid var(--border);
  padding: 0.55rem;
  text-align: left;
  vertical-align: top;
}

.gradebook-table th {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--muted);
}

.gradebook-student {
  white-space: nowrap;
  font-weight: 600;
}

.grade-chip {
  display: inline-flex;
  border-radius: 999px;
  border: 1px solid var(--border);
  padding: 0.15rem 0.45rem;
  font-size: 0.8rem;
}

.grade-chip-ok {
  background: #162315;
  border-color: #294126;
}

.grade-chip-pending {
  background: #21211a;
  border-color: #3d3d2b;
}

.calendar-item {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.65rem;
  margin-top: 0.55rem;
}
</style>
