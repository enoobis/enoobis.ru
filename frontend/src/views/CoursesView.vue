<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  addCoTeacher,
  createAssignment,
  createCourse,
  createStreamComment,
  createLecture,
  createStreamPost,
  deleteCourse,
  enrollCourse,
  joinCourseByCode,
  getClassroom,
  setCoursePinned,
  gradeSubmission,
  listAssignmentSubmissions,
  listCourses,
  patchAssignment,
  patchLecture,
  removeCoTeacher,
  setClosedStudents,
  submitAssignment,
  unenrollCourse,
  uploadLectureAttachment,
  uploadSubmissionFile,
  type Assignment,
  type AssignmentSubmission,
  type Course,
  type CourseClassroom,
  type Lecture,
  type SubmissionAttachment,
} from "../api/courses";
import AppIcon from "../components/AppIcon.vue";
import { useAuthStore } from "../stores/auth";

type Tab = "lectures" | "assignments" | "stream" | "people" | "grades";
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
const allowedTabs: readonly Tab[] = ["lectures", "assignments", "stream", "people", "grades"];
function normalizeTab(value: unknown): Tab {
  if (typeof value === "string" && allowedTabs.includes(value as Tab)) return value as Tab;
  return "lectures";
}
const tab = ref<Tab>(normalizeTab(route.params.tab));
const err = ref("");

const creatingCourse = ref(false);
const addingLecture = ref(false);
const addingAssignment = ref(false);
const courseQuery = ref("");

const title = ref("");
const description = ref("");
const isOpen = ref(true);
const studentsDraft = ref("");
const joinCode = ref("");
const activeClosedId = ref<string | null>(null);

const streamBody = ref("");
const assignmentTitle = ref("");
const assignmentDescription = ref("");
const assignmentMaxPoints = ref(100);
const submissionBody = ref<Record<string, string>>({});
const submissionAttachments = ref<Record<string, SubmissionAttachment[]>>({});
const submissionPending = ref<Record<string, File[]>>({});
const submissionUploading = ref<Record<string, boolean>>({});
const streamCommentBody = ref<Record<string, string>>({});
const submissionsByAssignment = ref<Record<string, AssignmentSubmission[]>>({});
const grading = ref<Record<string, { points: number; comment: string }>>({});
const activeAssignmentForGrading = ref<string | null>(null);
const expandedStudentId = ref<string | null>(null);
const gradingSearch = ref("");
const teacherSubmissionsByAssignment = ref<Record<string, AssignmentSubmission[]>>({});
const teacherGradebookLoading = ref(false);
const teacherGradebookError = ref("");
const teacherGradebookLoadedFor = ref("");

const lectureTitle = ref("");
const lectureBody = ref("");
const lectureVideoUrl = ref("");
const lecturePendingFiles = ref<{ file_name: string; url: string }[]>([]);
const lectureUploading = ref(false);

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
  max_points: number;
};
const editingAssignment = ref<AssignEditDraft | null>(null);

const addTaskForLectureId = ref<string | null>(null);
const addTaskTitle = ref("");
const addTaskDesc = ref("");
const addTaskMaxPoints = ref(100);

const canTeach = computed(() => auth.role === "teacher" || auth.role === "admin");
const isTeacherInCurrent = computed(() => classroom.value?.is_teacher ?? false);
const isOwnerInCurrent = computed(
  () => classroom.value?.is_owner || auth.role === "admin",
);

const coTeacherIds = computed(
  () => new Set((classroom.value?.co_teachers ?? []).map((c) => c.id)),
);

/** участники курса без владельца и соучителей — кто сдаёт работы (не по users.role). */
const classroomLearners = computed(() => {
  if (!classroom.value) return [];
  const tid = classroom.value.course.teacher_id;
  const co = new Set(classroom.value.co_teachers.map((c) => c.id));
  return classroom.value.members.filter((m) => m.id !== tid && !co.has(m.id));
});

const coTeacherNick = ref("");
const coTeacherBusy = ref(false);

function isCoTeacherOf(c: Course) {
  return !!auth.user && c.co_teachers.some((co) => co.id === auth.user!.id);
}

async function onAddCoTeacher() {
  if (!auth.token || !classroom.value || !isOwnerInCurrent.value) return;
  const nick = coTeacherNick.value.trim();
  if (!nick) return;
  err.value = "";
  coTeacherBusy.value = true;
  try {
    await addCoTeacher(classroom.value.course.id, nick, auth.token);
    coTeacherNick.value = "";
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    coTeacherBusy.value = false;
  }
}

async function onRemoveCoTeacher(userId: string) {
  if (!auth.token || !classroom.value || !isOwnerInCurrent.value) return;
  if (!window.confirm("убрать соучителя?")) return;
  err.value = "";
  try {
    await removeCoTeacher(classroom.value.course.id, userId, auth.token);
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

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

const filteredCourses = computed(() => {
  const q = courseQuery.value.trim().toLowerCase();
  if (!q) return courses.value;
  return courses.value.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.teacher_nickname.toLowerCase().includes(q),
  );
});

function closeCourse() {
  classroom.value = null;
  selectedCourseId.value = "";
  router.replace({ name: "courses" }).catch(() => undefined);
}

const gradingAssignment = computed<Assignment | null>(() => {
  if (!classroom.value || !activeAssignmentForGrading.value) return null;
  return (
    classroom.value.assignments.find((a) => a.id === activeAssignmentForGrading.value) ?? null
  );
});

const gradingStudents = computed(() => {
  if (!classroom.value || !activeAssignmentForGrading.value) return [];
  const subs = submissionsByAssignment.value[activeAssignmentForGrading.value] ?? [];
  const subByStudent: Record<string, AssignmentSubmission> = {};
  for (const s of subs) subByStudent[s.student_id] = s;
  return classroomLearners.value
    .map((m) => ({ student: m, submission: subByStudent[m.id] ?? null }))
    .sort((a, b) => {
      const aw = a.submission ? (a.submission.grade_points !== null ? 2 : 0) : 1;
      const bw = b.submission ? (b.submission.grade_points !== null ? 2 : 0) : 1;
      if (aw !== bw) return aw - bw;
      return a.student.nickname.localeCompare(b.student.nickname);
    });
});

const gradingStats = computed(() => {
  const list = gradingStudents.value;
  return {
    total: list.length,
    submitted: list.filter((x) => !!x.submission).length,
    graded: list.filter((x) => x.submission?.grade_points !== null).length,
  };
});

const gradingStudentsFiltered = computed(() => {
  const q = gradingSearch.value.trim().toLowerCase();
  const list = gradingStudents.value;
  if (!q) return list;
  return list.filter((r) => r.student.nickname.toLowerCase().includes(q));
});

const selectedGradingRow = computed(() => {
  const id = expandedStudentId.value;
  if (!id) return null;
  return gradingStudents.value.find((r) => r.student.id === id) ?? null;
});

function selectGradingStudent(studentId: string) {
  expandedStudentId.value = studentId;
}

function closeGrading() {
  activeAssignmentForGrading.value = null;
  expandedStudentId.value = null;
  gradingSearch.value = "";
}

watch(gradingSearch, () => {
  const f = gradingStudentsFiltered.value;
  const id = expandedStudentId.value;
  if (!id) return;
  if (f.some((r) => r.student.id === id)) return;
  expandedStudentId.value = f.find((r) => r.submission)?.student.id ?? null;
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
  const students = classroomLearners.value;
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
    teacherGradebookError.value = e instanceof Error ? e.message : "ошибка";
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
    if (hasRouteCourse) {
      selectedCourseId.value = routeCourseId;
      await loadClassroom(routeCourseId);
      syncRouteState(routeCourseId);
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
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
    err.value = e instanceof Error ? e.message : "ошибка";
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
    creatingCourse.value = false;
    await loadCourses();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
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
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

async function onUnenroll(courseId: string) {
  if (!auth.token) return;
  err.value = "";
  try {
    await unenrollCourse(courseId, auth.token);
    await loadCourses();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

async function onDeleteCourse(courseId: string, courseTitle: string) {
  if (!auth.token) return;
  if (!window.confirm(`удалить курс «${courseTitle}»? это необратимо.`)) return;
  err.value = "";
  try {
    await deleteCourse(courseId, auth.token);
    if (classroom.value?.course.id === courseId) {
      classroom.value = null;
      selectedCourseId.value = "";
      router.replace({ name: "courses" }).catch(() => undefined);
    }
    await loadCourses();
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

async function onTogglePin(c: Course) {
  if (!auth.token) return;
  err.value = "";
  try {
    await setCoursePinned(c.id, !(c.is_pinned ?? false), auth.token);
    await loadCourses();
    if (classroom.value?.course.id === c.id) await loadClassroom(c.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
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
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

function openClosedEditor(c: Course) {
  if (!canTeach.value) return;
  if (c.teacher_id !== auth.user?.id && auth.role !== "admin") return;
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
    err.value = e instanceof Error ? e.message : "ошибка";
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
    err.value = e instanceof Error ? e.message : "ошибка";
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
    err.value = e instanceof Error ? e.message : "ошибка";
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
        max_points: assignmentMaxPoints.value,
      },
      auth.token,
    );
    assignmentTitle.value = "";
    assignmentDescription.value = "";
    assignmentMaxPoints.value = 100;
    addingAssignment.value = false;
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

function ensureSubmissionState(a: Assignment) {
  if (!(a.id in submissionAttachments.value)) {
    submissionAttachments.value[a.id] = a.my_submission?.attachments
      ? [...a.my_submission.attachments]
      : [];
  }
  if (!(a.id in submissionPending.value)) {
    submissionPending.value[a.id] = [];
  }
}

function attachmentsFor(a: Assignment): SubmissionAttachment[] {
  ensureSubmissionState(a);
  return submissionAttachments.value[a.id];
}

function pendingFor(a: Assignment): File[] {
  ensureSubmissionState(a);
  return submissionPending.value[a.id];
}

const MAX_SUBMISSION_FILES = 10;

function onPickSubmissionFiles(a: Assignment, ev: Event) {
  const input = ev.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  ensureSubmissionState(a);
  for (const f of files) {
    const total =
      submissionAttachments.value[a.id].length +
      submissionPending.value[a.id].length;
    if (total >= MAX_SUBMISSION_FILES) {
      err.value = `можно не более ${MAX_SUBMISSION_FILES} файлов`;
      break;
    }
    if (f.size > 2 * 1024 * 1024) {
      err.value = `${f.name}: больше 2 мб`;
      continue;
    }
    submissionPending.value[a.id].push(f);
  }
}

function removePendingFile(a: Assignment, idx: number) {
  ensureSubmissionState(a);
  submissionPending.value[a.id].splice(idx, 1);
}

function removeSubmissionAttachment(a: Assignment, idx: number) {
  ensureSubmissionState(a);
  submissionAttachments.value[a.id].splice(idx, 1);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} кб`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} мб`;
}

async function onSubmitAssignment(a: Assignment) {
  if (!auth.token || !classroom.value) return;
  ensureSubmissionState(a);
  const content = (submissionBody.value[a.id] || "").trim();
  const pending = submissionPending.value[a.id];
  const existing = submissionAttachments.value[a.id];
  if (!content && !pending.length && !existing.length) return;
  err.value = "";
  submissionUploading.value[a.id] = true;
  try {
    const uploaded: SubmissionAttachment[] = [];
    for (const file of pending) {
      const r = await uploadSubmissionFile(
        classroom.value.course.id,
        a.id,
        file,
        auth.token,
      );
      uploaded.push({
        id: "",
        file_name: r.file_name,
        url: r.url,
        size_bytes: r.size_bytes,
        mime_type: r.mime_type,
        created_at: "",
      });
    }
    const allAttachments = [...existing, ...uploaded];
    const fresh = await submitAssignment(
      classroom.value.course.id,
      a.id,
      content,
      auth.token,
      allAttachments.map((x) => ({
        file_name: x.file_name,
        url: x.url,
        size_bytes: x.size_bytes,
        mime_type: x.mime_type,
      })),
    );
    submissionBody.value[a.id] = "";
    submissionPending.value[a.id] = [];
    submissionAttachments.value[a.id] = fresh.attachments ?? [];
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    submissionUploading.value[a.id] = false;
  }
}

async function openSubmissions(
  assignmentId: string,
  opts?: { keepStudentId?: string | null },
) {
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
    const keep = opts?.keepStudentId;
    if (keep && list.some((s) => s.student_id === keep)) {
      expandedStudentId.value = keep;
    } else {
      expandedStudentId.value =
        list.find((s) => s.grade_points === null)?.student_id ?? list[0]?.student_id ?? null;
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
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
    err.value = e instanceof Error ? e.message : "ошибка";
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
    await createLecture(
      classroom.value.course.id,
      {
        title: t,
        body_text: lectureBody.value,
        video_url: lectureVideoUrl.value,
        attachments: lecturePendingFiles.value.length ? lecturePendingFiles.value : undefined,
      },
      auth.token,
    );
    lectureTitle.value = "";
    lectureBody.value = "";
    lectureVideoUrl.value = "";
    lecturePendingFiles.value = [];
    addingLecture.value = false;
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
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
    err.value = e instanceof Error ? e.message : "ошибка";
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
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

function startEditAssignment(a: Assignment) {
  editingAssignment.value = {
    id: a.id,
    title: a.title,
    description: a.description,
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
      max_points: d.max_points,
    }, auth.token);
    editingAssignment.value = null;
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

function openAddTaskForm(lecId: string) {
  addTaskForLectureId.value = lecId;
  addTaskTitle.value = "";
  addTaskDesc.value = "";
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
        max_points: addTaskMaxPoints.value,
        lecture_id: lecId,
      },
      auth.token,
    );
    addTaskForLectureId.value = null;
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
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
    await openSubmissions(assignmentId, { keepStudentId: s.student_id });
    await loadClassroom(classroom.value.course.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}
</script>

<template>
  <section class="courses">
    <p v-if="err" class="error">{{ err }}</p>

    <!-- список курсов -->
    <template v-if="!classroom">
      <div class="board-tools">
        <input
          v-model="courseQuery"
          class="board-search"
          placeholder="поиск курса"
        />
        <input
          v-model="joinCode"
          class="board-code"
          placeholder="код"
          @keyup.enter="onJoinByCode"
        />
        <button v-if="joinCode.trim()" type="button" class="secondary" @click="onJoinByCode">
          вступить
        </button>
        <button
          v-if="canTeach"
          type="button"
          class="secondary"
          :class="{ active: creatingCourse }"
          @click="creatingCourse = !creatingCourse"
        >
          {{ creatingCourse ? "отмена" : "+ курс" }}
        </button>
      </div>

      <div v-if="creatingCourse" class="form-card">
        <input v-model="title" placeholder="название" />
        <textarea v-model="description" rows="2" placeholder="описание" />
        <label class="check">
          <input v-model="isOpen" type="checkbox" />
          <span>открытый курс</span>
        </label>
        <button type="button" :disabled="!title.trim()" @click="onCreateCourse">
          создать
        </button>
      </div>

      <div class="course-grid">
        <article
          v-for="c in filteredCourses"
          :key="c.id"
          class="course-card"
          @click="openCourse(c.id)"
        >
          <header class="course-card-head">
            <h3>{{ c.title }}</h3>
            <span class="dot">·</span>
            <span class="muted small">{{ c.is_open ? "открытый" : "закрытый" }}</span>
          </header>
          <p v-if="c.description" class="muted small course-card-desc">
            {{ c.description }}
          </p>
          <footer class="course-card-foot">
            <span class="muted small">{{ c.teacher_nickname }}</span>
            <span class="muted small">код {{ c.course_code }}</span>
          </footer>
          <div class="course-card-actions" @click.stop>
            <button v-if="c.is_open && !c.enrolled" type="button" @click="onEnroll(c.id)">
              записаться
            </button>
            <button
              v-if="c.is_open && c.enrolled && c.teacher_id !== auth.user?.id && !isCoTeacherOf(c)"
              type="button"
              class="secondary"
              @click="onUnenroll(c.id)"
            >
              покинуть
            </button>
            <button
              v-if="!c.is_open && canTeach && (c.teacher_id === auth.user?.id || auth.role === 'admin')"
              type="button"
              class="secondary"
              @click="openClosedEditor(c)"
            >
              доступ
            </button>
            <button
              v-if="c.enrolled"
              type="button"
              class="icon-btn-sm"
              :class="{ pinned: c.is_pinned }"
              aria-label="закрепить"
              title="закрепить"
              @click="onTogglePin(c)"
            >
              <AppIcon name="pin" :size="14" />
            </button>
            <button
              v-if="canTeach && (c.teacher_id === auth.user?.id || auth.role === 'admin')"
              type="button"
              class="icon-btn-sm danger"
              aria-label="удалить курс"
              title="удалить курс"
              @click="onDeleteCourse(c.id, c.title)"
            >
              <AppIcon name="delete" :size="14" />
            </button>
          </div>
        </article>
      </div>
      <p v-if="!filteredCourses.length" class="muted center">
        {{ courseQuery ? "ничего не найдено" : "пусто" }}
      </p>
    </template>

    <!-- внутри курса -->
    <template v-else>
      <header class="course-head">
        <button class="back" type="button" @click="closeCourse">← к курсам</button>
        <div class="course-head-row">
          <h2>{{ classroom.course.title }}</h2>
          <div class="course-head-actions">
            <button
              type="button"
              class="icon-btn-sm"
              :class="{ pinned: classroom.course.is_pinned }"
              aria-label="закрепить"
              title="закрепить"
              @click="onTogglePin(classroom.course)"
            >
              <AppIcon name="pin" :size="16" />
            </button>
            <button
              v-if="isOwnerInCurrent"
              type="button"
              class="icon-btn-sm danger"
              aria-label="удалить курс"
              title="удалить курс"
              @click="onDeleteCourse(classroom.course.id, classroom.course.title)"
            >
              <AppIcon name="delete" :size="16" />
            </button>
          </div>
        </div>
        <p v-if="classroom.course.description" class="muted">
          {{ classroom.course.description }}
        </p>
        <p class="muted small">
          ведёт
          <RouterLink :to="`/u/${classroom.course.teacher_nickname}`">
            {{ classroom.course.teacher_nickname }}
          </RouterLink>
          <template v-if="classroom.co_teachers.length">
            <template v-for="(co, i) in classroom.co_teachers" :key="co.id">
              <span>{{ i === 0 ? " · соучители " : ", " }}</span>
              <RouterLink :to="`/u/${co.nickname}`">{{ co.nickname }}</RouterLink>
            </template>
          </template>
          · код <strong>{{ classroom.course.course_code }}</strong>
        </p>
      </header>

      <nav class="tabs">
        <button
          class="tab"
          :class="{ active: tab === 'lectures' }"
          type="button"
          @click="tab = 'lectures'"
        >
          лекции
          <span class="tab-count">{{ courseStats.lectures }}</span>
        </button>
        <button
          class="tab"
          :class="{ active: tab === 'assignments' }"
          type="button"
          @click="tab = 'assignments'"
        >
          задания
          <span class="tab-count">{{ courseStats.assignments }}</span>
        </button>
        <button
          class="tab"
          :class="{ active: tab === 'stream' }"
          type="button"
          @click="tab = 'stream'"
        >
          лента
        </button>
        <button
          class="tab"
          :class="{ active: tab === 'people' }"
          type="button"
          @click="tab = 'people'"
        >
          участники
          <span class="tab-count">{{ courseStats.members }}</span>
        </button>
        <button
          class="tab"
          :class="{ active: tab === 'grades' }"
          type="button"
          @click="tab = 'grades'"
        >
          оценки
        </button>
      </nav>

      <!-- лекции -->
      <template v-if="tab === 'lectures'">
        <div v-if="isTeacherInCurrent" class="add-bar">
          <button
            type="button"
            class="secondary"
            :class="{ active: addingLecture }"
            @click="addingLecture = !addingLecture"
          >
            {{ addingLecture ? "отмена" : "+ лекция" }}
          </button>
        </div>
        <div v-if="isTeacherInCurrent && addingLecture" class="form-card">
          <input v-model="lectureTitle" placeholder="название" />
          <textarea v-model="lectureBody" rows="4" placeholder="текст" />
          <input v-model="lectureVideoUrl" placeholder="ссылка на видео" />
          <div class="upload-row">
            <input
              type="file"
              :disabled="lectureUploading"
              @change="onLectureFileChange"
            />
            <span class="muted small">
              {{ lectureUploading ? "загрузка…" : "до 20 мб" }}
            </span>
          </div>
          <ul v-if="lecturePendingFiles.length" class="files">
            <li v-for="(f, i) in lecturePendingFiles" :key="f.url + i">
              <span>{{ f.file_name }}</span>
              <button
                type="button"
                class="ghost-x"
                @click="removePendingLectureFile(i)"
              >
                ×
              </button>
            </li>
          </ul>
          <button
            type="button"
            :disabled="lectureUploading || !lectureTitle.trim()"
            @click="onCreateLecture"
          >
            опубликовать
          </button>
        </div>

        <div v-for="lec in classroom.lectures" :key="lec.id" class="lecture-card">
          <template v-if="editingLecture?.id === lec.id">
            <input v-model="editingLecture.title" placeholder="название" />
            <textarea v-model="editingLecture.body_text" rows="4" placeholder="текст" />
            <input v-model="editingLecture.video_url" placeholder="видео url" />
            <div class="upload-row">
              <input
                type="file"
                :disabled="lectureEditUploading"
                @change="onLectureEditFileChange"
              />
              <span class="muted small">
                {{ lectureEditUploading ? "загрузка…" : "вложения" }}
              </span>
            </div>
            <ul v-if="editingLecture.attachments.length" class="files">
              <li v-for="(f, i) in editingLecture.attachments" :key="f.url + i">
                <span>{{ f.file_name }}</span>
                <button
                  type="button"
                  class="ghost-x"
                  @click="removeEditLectureFile(i)"
                >
                  ×
                </button>
              </li>
            </ul>
            <div class="row-actions">
              <button
                type="button"
                :disabled="lectureEditUploading"
                @click="onSaveLectureEdit"
              >
                сохранить
              </button>
              <button type="button" class="secondary" @click="cancelEditLecture">
                отмена
              </button>
            </div>
          </template>
          <template v-else>
            <div class="lecture-head">
              <h3>{{ lec.title }}</h3>
              <button
                v-if="isTeacherInCurrent"
                type="button"
                class="icon-btn-sm"
                aria-label="редактировать"
                title="редактировать"
                @click="startEditLecture(lec)"
              >
                <AppIcon name="edit" :size="14" />
              </button>
            </div>
            <p class="muted small">
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
                <a
                  v-else-if="ev.kind === 'link'"
                  :href="ev.href"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  открыть видео →
                </a>
              </div>
            </template>
            <p v-if="lec.body_text" class="lecture-body">{{ lec.body_text }}</p>
            <ul v-if="lec.attachments.length" class="attach-list">
              <li v-for="att in lec.attachments" :key="att.id">
                <a :href="att.url" target="_blank" rel="noopener noreferrer">
                  {{ att.file_name }}
                </a>
              </li>
            </ul>

            <div v-if="assignmentsForLecture(lec.id).length" class="lecture-tasks">
              <div
                v-for="a in assignmentsForLecture(lec.id)"
                :key="a.id"
                class="task-row"
              >
                <template v-if="editingAssignment?.id === a.id">
                  <input v-model="editingAssignment.title" placeholder="название" />
                  <textarea
                    v-model="editingAssignment.description"
                    rows="2"
                    placeholder="описание"
                  />
                  <input
                    v-model.number="editingAssignment.max_points"
                    type="number"
                    min="1"
                    max="1000"
                    placeholder="баллы"
                  />
                  <div class="row-actions">
                    <button type="button" @click="onSaveAssignmentEdit">сохранить</button>
                    <button type="button" class="secondary" @click="cancelEditAssignment">
                      отмена
                    </button>
                  </div>
                </template>
                <template v-else>
                  <div class="task-row-head">
                    <strong>{{ a.title }}</strong>
                    <span class="muted small">{{ a.max_points }} б</span>
                  </div>
                  <p v-if="a.description" class="muted small">{{ a.description }}</p>
                  <template v-if="isTeacherInCurrent">
                    <div class="row-actions">
                      <button
                        type="button"
                        class="secondary"
                        @click="startEditAssignment(a)"
                      >
                        изменить
                      </button>
                      <button
                        type="button"
                        class="secondary"
                        @click="openSubmissions(a.id)"
                      >
                        проверить
                      </button>
                    </div>
                  </template>
                  <template v-else>
                    <textarea
                      v-model="submissionBody[a.id]"
                      rows="2"
                      placeholder="ответ — текст или ссылка"
                    />
                    <ul v-if="attachmentsFor(a).length" class="files">
                      <li v-for="(f, i) in attachmentsFor(a)" :key="'kept-' + a.id + '-' + i">
                        <a :href="f.url" target="_blank" rel="noopener noreferrer">
                          {{ f.file_name }}
                        </a>
                        <button
                          type="button"
                          class="ghost-x"
                          @click="removeSubmissionAttachment(a, i)"
                        >
                          ×
                        </button>
                      </li>
                    </ul>
                    <ul v-if="pendingFor(a).length" class="files">
                      <li v-for="(f, i) in pendingFor(a)" :key="'p-' + a.id + '-' + i">
                        <span>{{ f.name }} <span class="muted small">{{ formatFileSize(f.size) }}</span></span>
                        <button
                          type="button"
                          class="ghost-x"
                          @click="removePendingFile(a, i)"
                        >
                          ×
                        </button>
                      </li>
                    </ul>
                    <div class="upload-row">
                      <label class="attach-label secondary">
                        <AppIcon name="image" :size="14" />
                        <span>прикрепить</span>
                        <input
                          type="file"
                          multiple
                          hidden
                          @change="onPickSubmissionFiles(a, $event)"
                        />
                      </label>
                      <span class="muted small">до 2 мб · до 10 файлов</span>
                    </div>
                    <div class="row-actions">
                      <button
                        type="button"
                        :disabled="submissionUploading[a.id]"
                        @click="onSubmitAssignment(a)"
                      >
                        {{ submissionUploading[a.id] ? "отправка…" : "сдать" }}
                      </button>
                      <span v-if="a.my_submission" class="muted small">
                        статус: {{ a.my_submission.status }}
                        <span v-if="a.my_submission.grade_points !== null">
                          · {{ a.my_submission.grade_points }} / {{ a.max_points }}
                        </span>
                      </span>
                    </div>
                  </template>
                </template>
              </div>
            </div>

            <div v-if="isTeacherInCurrent" class="lecture-add-task">
              <template v-if="addTaskForLectureId === lec.id">
                <input v-model="addTaskTitle" placeholder="название задания" />
                <textarea v-model="addTaskDesc" rows="2" placeholder="описание" />
                <input
                  v-model.number="addTaskMaxPoints"
                  type="number"
                  min="1"
                  max="1000"
                  placeholder="баллы"
                />
                <div class="row-actions">
                  <button type="button" @click="onSaveAddTaskToLecture(lec.id)">
                    добавить
                  </button>
                  <button type="button" class="secondary" @click="cancelAddTask">
                    отмена
                  </button>
                </div>
              </template>
              <button
                v-else
                type="button"
                class="secondary small"
                @click="openAddTaskForm(lec.id)"
              >
                + задание
              </button>
            </div>
          </template>
        </div>
        <p v-if="!classroom.lectures.length" class="muted center empty">
          {{ isTeacherInCurrent ? "опубликуйте первую лекцию" : "лекций пока нет" }}
        </p>
      </template>

      <!-- задания -->
      <template v-else-if="tab === 'assignments'">
        <div v-if="isTeacherInCurrent" class="add-bar">
          <button
            type="button"
            class="secondary"
            :class="{ active: addingAssignment }"
            @click="addingAssignment = !addingAssignment"
          >
            {{ addingAssignment ? "отмена" : "+ задание" }}
          </button>
        </div>
        <div v-if="isTeacherInCurrent && addingAssignment" class="form-card">
          <input v-model="assignmentTitle" placeholder="название" />
          <textarea v-model="assignmentDescription" rows="3" placeholder="описание" />
          <input
            v-model.number="assignmentMaxPoints"
            type="number"
            min="1"
            max="1000"
            placeholder="баллы"
          />
          <button
            type="button"
            :disabled="!assignmentTitle.trim()"
            @click="onCreateAssignment"
          >
            создать
          </button>
        </div>

        <div
          v-for="a in classroom.assignments"
          :key="a.id"
          class="task-card"
        >
          <div class="task-card-head">
            <h3>{{ a.title }}</h3>
            <span class="muted small">{{ a.max_points }} б</span>
          </div>
          <p class="muted small">
            <RouterLink :to="`/u/${a.author_nickname}`">{{ a.author_nickname }}</RouterLink>
            <span v-if="a.lecture_id"> · к лекции</span>
          </p>
          <p v-if="a.description" class="lecture-body">{{ a.description }}</p>

          <template v-if="!isTeacherInCurrent">
            <textarea
              v-model="submissionBody[a.id]"
              rows="2"
              placeholder="ответ — текст или ссылка"
            />
            <ul v-if="attachmentsFor(a).length" class="files">
              <li v-for="(f, i) in attachmentsFor(a)" :key="'kept-' + a.id + '-' + i">
                <a :href="f.url" target="_blank" rel="noopener noreferrer">
                  {{ f.file_name }}
                </a>
                <button
                  type="button"
                  class="ghost-x"
                  @click="removeSubmissionAttachment(a, i)"
                >
                  ×
                </button>
              </li>
            </ul>
            <ul v-if="pendingFor(a).length" class="files">
              <li v-for="(f, i) in pendingFor(a)" :key="'p-' + a.id + '-' + i">
                <span>{{ f.name }} <span class="muted small">{{ formatFileSize(f.size) }}</span></span>
                <button
                  type="button"
                  class="ghost-x"
                  @click="removePendingFile(a, i)"
                >
                  ×
                </button>
              </li>
            </ul>
            <div class="upload-row">
              <label class="attach-label secondary">
                <AppIcon name="image" :size="14" />
                <span>прикрепить</span>
                <input
                  type="file"
                  multiple
                  hidden
                  @change="onPickSubmissionFiles(a, $event)"
                />
              </label>
              <span class="muted small">до 2 мб · до 10 файлов</span>
            </div>
            <div class="row-actions">
              <button
                type="button"
                :disabled="submissionUploading[a.id]"
                @click="onSubmitAssignment(a)"
              >
                {{ submissionUploading[a.id] ? "отправка…" : "сдать" }}
              </button>
              <span v-if="a.my_submission" class="muted small">
                {{ a.my_submission.status }}
                <span v-if="a.my_submission.grade_points !== null">
                  · {{ a.my_submission.grade_points }} / {{ a.max_points }}
                </span>
                <span v-if="a.my_submission.teacher_comment">
                  · {{ a.my_submission.teacher_comment }}
                </span>
              </span>
            </div>
          </template>
          <template v-else>
            <div class="row-actions">
              <button type="button" class="secondary" @click="openSubmissions(a.id)">
                проверить
              </button>
            </div>
          </template>
        </div>
        <p v-if="!classroom.assignments.length" class="muted center empty">
          {{ isTeacherInCurrent ? "создайте первое задание" : "заданий пока нет" }}
        </p>
      </template>

      <!-- лента -->
      <template v-else-if="tab === 'stream'">
        <div class="form-card">
          <textarea v-model="streamBody" rows="2" placeholder="написать в ленту" />
          <button
            type="button"
            :disabled="!streamBody.trim()"
            @click="onCreateStreamPost"
          >
            опубликовать
          </button>
        </div>
        <article
          v-for="post in classroom.stream"
          :key="post.id"
          class="stream-post"
        >
          <p class="muted small">
            <RouterLink :to="`/u/${post.author_nickname}`">
              {{ post.author_nickname }}
            </RouterLink>
            · {{ post.created_at.slice(0, 16).replace("T", " ") }}
          </p>
          <p class="stream-body">{{ post.body }}</p>
          <div v-if="post.comments.length" class="stream-comments">
            <div
              v-for="comment in post.comments"
              :key="comment.id"
              class="stream-comment"
            >
              <p class="muted small">
                <RouterLink :to="`/u/${comment.author_nickname}`">
                  {{ comment.author_nickname }}
                </RouterLink>
                · {{ comment.created_at.slice(0, 16).replace("T", " ") }}
              </p>
              <p>{{ comment.body }}</p>
            </div>
          </div>
          <div class="comment-form">
            <input
              v-model="streamCommentBody[post.id]"
              placeholder="ответить"
              @keyup.enter="onCreateStreamComment(post.id)"
            />
          </div>
        </article>
        <p v-if="!classroom.stream.length" class="muted center empty">пусто</p>
      </template>

      <!-- участники -->
      <template v-else-if="tab === 'people'">
        <div v-if="isOwnerInCurrent" class="co-teacher-block">
          <p class="muted small">соучителя могут добавлять лекции и задания</p>
          <form class="row-actions" @submit.prevent="onAddCoTeacher">
            <input
              v-model="coTeacherNick"
              placeholder="ник ментора"
              :disabled="coTeacherBusy"
            />
            <button type="submit" :disabled="coTeacherBusy || !coTeacherNick.trim()">
              {{ coTeacherBusy ? "…" : "добавить соучителя" }}
            </button>
          </form>
        </div>
        <ul class="people-list">
          <li v-for="m in classroom.members" :key="m.id" class="person">
            <RouterLink :to="`/u/${m.nickname}`">
              <strong>{{ m.nickname }}</strong>
            </RouterLink>
            <span class="muted small">
              <template v-if="m.id === classroom.course.teacher_id">учитель</template>
              <template v-else-if="coTeacherIds.has(m.id)">соучитель</template>
              <template v-else>{{ roleLabel(m.role) }}</template>
            </span>
            <button
              v-if="isOwnerInCurrent && coTeacherIds.has(m.id)"
              type="button"
              class="icon-btn-sm"
              aria-label="убрать соучителя"
              title="убрать соучителя"
              @click="onRemoveCoTeacher(m.id)"
            >
              <AppIcon name="delete" :size="14" />
            </button>
          </li>
        </ul>
      </template>

      <!-- оценки -->
      <template v-else-if="tab === 'grades'">
        <template v-if="isTeacherInCurrent">
          <p v-if="teacherGradebookError" class="error">{{ teacherGradebookError }}</p>
          <p v-else-if="teacherGradebookLoading" class="muted">загрузка</p>
          <div v-else-if="teacherGradebookRows.length" class="gradebook-wrap">
            <table class="gradebook-table">
              <thead>
                <tr>
                  <th>студент</th>
                  <th
                    v-for="a in classroom.assignments"
                    :key="'h-' + a.id"
                  >
                    {{ a.title }}
                  </th>
                  <th>итог</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in teacherGradebookRows"
                  :key="row.student.id"
                >
                  <td class="gradebook-student">{{ row.student.nickname }}</td>
                  <td
                    v-for="cell in row.cells"
                    :key="row.student.id + '-' + cell.assignment.id"
                  >
                    <span v-if="!cell.submission" class="muted">—</span>
                    <span
                      v-else-if="cell.submission.grade_points !== null"
                      class="grade-chip ok"
                    >
                      {{ cell.submission.grade_points }} / {{ cell.assignment.max_points }}
                    </span>
                    <span v-else class="grade-chip pending">сдано</span>
                  </td>
                  <td>
                    <strong>{{ row.pointsEarned }} / {{ row.pointsTotal }}</strong>
                    <div class="muted small">
                      {{ row.gradedCount }} проверено · {{ row.submittedCount }} сдано
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="muted center empty">нет данных</p>
        </template>
        <template v-else>
          <div v-for="row in studentGradeRows" :key="row.student.id" class="grade-summary">
            <h3>{{ row.pointsEarned }} / {{ row.pointsTotal }} баллов</h3>
            <p class="muted small">{{ row.progress }}</p>
          </div>
          <p v-if="!studentGradeRows.length" class="muted center empty">пока без оценок</p>
        </template>
      </template>
    </template>

    <!-- модалки/доп секции -->
    <div v-if="activeClosedId" class="form-card overlay">
      <h3>доступ</h3>
      <p class="muted small">uuid через пробел</p>
      <textarea v-model="studentsDraft" rows="4" placeholder="uuid…" />
      <div class="row-actions">
        <button type="button" @click="saveClosedStudents">сохранить</button>
        <button type="button" class="secondary" @click="activeClosedId = null">
          отмена
        </button>
      </div>
    </div>

    <div v-if="activeAssignmentForGrading && gradingAssignment" class="grade-modal">
      <header class="grade-head">
        <div>
          <p class="muted small">проверка</p>
          <h3>{{ gradingAssignment.title }}</h3>
        </div>
        <button
          type="button"
          class="icon-btn-sm"
          aria-label="закрыть"
          title="закрыть"
          @click="closeGrading"
        >
          <AppIcon name="close" :size="16" />
        </button>
      </header>

      <p class="muted small grade-stats">
        {{ gradingStats.graded }} из {{ gradingStats.submitted }} проверено
        · сдало {{ gradingStats.submitted }} из {{ gradingStats.total }}
      </p>

      <p v-if="!gradingStudents.length" class="muted center empty">студентов нет</p>

      <div v-else class="grade-modal-split">
        <div class="grade-picker-wrap">
          <input
            v-model="gradingSearch"
            class="grade-search"
            type="search"
            autocomplete="off"
            placeholder="ник…"
          />
          <ul class="grade-picker-list">
            <li v-for="row in gradingStudentsFiltered" :key="row.student.id">
              <button
                type="button"
                class="grade-picker-row"
                :class="{
                  active: expandedStudentId === row.student.id,
                  submitted: !!row.submission,
                  graded: row.submission?.grade_points !== null,
                  empty: !row.submission,
                }"
                :disabled="!row.submission"
                @click="selectGradingStudent(row.student.id)"
              >
                <span class="g-name">
                  <span class="g-dot" />
                  <strong>{{ row.student.nickname }}</strong>
                </span>
                <span class="g-status">
                  <span v-if="!row.submission" class="muted small">—</span>
                  <span
                    v-else-if="row.submission.grade_points !== null"
                    class="grade-chip ok"
                  >
                    {{ row.submission.grade_points }} / {{ gradingAssignment.max_points }}
                  </span>
                  <span v-else class="grade-chip pending">···</span>
                </span>
              </button>
            </li>
          </ul>
        </div>

        <div class="grade-detail-panel">
          <template v-if="selectedGradingRow?.submission">
            <p class="muted small">
              {{ selectedGradingRow.student.nickname }}
              · сдано
              {{ selectedGradingRow.submission.updated_at.slice(0, 16).replace("T", " ") }}
            </p>
            <p v-if="(selectedGradingRow.submission.content ?? '').trim()" class="lecture-body">
              {{ selectedGradingRow.submission.content }}
            </p>
            <p
              v-else-if="!selectedGradingRow.submission.attachments?.length"
              class="muted small"
            >
              без текста
            </p>
            <ul v-if="selectedGradingRow.submission.attachments?.length" class="files">
              <li v-for="f in selectedGradingRow.submission.attachments" :key="f.id">
                <a :href="f.url" target="_blank" rel="noopener noreferrer">
                  {{ f.file_name }}
                  <span class="muted small">{{ formatFileSize(f.size_bytes) }}</span>
                </a>
              </li>
            </ul>
            <div class="grid-2">
              <input
                v-model.number="grading[selectedGradingRow.submission.id].points"
                type="number"
                min="0"
                :max="gradingAssignment.max_points"
                placeholder="баллы"
              />
              <input
                v-model="grading[selectedGradingRow.submission.id].comment"
                placeholder="комментарий"
              />
            </div>
            <div class="row-actions">
              <button
                type="button"
                @click="onGradeSubmission(activeAssignmentForGrading, selectedGradingRow.submission)"
              >
                {{
                  selectedGradingRow.submission.grade_points !== null ? "обновить" : "поставить"
                }}
              </button>
              <span
                v-if="selectedGradingRow.submission.grade_points !== null"
                class="muted small"
              >
                проверено
                {{ selectedGradingRow.submission.updated_at.slice(0, 16).replace("T", " ") }}
              </span>
            </div>
          </template>
          <p v-else class="muted small grade-detail-placeholder">
            выберите ученика со сдачей слева
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.courses {
  display: grid;
  gap: 0.9rem;
}
.center {
  text-align: center;
  padding: 1.5rem 0;
}
.empty {
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 1.2rem;
}
.small {
  font-size: 0.8rem;
}

.board-tools {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 0.5rem;
  align-items: center;
}
.board-search {
  font-size: 0.93rem;
}
.board-code {
  width: 8rem;
  font-size: 0.93rem;
}
@media (max-width: 600px) {
  .board-tools {
    grid-template-columns: 1fr 1fr;
  }
  .board-code {
    width: auto;
  }
}

.form-card {
  display: grid;
  gap: 0.55rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.form-card input,
.form-card textarea {
  width: 100%;
}
.form-card.overlay {
  margin-top: 0.6rem;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
  cursor: pointer;
}
.check input {
  width: auto;
}

.course-grid {
  display: grid;
  gap: 0.65rem;
}
@media (min-width: 720px) {
  .course-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.course-card {
  display: grid;
  gap: 0.4rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.course-card:hover {
  border-color: #3a3a3a;
  background: var(--surface2);
}
.course-card-head {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.course-card-head h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}
.course-card-desc {
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.course-card-foot {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}
.course-card-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.course-card-actions button {
  padding: 0.3rem 0.7rem;
  min-height: 0;
  font-size: 0.82rem;
  border-radius: 999px;
}
.dot {
  color: var(--muted);
}

.course-head {
  display: grid;
  gap: 0.3rem;
}
.course-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.course-head-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.course-head h2 {
  margin: 0;
  font-size: 1.3rem;
}
.back {
  align-self: flex-start;
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 0;
  min-height: 0;
  font-size: 0.85rem;
  cursor: pointer;
}
.back:hover {
  color: var(--text);
}

.tabs {
  display: flex;
  gap: 0.2rem;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}
.tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  padding: 0.55rem 0.9rem;
  min-height: 0;
  color: var(--muted);
  font-size: 0.9rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
}
.tab:hover {
  color: var(--text);
}
.tab.active {
  color: var(--text);
  border-bottom-color: var(--text);
}
.tab-count {
  font-size: 0.72rem;
  color: var(--muted);
  background: var(--surface2);
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
  min-width: 1.2rem;
  text-align: center;
}

.add-bar {
  display: flex;
  justify-content: flex-end;
}
.add-bar button.active {
  background: var(--surface2);
  color: var(--text);
}

.upload-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.attach-label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.32rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 0.83rem;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.attach-label:hover {
  background: var(--surface2);
  color: var(--text);
  border-color: #2a2a2a;
}

.files {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.25rem;
}
.files li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.86rem;
}
.ghost-x {
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 0;
  min-height: 0;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  font-size: 0.95rem;
  cursor: pointer;
  line-height: 1;
}
.ghost-x:hover {
  background: var(--surface2);
  color: var(--text);
}

.lecture-card {
  display: grid;
  gap: 0.45rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.lecture-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.lecture-head h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 500;
}
.icon-btn-sm {
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.icon-btn-sm:hover {
  background: var(--surface2);
  color: var(--text);
}
.icon-btn-sm.pinned {
  color: var(--text);
  background: var(--surface2);
}
.icon-btn-sm.danger:hover {
  background: #2a1414;
  color: #ff8b8b;
}

.lecture-video iframe {
  width: 100%;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  border: 0;
  border-radius: 8px;
}
.lecture-video video {
  width: 100%;
  border-radius: 8px;
}

.lecture-body {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
  font-size: 0.93rem;
}

.attach-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.25rem;
}
.attach-list a {
  font-size: 0.88rem;
}

.lecture-tasks {
  display: grid;
  gap: 0.5rem;
  border-top: 1px solid var(--border);
  padding-top: 0.6rem;
}
.task-row {
  display: grid;
  gap: 0.4rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface2);
}
.task-row-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: baseline;
  flex-wrap: wrap;
}
.task-row-head strong {
  font-weight: 500;
}

.lecture-add-task {
  display: grid;
  gap: 0.4rem;
}
.lecture-add-task button.small {
  padding: 0.25rem 0.7rem;
  min-height: 0;
  font-size: 0.8rem;
  border-radius: 999px;
  align-self: flex-start;
}

.task-card {
  display: grid;
  gap: 0.4rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.task-card-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: baseline;
}
.task-card-head h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}

.row-actions {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
  align-items: center;
}
.row-actions button {
  padding: 0.32rem 0.85rem;
  min-height: 0;
  font-size: 0.85rem;
  border-radius: 999px;
}
.grid-2 {
  display: grid;
  gap: 0.4rem;
  grid-template-columns: 1fr 1fr;
}

.stream-post {
  display: grid;
  gap: 0.45rem;
  padding: 0.8rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.stream-body {
  margin: 0;
  white-space: pre-wrap;
}
.stream-comments {
  display: grid;
  gap: 0.4rem;
  border-top: 1px solid var(--border);
  padding-top: 0.5rem;
}
.stream-comment {
  display: grid;
  gap: 0.2rem;
  padding: 0.4rem 0.55rem;
  border-radius: 8px;
  background: var(--surface2);
}
.stream-comment p {
  margin: 0;
  font-size: 0.9rem;
}
.comment-form {
  display: grid;
}
.comment-form input {
  width: 100%;
}

.co-teacher-block {
  display: grid;
  gap: 0.35rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  margin-bottom: 0.6rem;
}
.co-teacher-block .row-actions {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.co-teacher-block input {
  flex: 1;
  min-width: 0;
}

.people-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.35rem;
}
.person {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}
.person strong {
  font-weight: 500;
}

.gradebook-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.gradebook-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 600px;
}
.gradebook-table th,
.gradebook-table td {
  border-bottom: 1px solid var(--border);
  padding: 0.5rem 0.7rem;
  text-align: left;
  vertical-align: top;
  font-size: 0.86rem;
}
.gradebook-table th {
  font-weight: 500;
  color: var(--muted);
  background: var(--surface2);
}
.gradebook-student {
  white-space: nowrap;
  font-weight: 500;
}
.grade-chip {
  display: inline-flex;
  border-radius: 999px;
  border: 1px solid var(--border);
  padding: 0.1rem 0.45rem;
  font-size: 0.78rem;
}
.grade-chip.ok {
  background: var(--surface2);
  color: var(--text);
}
.grade-chip.pending {
  background: transparent;
  color: var(--muted);
}

.grade-summary {
  display: grid;
  gap: 0.2rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  text-align: center;
}
.grade-summary h3 {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 500;
}

.submission {
  display: grid;
  gap: 0.4rem;
  padding: 0.7rem;
  border-top: 1px solid var(--border);
}
.submission:first-of-type {
  border-top: none;
}

.grade-modal {
  margin-top: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  max-height: min(92vh, 44rem);
  min-height: 0;
}
.grade-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
  flex-shrink: 0;
}
.grade-head h3 {
  margin: 0.1rem 0 0;
  font-size: 1rem;
  font-weight: 500;
}
.grade-stats {
  margin: 0;
  flex-shrink: 0;
}
.grade-modal-split {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
@media (min-width: 640px) {
  .grade-modal-split {
    flex-direction: row;
    align-items: stretch;
  }
}
.grade-picker-wrap {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 0 0 auto;
  max-height: min(36vh, 14rem);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface2);
}
@media (min-width: 640px) {
  .grade-picker-wrap {
    flex: 0 0 minmax(10.5rem, 30%);
    max-height: none;
    min-height: 11rem;
  }
}
.grade-search {
  flex-shrink: 0;
  width: 100%;
  margin: 0;
  padding: 0.45rem 0.55rem;
  font-size: 0.9rem;
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: var(--surface);
  color: var(--text);
}
.grade-picker-list {
  list-style: none;
  margin: 0;
  padding: 0.3rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 0.15rem;
}
.grade-picker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
  width: 100%;
  padding: 0.42rem 0.5rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius);
  text-align: left;
  cursor: pointer;
  color: var(--text);
  font-size: 0.88rem;
  min-height: 0;
}
.grade-picker-row:hover:not([disabled]) {
  background: var(--surface);
}
.grade-picker-row.active {
  background: var(--surface);
  border-color: var(--text);
}
.grade-picker-row[disabled] {
  cursor: default;
  opacity: 0.55;
}
.g-name {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}
.g-name strong {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.g-status {
  flex-shrink: 0;
}
.g-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--border);
  flex-shrink: 0;
}
.grade-picker-row.submitted .g-dot {
  background: var(--text);
}
.grade-picker-row.graded .g-dot {
  background: transparent;
  border: 1px solid var(--text);
}
.grade-detail-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  gap: 0.5rem;
  align-content: start;
  padding: 0.15rem 0.1rem 0.5rem;
}
@media (max-width: 639px) {
  .grade-detail-panel {
    max-height: 48vh;
  }
}
@media (min-width: 640px) {
  .grade-detail-panel {
    min-height: 12rem;
    padding-right: 0.35rem;
  }
}
.grade-detail-panel .grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
}
@media (max-width: 480px) {
  .grade-detail-panel .grid-2 {
    grid-template-columns: 1fr;
  }
}
.grade-detail-placeholder {
  margin: 0;
  padding: 0.5rem 0;
}
.empty.center {
  text-align: center;
  padding: 0.8rem 0;
}
.icon-btn-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  min-height: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.icon-btn-sm:hover {
  background: var(--surface2);
}
</style>
