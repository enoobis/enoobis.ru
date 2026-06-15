<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
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
  setCourseHidden,
  gradeSubmission,
  listAssignmentSubmissions,
  listCourses,
  patchAssignment,
  patchLecture,
  removeCoTeacher,
  setClosedStudents,
  submitAssignment,
  unenrollCourse,
  uploadCourseIcon,
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
import PageHeader from "../components/PageHeader.vue";
import FilterSearch from "../components/FilterSearch.vue";
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
let classroomSeq = 0;
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
const courseQuery = ref(typeof route.query.q === "string" ? route.query.q : "");

const title = ref("");
const description = ref("");
const createIconFile = ref<File | null>(null);
const iconFileInputRef = ref<HTMLInputElement | null>(null);
const iconUploadCourseId = ref<string | null>(null);
const iconUploading = ref(false);
const isOpen = ref(true);
const studentsDraft = ref("");
const joinCode = ref("");
const showHiddenCourses = ref(false);
const hiddenCount = ref(0);
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

type AssignmentHandInFilter = "all" | "done" | "undone";
const assignmentHandInFilter = ref<AssignmentHandInFilter>("all");
const lectureQuery = ref("");
const assignmentQuery = ref("");

function assignmentIsHandedIn(a: Assignment): boolean {
  const s = a.my_submission;
  if (!s) return false;
  return s.status === "submitted" || s.status === "graded";
}

const visibleCourseAssignments = computed(() => {
  if (!classroom.value) return [];
  const list = classroom.value.assignments;
  if (isTeacherInCurrent.value || assignmentHandInFilter.value === "all") return list;
  if (assignmentHandInFilter.value === "done") return list.filter(assignmentIsHandedIn);
  return list.filter((a) => !assignmentIsHandedIn(a));
});

const filteredLectures = computed(() => {
  if (!classroom.value) return [];
  const q = lectureQuery.value.trim().toLowerCase();
  if (!q) return classroom.value.lectures;
  return classroom.value.lectures.filter(
    (l) => l.title.toLowerCase().includes(q) || l.body_text.toLowerCase().includes(q),
  );
});

const filteredListAssignments = computed(() => {
  const q = assignmentQuery.value.trim().toLowerCase();
  const list = visibleCourseAssignments.value;
  if (!q) return list;
  return list.filter((a) => {
    const lectureTitle = lectureTitleForAssignment(a)?.toLowerCase() ?? "";
    return (
      a.title.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      lectureTitle.includes(q)
    );
  });
});

const addTaskForLectureId = ref<string | null>(null);
const addTaskTitle = ref("");
const addTaskDesc = ref("");
const addTaskMaxPoints = ref(100);

const canTeach = computed(() => auth.isStaff);
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

function canLeaveFromCourse(c: Course): boolean {
  if (!auth.user) return false;
  return (
    c.enrolled && c.teacher_id !== auth.user.id && !isCoTeacherOf(c)
  );
}

function closeCourseMenu(ev: Event) {
  const el = ev.currentTarget as HTMLElement | null;
  el?.closest("details.course-menu")?.removeAttribute("open");
}

function copyCourseCode(c: Course, ev: Event) {
  closeCourseMenu(ev);
  void navigator.clipboard?.writeText(c.course_code);
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

function courseInitial(title: string) {
  const ch = title.trim().charAt(0);
  return ch ? ch.toLowerCase() : "?";
}

function canEditCourseIcon(c: Course) {
  if (!auth.token || !canTeach.value) return false;
  if (auth.role === "admin") return true;
  if (c.teacher_id === auth.user?.id) return true;
  return c.co_teachers?.some((ct) => ct.id === auth.user?.id) ?? false;
}

function onCreateIconChange(event: Event) {
  const input = event.target as HTMLInputElement;
  createIconFile.value = input.files?.[0] ?? null;
}

function openIconPicker(courseId: string) {
  iconUploadCourseId.value = courseId;
  iconFileInputRef.value?.click();
}

async function onIconFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  const courseId = iconUploadCourseId.value;
  input.value = "";
  iconUploadCourseId.value = null;
  if (!file || !courseId || !auth.token) return;
  iconUploading.value = true;
  err.value = "";
  try {
    await uploadCourseIcon(courseId, file, auth.token);
    await loadCourses();
    if (classroom.value?.course.id === courseId) {
      await loadClassroom(courseId);
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  } finally {
    iconUploading.value = false;
  }
}

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

function onGradingEscape(e: KeyboardEvent) {
  if (e.key === "Escape") closeGrading();
}

watch(activeAssignmentForGrading, (id) => {
  if (id) {
    document.addEventListener("keydown", onGradingEscape);
    document.body.style.overflow = "hidden";
  } else {
    document.removeEventListener("keydown", onGradingEscape);
    document.body.style.overflow = "";
  }
});

onUnmounted(() => {
  document.removeEventListener("keydown", onGradingEscape);
  document.removeEventListener("keydown", onDetailEscape);
  document.body.style.overflow = "";
});

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

function formatCourseDate(iso: string) {
  return iso.slice(0, 16).replace("T", " ");
}

function lectureTaskCount(lecId: string) {
  return assignmentsForLecture(lecId).length;
}

function lectureOpenTaskCount(lecId: string) {
  if (isTeacherInCurrent.value) return 0;
  return assignmentsForLecture(lecId).filter((a) => !assignmentIsHandedIn(a)).length;
}

const selectedLecture = computed(() => {
  const id = typeof route.query.lecture === "string" ? route.query.lecture : "";
  if (!id || !classroom.value) return null;
  return classroom.value.lectures.find((l) => l.id === id) ?? null;
});

const selectedAssignment = computed(() => {
  const id = typeof route.query.assignment === "string" ? route.query.assignment : "";
  if (!id || !classroom.value) return null;
  return classroom.value.assignments.find((a) => a.id === id) ?? null;
});

const expandedTaskId = ref<string | null>(null);

function openLecture(id: string) {
  expandedTaskId.value = null;
  editingLecture.value = null;
  if (tab.value !== "lectures") tab.value = "lectures";
  router
    .replace({
      name: "course-classroom",
      params: { ...route.params, tab: "lectures" },
      query: { lecture: id },
    })
    .catch(() => undefined);
}

function closeLecture() {
  expandedTaskId.value = null;
  editingLecture.value = null;
  addTaskForLectureId.value = null;
  router
    .replace({
      name: "course-classroom",
      params: route.params,
      query: {},
    })
    .catch(() => undefined);
  scrollCoursePanelTop();
}

function openAssignmentDetail(id: string) {
  editingAssignment.value = null;
  if (tab.value !== "assignments") tab.value = "assignments";
  router
    .replace({
      name: "course-classroom",
      params: { ...route.params, tab: "assignments" },
      query: { assignment: id },
    })
    .catch(() => undefined);
}

function closeAssignmentDetail() {
  editingAssignment.value = null;
  router
    .replace({
      name: "course-classroom",
      params: route.params,
      query: {},
    })
    .catch(() => undefined);
  scrollCoursePanelTop();
}

function toggleTaskExpand(id: string) {
  expandedTaskId.value = expandedTaskId.value === id ? null : id;
}

function assignmentStatusLabel(a: Assignment): string {
  if (isTeacherInCurrent.value) return "";
  if (!a.my_submission) return "не сдано";
  if (a.my_submission.status === "graded" && a.my_submission.grade_points !== null) {
    return `${a.my_submission.grade_points}/${a.max_points}`;
  }
  if (assignmentIsHandedIn(a)) return "сдано";
  return a.my_submission.status;
}

function lectureTitleForAssignment(a: Assignment): string | null {
  if (!a.lecture_id || !classroom.value) return null;
  return classroom.value.lectures.find((l) => l.id === a.lecture_id)?.title ?? null;
}

function scrollCoursePanelTop() {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function onDetailEscape(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (activeAssignmentForGrading.value) return;
  if (selectedAssignment.value) closeAssignmentDetail();
  else if (selectedLecture.value) closeLecture();
}

watch(
  () => [selectedLecture.value?.id ?? "", selectedAssignment.value?.id ?? ""] as const,
  ([lecId, asnId]) => {
    if (lecId || asnId) {
      document.addEventListener("keydown", onDetailEscape);
      scrollCoursePanelTop();
    } else {
      document.removeEventListener("keydown", onDetailEscape);
    }
  },
);

watch(
  () => classroom.value?.course.id,
  () => {
    assignmentHandInFilter.value = "all";
    lectureQuery.value = "";
    assignmentQuery.value = "";
  },
);

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
    const res = await listCourses(auth.token, {
      include_hidden: showHiddenCourses.value,
    });
    courses.value = res.courses;
    hiddenCount.value = res.hidden_count;
    const routeCourseId = typeof route.params.courseId === "string" ? route.params.courseId : "";
    if (routeCourseId) {
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
  const seq = ++classroomSeq;
  try {
    const loaded = await getClassroom(courseId, auth.token);
    if (seq !== classroomSeq) return;
    classroom.value = loaded;
    selectedCourseId.value = courseId;
    invalidateTeacherGradebook();
    if (tab.value === "grades") await loadTeacherGradebook(true);
  } catch (e) {
    if (seq !== classroomSeq) return;
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
  () => route.query.q,
  (v) => {
    courseQuery.value = typeof v === "string" ? v : "";
  },
);

watch(
  () => route.params.courseId,
  async (next) => {
    const nextCourse = typeof next === "string" ? next : "";
    if (!nextCourse || nextCourse === selectedCourseId.value || !auth.token) return;
    await loadClassroom(nextCourse);
  },
);

watch(tab, async (next) => {
  if (selectedCourseId.value) syncRouteState(selectedCourseId.value, next);
  if (next === "grades") await loadTeacherGradebook();
  const q = { ...(route.query as Record<string, string | string[]>) };
  let changed = false;
  if (next !== "lectures" && q.lecture) {
    delete q.lecture;
    expandedTaskId.value = null;
    changed = true;
  }
  if (next !== "assignments" && q.assignment) {
    delete q.assignment;
    changed = true;
  }
  if (changed) {
    router
      .replace({ name: "course-classroom", params: route.params, query: q })
      .catch(() => undefined);
  }
});

async function onCreateCourse() {
  if (!auth.token) return;
  err.value = "";
  try {
    const created = await createCourse(auth.token, {
      title: title.value,
      description: description.value,
      is_open: isOpen.value,
    });
    const iconFile = createIconFile.value;
    if (iconFile) {
      await uploadCourseIcon(created.id, iconFile, auth.token);
    }
    title.value = "";
    description.value = "";
    createIconFile.value = null;
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

async function onCourseHide(c: Course, hidden: boolean) {
  if (!auth.token) return;
  err.value = "";
  try {
    await setCourseHidden(c.id, hidden, auth.token);
    if (classroom.value?.course.id === c.id && hidden) {
      classroom.value = null;
      selectedCourseId.value = "";
      await router.replace({ name: "courses" }).catch(() => undefined);
    }
    await loadCourses();
    if (classroom.value?.course.id === c.id) await loadClassroom(c.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "ошибка";
  }
}

function onMenuHideClick(c: Course) {
  if (showHiddenCourses.value && (c.is_hidden ?? false)) void onCourseHide(c, false);
  else void onCourseHide(c, true);
}

async function toggleShowHidden() {
  showHiddenCourses.value = !showHiddenCourses.value;
  await loadCourses();
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
    const newest = classroom.value?.lectures[0];
    if (newest) openLecture(newest.id);
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
  <section class="courses page-shell">
    <p v-if="err" class="error">{{ err }}</p>

    <!-- список курсов -->
    <template v-if="!classroom">
      <PageHeader title="курсы" />

      <div class="board-tools filter-bar">
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
          v-if="hiddenCount > 0"
          type="button"
          class="secondary board-show-hidden"
          :class="{ active: showHiddenCourses }"
          @click="toggleShowHidden"
        >
          скрытые · {{ hiddenCount }}
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
        <label class="course-icon-pick muted small">
          <span>иконка</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            @change="onCreateIconChange"
          />
        </label>
        <label class="check">
          <input v-model="isOpen" type="checkbox" />
          <span>открытый курс</span>
        </label>
        <button type="button" :disabled="!title.trim()" @click="onCreateCourse">
          создать
        </button>
      </div>

      <input
        ref="iconFileInputRef"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        class="course-icon-file-input"
        @change="onIconFileSelected"
      />

      <div class="course-grid">
        <article
          v-for="c in filteredCourses"
          :key="c.id"
          class="course-card"
          :class="{ 'course-card--hidden': c.is_hidden }"
          @click="openCourse(c.id)"
        >
          <div class="course-card-layout">
            <div class="course-card-main">
              <header class="course-card-head">
                <div class="course-card-title">
                  <h3>{{ c.title }}</h3>
                  <span class="dot">·</span>
                  <span class="muted small">{{ c.is_open ? "открытый" : "закрытый" }}</span>
                </div>
                <div class="course-card-head-tools" @click.stop>
              <span
                v-if="c.is_pinned"
                class="course-card-pin"
                title="закреплён"
                aria-label="закреплён"
              >
                <AppIcon name="pinned" :size="14" />
              </span>
              <details class="course-menu course-menu--card">
                <summary class="course-menu-trigger icon-btn-sm" aria-label="ещё">
                  <AppIcon name="menu" :size="14" />
                </summary>
              <div class="course-menu-panel">
                <button
                  v-if="c.is_open && !c.enrolled"
                  type="button"
                  class="course-menu-item"
                  @click="onEnroll(c.id); closeCourseMenu($event)"
                >
                  записаться
                </button>
                <button
                  v-if="c.enrolled"
                  type="button"
                  class="course-menu-item"
                  @click="onTogglePin(c); closeCourseMenu($event)"
                >
                  {{ c.is_pinned ? "снять закреп" : "закрепить" }}
                </button>
                <button
                  type="button"
                  class="course-menu-item"
                  @click="onMenuHideClick(c); closeCourseMenu($event)"
                >
                  {{
                    showHiddenCourses && c.is_hidden ? "вернуть в список" : "скрыть из списка"
                  }}
                </button>
                <button
                  v-if="canLeaveFromCourse(c)"
                  type="button"
                  class="course-menu-item"
                  @click="onUnenroll(c.id); closeCourseMenu($event)"
                >
                  покинуть
                </button>
                <button
                  v-else
                  type="button"
                  class="course-menu-item"
                  @click="copyCourseCode(c, $event)"
                >
                  копировать код
                </button>
                <button
                  v-if="canEditCourseIcon(c)"
                  type="button"
                  class="course-menu-item"
                  :disabled="iconUploading"
                  @click="openIconPicker(c.id); closeCourseMenu($event)"
                >
                  {{ c.icon_url ? "сменить иконку" : "добавить иконку" }}
                </button>
                <button
                  v-if="canTeach && (c.teacher_id === auth.user?.id || auth.role === 'admin')"
                  type="button"
                  class="course-menu-item course-menu-item--danger"
                  @click="onDeleteCourse(c.id, c.title); closeCourseMenu($event)"
                >
                  удалить курс
                </button>
              </div>
            </details>
                </div>
              </header>
              <p v-if="c.description" class="muted small course-card-desc">
                {{ c.description }}
              </p>
              <footer class="course-card-foot">
                <span class="muted small">{{ c.teacher_nickname }}</span>
              </footer>
            </div>
            <div class="course-card-thumb" aria-hidden="true">
              <img v-if="c.icon_url" :src="c.icon_url" alt="" class="course-card-thumb-img" />
              <span v-else class="course-card-thumb-letter">{{ courseInitial(c.title) }}</span>
            </div>
          </div>
          <div class="course-card-actions" @click.stop">
            <button v-if="c.is_open && !c.enrolled" type="button" @click="onEnroll(c.id)">
              записаться
            </button>
            <button
              v-if="!c.is_open && canTeach && (c.teacher_id === auth.user?.id || auth.role === 'admin')"
              type="button"
              class="secondary"
              @click="openClosedEditor(c)"
            >
              доступ
            </button>
          </div>
        </article>
      </div>
      <p v-if="!filteredCourses.length" class="page-empty muted">
        {{ courseQuery ? "ничего не найдено" : "пусто" }}
      </p>
    </template>

    <!-- внутри курса -->
    <template v-else>
      <header class="course-head">
        <div class="course-head-top">
          <button class="back" type="button" @click="closeCourse">← к курсам</button>
          <div class="course-head-actions">
            <span
              v-if="classroom.course.is_pinned"
              class="course-card-pin"
              title="закреплён"
              aria-label="закреплён"
            >
              <AppIcon name="pinned" :size="16" />
            </span>
            <details class="course-menu">
              <summary class="course-menu-trigger icon-btn-sm" aria-label="ещё">
                <AppIcon name="menu" :size="16" />
              </summary>
              <div class="course-menu-panel">
                <button
                  type="button"
                  class="course-menu-item"
                  @click="onTogglePin(classroom.course); closeCourseMenu($event)"
                >
                  {{ classroom.course.is_pinned ? "снять закреп" : "закрепить" }}
                </button>
                <button
                  type="button"
                  class="course-menu-item"
                  @click="onMenuHideClick(classroom.course); closeCourseMenu($event)"
                >
                  {{
                    showHiddenCourses && classroom.course.is_hidden
                      ? "вернуть в список"
                      : "скрыть из списка"
                  }}
                </button>
                <button
                  type="button"
                  class="course-menu-item"
                  @click="copyCourseCode(classroom.course, $event)"
                >
                  копировать код
                </button>
                <button
                  v-if="canEditCourseIcon(classroom.course)"
                  type="button"
                  class="course-menu-item"
                  :disabled="iconUploading"
                  @click="openIconPicker(classroom.course.id); closeCourseMenu($event)"
                >
                  {{ classroom.course.icon_url ? "сменить иконку" : "добавить иконку" }}
                </button>
                <button
                  v-if="isOwnerInCurrent"
                  type="button"
                  class="course-menu-item course-menu-item--danger"
                  @click="
                    onDeleteCourse(classroom.course.id, classroom.course.title);
                    closeCourseMenu($event)
                  "
                >
                  удалить курс
                </button>
              </div>
            </details>
          </div>
        </div>
        <div class="course-head-row">
          <div
            class="course-card-thumb course-card-thumb--head"
            aria-hidden="true"
          >
            <img
              v-if="classroom.course.icon_url"
              :src="classroom.course.icon_url"
              alt=""
              class="course-card-thumb-img"
            />
            <span v-else class="course-card-thumb-letter">{{
              courseInitial(classroom.course.title)
            }}</span>
          </div>
          <div class="course-head-title">
            <h2>{{ classroom.course.title }}</h2>
            <p class="course-head-meta muted small">
              <RouterLink :to="`/u/${classroom.course.teacher_nickname}`">
                {{ classroom.course.teacher_nickname }}
              </RouterLink>
              · {{ classroom.course.course_code }}
            </p>
          </div>
        </div>
        <p v-if="classroom.course.description" class="course-head-desc muted small">
          {{ classroom.course.description }}
        </p>
      </header>

      <nav class="filter-tabs course-tabs">
        <button
          class="filter-tab"
          :class="{ on: tab === 'lectures' }"
          type="button"
          @click="tab = 'lectures'"
        >
          лекции
          <span class="tab-count">{{ courseStats.lectures }}</span>
        </button>
        <button
          class="filter-tab"
          :class="{ on: tab === 'assignments' }"
          type="button"
          @click="tab = 'assignments'"
        >
          задания
          <span class="tab-count">{{ courseStats.assignments }}</span>
        </button>
        <button
          class="filter-tab"
          :class="{ on: tab === 'stream' }"
          type="button"
          @click="tab = 'stream'"
        >
          лента
        </button>
        <button
          class="filter-tab"
          :class="{ on: tab === 'people' }"
          type="button"
          @click="tab = 'people'"
        >
          участники
          <span class="tab-count">{{ courseStats.members }}</span>
        </button>
        <button
          class="filter-tab"
          :class="{ on: tab === 'grades' }"
          type="button"
          @click="tab = 'grades'"
        >
          оценки
        </button>
      </nav>

      <!-- лекции -->
      <template v-if="tab === 'lectures'">
        <div v-if="!selectedLecture" class="panel-toolbar">
          <FilterSearch v-model="lectureQuery" placeholder="поиск лекции" class="panel-search" />
          <button
            v-if="isTeacherInCurrent"
            type="button"
            class="secondary"
            :class="{ active: addingLecture }"
            @click="addingLecture = !addingLecture"
          >
            {{ addingLecture ? "отмена" : "+ лекция" }}
          </button>
        </div>
        <div v-if="isTeacherInCurrent && addingLecture && !selectedLecture" class="form-card">
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

        <template v-if="selectedLecture">
          <article class="lecture-detail detail-panel">
            <button type="button" class="detail-back" @click="closeLecture">← лекции</button>

            <template v-if="editingLecture?.id === selectedLecture.id">
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
                  <button type="button" class="ghost-x" @click="removeEditLectureFile(i)">×</button>
                </li>
              </ul>
              <div class="row-actions">
                <button type="button" :disabled="lectureEditUploading" @click="onSaveLectureEdit">
                  сохранить
                </button>
                <button type="button" class="secondary" @click="cancelEditLecture">отмена</button>
              </div>
            </template>

            <template v-else>
              <div class="lecture-head">
                <h2>{{ selectedLecture.title }}</h2>
                <button
                  v-if="isTeacherInCurrent"
                  type="button"
                  class="icon-btn-sm"
                  aria-label="редактировать"
                  @click="startEditLecture(selectedLecture)"
                >
                  <AppIcon name="edit" :size="14" />
                </button>
              </div>
              <p class="muted small">
                <RouterLink :to="`/u/${selectedLecture.author_nickname}`">
                  {{ selectedLecture.author_nickname }}
                </RouterLink>
                · {{ formatCourseDate(selectedLecture.created_at) }}
              </p>
              <template
                v-for="ev in [lectureVideoEmbed(selectedLecture.video_url)]"
                :key="'v-' + selectedLecture.id"
              >
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
              <p v-if="selectedLecture.body_text" class="lecture-body">
                {{ selectedLecture.body_text }}
              </p>
              <ul v-if="selectedLecture.attachments.length" class="attach-list">
                <li v-for="att in selectedLecture.attachments" :key="att.id">
                  <a :href="att.url" target="_blank" rel="noopener noreferrer">{{ att.file_name }}</a>
                </li>
              </ul>

              <section v-if="assignmentsForLecture(selectedLecture.id).length" class="lecture-tasks">
                <h3 class="section-label">задания</h3>
                <ul class="task-list">
                  <li
                    v-for="a in assignmentsForLecture(selectedLecture.id)"
                    :key="a.id"
                    class="task-list-item"
                  >
                    <button
                      type="button"
                      class="task-list-row"
                      :class="{ open: expandedTaskId === a.id }"
                      @click="toggleTaskExpand(a.id)"
                    >
                      <span class="list-row-main">
                        <span class="list-row-title">{{ a.title }}</span>
                        <span class="list-row-meta muted small">
                          {{ a.max_points }} б
                          <span v-if="assignmentStatusLabel(a)"> · {{ assignmentStatusLabel(a) }}</span>
                        </span>
                      </span>
                      <span class="list-row-chevron" aria-hidden="true">›</span>
                    </button>
                    <div v-if="expandedTaskId === a.id" class="task-row">
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
                        <p v-if="a.description" class="muted small">{{ a.description }}</p>
                        <template v-if="isTeacherInCurrent">
                          <div class="row-actions">
                            <button type="button" class="secondary" @click="startEditAssignment(a)">
                              изменить
                            </button>
                            <button type="button" class="secondary" @click="openSubmissions(a.id)">
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
                              <span>
                                {{ f.name }}
                                <span class="muted small">{{ formatFileSize(f.size) }}</span>
                              </span>
                              <button type="button" class="ghost-x" @click="removePendingFile(a, i)">
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
                            </span>
                          </div>
                        </template>
                      </template>
                    </div>
                  </li>
                </ul>
              </section>

              <div v-if="isTeacherInCurrent" class="lecture-add-task">
                <template v-if="addTaskForLectureId === selectedLecture.id">
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
                    <button type="button" @click="onSaveAddTaskToLecture(selectedLecture.id)">
                      добавить
                    </button>
                    <button type="button" class="secondary" @click="cancelAddTask">отмена</button>
                  </div>
                </template>
                <button
                  v-else
                  type="button"
                  class="secondary small"
                  @click="openAddTaskForm(selectedLecture.id)"
                >
                  + задание
                </button>
              </div>
            </template>
          </article>
        </template>

        <ul v-else-if="filteredLectures.length" class="lecture-list">
          <li v-for="lec in filteredLectures" :key="lec.id">
            <button type="button" class="lecture-row" @click="openLecture(lec.id)">
              <span class="list-row-main">
                <span class="list-row-title">{{ lec.title }}</span>
                <span class="list-row-meta muted small">{{ formatCourseDate(lec.created_at) }}</span>
              </span>
              <span class="lecture-row-side">
                <span v-if="lectureTaskCount(lec.id)" class="muted small">
                  {{ lectureTaskCount(lec.id) }} зад.
                </span>
                <span v-if="lectureOpenTaskCount(lec.id)" class="row-badge">не сдано</span>
                <span class="list-row-chevron" aria-hidden="true">›</span>
              </span>
            </button>
          </li>
        </ul>
        <p v-if="!classroom.lectures.length" class="page-empty muted">
          {{ isTeacherInCurrent ? "опубликуйте первую лекцию" : "лекций пока нет" }}
        </p>
        <p v-else-if="!filteredLectures.length" class="page-empty muted">ничего не найдено</p>
      </template>

      <!-- задания -->
      <template v-else-if="tab === 'assignments'">
        <div v-if="!selectedAssignment" class="panel-toolbar">
          <FilterSearch v-model="assignmentQuery" placeholder="поиск задания" class="panel-search" />
          <div class="panel-toolbar-actions">
            <div
              v-if="!isTeacherInCurrent && classroom.assignments.length"
              class="submission-filter"
              role="group"
              aria-label="фильтр сдачи"
            >
              <button
                type="button"
                class="secondary small"
                :class="{ active: assignmentHandInFilter === 'all' }"
                @click="assignmentHandInFilter = 'all'"
              >
                все
              </button>
              <button
                type="button"
                class="secondary small"
                :class="{ active: assignmentHandInFilter === 'done' }"
                @click="assignmentHandInFilter = 'done'"
              >
                сдано
              </button>
              <button
                type="button"
                class="secondary small"
                :class="{ active: assignmentHandInFilter === 'undone' }"
                @click="assignmentHandInFilter = 'undone'"
              >
                не сдано
              </button>
            </div>
            <button
              v-if="isTeacherInCurrent"
              type="button"
              class="secondary"
              :class="{ active: addingAssignment }"
              @click="addingAssignment = !addingAssignment"
            >
              {{ addingAssignment ? "отмена" : "+ задание" }}
            </button>
          </div>
        </div>
        <div v-if="isTeacherInCurrent && addingAssignment && !selectedAssignment" class="form-card">
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

        <template v-if="selectedAssignment">
          <article class="task-detail detail-panel">
            <button type="button" class="detail-back" @click="closeAssignmentDetail">← задания</button>

            <template v-if="editingAssignment?.id === selectedAssignment.id">
              <input v-model="editingAssignment.title" placeholder="название" />
              <textarea v-model="editingAssignment.description" rows="3" placeholder="описание" />
              <input
                v-model.number="editingAssignment.max_points"
                type="number"
                min="1"
                max="1000"
                placeholder="баллы"
              />
              <div class="row-actions">
                <button type="button" @click="onSaveAssignmentEdit">сохранить</button>
                <button type="button" class="secondary" @click="cancelEditAssignment">отмена</button>
              </div>
            </template>

            <template v-else>
              <div class="task-card-head">
                <h2>{{ selectedAssignment.title }}</h2>
                <span class="muted small">{{ selectedAssignment.max_points }} б</span>
              </div>
              <p class="muted small">
                <RouterLink :to="`/u/${selectedAssignment.author_nickname}`">
                  {{ selectedAssignment.author_nickname }}
                </RouterLink>
                <button
                  v-if="selectedAssignment.lecture_id && lectureTitleForAssignment(selectedAssignment)"
                  type="button"
                  class="linkish muted small"
                  @click="openLecture(selectedAssignment.lecture_id!)"
                >
                  · {{ lectureTitleForAssignment(selectedAssignment) }}
                </button>
              </p>
              <p v-if="selectedAssignment.description" class="lecture-body">
                {{ selectedAssignment.description }}
              </p>

              <template v-if="!isTeacherInCurrent">
                <textarea
                  v-model="submissionBody[selectedAssignment.id]"
                  rows="3"
                  placeholder="ответ — текст или ссылка"
                />
                <ul v-if="attachmentsFor(selectedAssignment).length" class="files">
                  <li
                    v-for="(f, i) in attachmentsFor(selectedAssignment)"
                    :key="'kept-' + selectedAssignment.id + '-' + i"
                  >
                    <a :href="f.url" target="_blank" rel="noopener noreferrer">{{ f.file_name }}</a>
                    <button
                      type="button"
                      class="ghost-x"
                      @click="removeSubmissionAttachment(selectedAssignment, i)"
                    >
                      ×
                    </button>
                  </li>
                </ul>
                <ul v-if="pendingFor(selectedAssignment).length" class="files">
                  <li
                    v-for="(f, i) in pendingFor(selectedAssignment)"
                    :key="'p-' + selectedAssignment.id + '-' + i"
                  >
                    <span>
                      {{ f.name }}
                      <span class="muted small">{{ formatFileSize(f.size) }}</span>
                    </span>
                    <button
                      type="button"
                      class="ghost-x"
                      @click="removePendingFile(selectedAssignment, i)"
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
                      @change="onPickSubmissionFiles(selectedAssignment, $event)"
                    />
                  </label>
                  <span class="muted small">до 2 мб · до 10 файлов</span>
                </div>
                <div class="row-actions">
                  <button
                    type="button"
                    :disabled="submissionUploading[selectedAssignment.id]"
                    @click="onSubmitAssignment(selectedAssignment)"
                  >
                    {{ submissionUploading[selectedAssignment.id] ? "отправка…" : "сдать" }}
                  </button>
                  <span v-if="selectedAssignment.my_submission" class="muted small">
                    {{ selectedAssignment.my_submission.status }}
                    <span v-if="selectedAssignment.my_submission.grade_points !== null">
                      · {{ selectedAssignment.my_submission.grade_points }} /
                      {{ selectedAssignment.max_points }}
                    </span>
                    <span v-if="selectedAssignment.my_submission.teacher_comment">
                      · {{ selectedAssignment.my_submission.teacher_comment }}
                    </span>
                  </span>
                </div>
              </template>
              <template v-else>
                <div class="row-actions">
                  <button type="button" class="secondary" @click="startEditAssignment(selectedAssignment)">
                    изменить
                  </button>
                  <button type="button" class="secondary" @click="openSubmissions(selectedAssignment.id)">
                    проверить
                  </button>
                </div>
              </template>
            </template>
          </article>
        </template>

        <ul v-else-if="filteredListAssignments.length" class="task-list">
          <li v-for="a in filteredListAssignments" :key="a.id">
            <button type="button" class="task-list-row" @click="openAssignmentDetail(a.id)">
              <span class="list-row-main">
                <span class="list-row-title">{{ a.title }}</span>
                <span class="list-row-meta muted small">
                  {{ a.max_points }} б
                  <span v-if="lectureTitleForAssignment(a)"> · {{ lectureTitleForAssignment(a) }}</span>
                </span>
              </span>
              <span class="lecture-row-side">
                <span v-if="assignmentStatusLabel(a)" class="row-badge">{{ assignmentStatusLabel(a) }}</span>
                <span class="list-row-chevron" aria-hidden="true">›</span>
              </span>
            </button>
          </li>
        </ul>


        <p v-if="!classroom.assignments.length" class="page-empty muted">
          {{ isTeacherInCurrent ? "создайте первое задание" : "заданий пока нет" }}
        </p>
        <p
          v-else-if="!visibleCourseAssignments.length"
          class="page-empty muted"
        >
          нет заданий по фильтру
        </p>
        <p v-else-if="!filteredListAssignments.length" class="page-empty muted">ничего не найдено</p>
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
        <p v-if="!classroom.stream.length" class="page-empty muted">пусто</p>
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
          <p v-else class="page-empty muted">нет данных</p>
        </template>
        <template v-else>
          <div v-for="row in studentGradeRows" :key="row.student.id" class="grade-summary">
            <h3>{{ row.pointsEarned }} / {{ row.pointsTotal }} баллов</h3>
            <p class="muted small">{{ row.progress }}</p>
          </div>
          <p v-if="!studentGradeRows.length" class="page-empty muted">пока без оценок</p>
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

    <Teleport to="body">
      <div
        v-if="activeAssignmentForGrading && gradingAssignment"
        class="grade-modal-root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grade-modal-title"
      >
        <div class="grade-modal-backdrop" aria-hidden="true" @click="closeGrading" />
        <div class="grade-modal">
      <header class="grade-head">
        <div>
          <p class="muted small">проверка</p>
          <h3 id="grade-modal-title">{{ gradingAssignment.title }}</h3>
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

      <p v-if="!gradingStudents.length" class="page-empty muted">студентов нет</p>

      <div v-else class="grade-modal-split">
        <div class="grade-picker-wrap">
          <FilterSearch v-model="gradingSearch" class="grade-search" placeholder="ник…" />
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
    </div>
    </Teleport>
  </section>
</template>

<style scoped>
.courses {
  display: grid;
  gap: 0.9rem;
}
.small {
  font-size: 0.8rem;
}

.board-tools {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 0.5rem;
  align-items: stretch;
}
.board-search-wrap {
  grid-column: 1 / -1;
}
@media (min-width: 600px) {
  .board-search-wrap {
    grid-column: auto;
  }
}
.board-code {
  width: 8rem;
  font-size: 0.93rem;
}
@media (max-width: 600px) {
  .board-tools {
    grid-template-columns: 1fr 1fr;
  }
  .board-search-wrap {
    grid-column: 1 / -1;
  }
  .board-code {
    width: auto;
  }
}
.course-tabs {
  margin: 0.65rem 0 0.85rem;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.course-tabs::-webkit-scrollbar {
  display: none;
}
.course-tabs .filter-tab {
  flex-shrink: 0;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
}
.panel-search {
  flex: 1;
  min-width: 0;
  font-size: 0.92rem;
}
.panel-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.panel-toolbar .secondary.active {
  background: var(--surface2);
  color: var(--text);
}
@media (max-width: 560px) {
  .panel-toolbar {
    flex-wrap: wrap;
  }
  .panel-search {
    flex: 1 1 100%;
    width: 100%;
  }
  .panel-toolbar-actions {
    width: 100%;
    justify-content: flex-start;
  }
  .submission-filter {
    flex: 1;
  }
  .submission-filter button {
    flex: 1;
    min-width: 0;
  }
}

@media (max-width: 760px) {
  .course-tabs.filter-tabs {
    display: flex;
    width: 100%;
    overflow-x: auto;
    flex-wrap: nowrap;
    -webkit-overflow-scrolling: touch;
  }
  .course-tabs .filter-tab {
    flex: 0 0 auto;
  }
}

@media (max-width: 480px) {
  .courses {
    gap: 0.75rem;
  }
  .lecture-row,
  .task-list-row {
    min-height: 44px;
    padding: 0.72rem 0.7rem;
  }
  .lecture-row-side .muted.small {
    display: none;
  }
  .detail-panel {
    padding: 0.75rem;
  }
  .course-head h2 {
    font-size: 1.05rem;
    line-height: 1.3;
  }
  .course-card-thumb--head {
    width: 48px;
    height: 48px;
  }
  .course-card-thumb--head .course-card-thumb-letter {
    font-size: 1.1rem;
  }
  .grade-modal {
    width: 100%;
    max-height: min(94vh, 44rem);
    max-height: min(94dvh, 44rem);
  }
}

@media (min-width: 720px) {
  .lecture-detail.detail-panel,
  .task-detail.detail-panel {
    padding: 1rem 1.05rem;
  }
  .lecture-list,
  .task-list {
    gap: 0.35rem;
  }
}

.detail-panel {
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.list-row-main {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
  flex: 1;
}
.list-row-title {
  font-weight: 500;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-row-meta {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-row-chevron {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 1.1rem;
  line-height: 1;
  margin-left: 0.25rem;
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
  border-color: var(--focus-border);
  background: var(--surface2);
}
.course-card-layout {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}
.course-card-main {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 0.4rem;
}
.course-card-thumb {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface2);
}
.course-card-thumb--head {
  width: 56px;
  height: 56px;
}
.course-card-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.course-card-thumb-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: lowercase;
}
.course-icon-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.course-icon-pick {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.course-icon-pick input[type="file"] {
  font-size: 0.82rem;
  max-width: 100%;
}
.course-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.course-card-title {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  flex-wrap: wrap;
  min-width: 0;
  flex: 1;
}
.course-card-head-tools {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  flex-shrink: 0;
}
.course-card-pin {
  display: inline-flex;
  color: var(--text);
  line-height: 0;
}
.course-menu--card {
  flex-shrink: 0;
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
  border-radius: var(--radius);
}
.course-card--hidden {
  opacity: 0.52;
}
.course-menu {
  position: relative;
}
.course-menu-trigger {
  list-style: none;
  cursor: pointer;
  color: var(--muted);
}
.course-menu-trigger::-webkit-details-marker {
  display: none;
}
.course-menu-panel {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 0.2rem;
  min-width: 10.5rem;
  padding: 0.2rem;
  display: grid;
  gap: 0.05rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  z-index: 8;
}
.course-menu-item {
  width: 100%;
  margin: 0;
  padding: 0.45rem 0.55rem;
  text-align: left;
  font-size: 0.82rem;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.course-menu-item:hover {
  background: var(--surface2);
}
.course-menu-item--danger {
  color: var(--danger);
}
.course-menu-item--danger:hover {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}
.dot {
  color: var(--muted);
}

.course-head {
  display: grid;
  gap: 0.55rem;
  margin-bottom: 0.25rem;
}
.course-head-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.course-head-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.course-head-title {
  flex: 1;
  min-width: 0;
}
.course-head-meta {
  margin: 0.15rem 0 0;
}
.course-head-desc {
  margin: 0;
  line-height: 1.45;
}
.course-head-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.course-head h2 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 500;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.back {
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
  background: transparent;
}

.tab-count {
  font-size: 0.72rem;
  color: var(--muted);
  background: var(--surface2);
  border-radius: var(--radius);
  padding: 0.05rem 0.4rem;
  min-width: 1.2rem;
  text-align: center;
}

.submission-filter {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.submission-filter button.active {
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
  border-radius: var(--radius);
  background: transparent;
  color: var(--muted);
  font-size: 0.83rem;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.attach-label:hover {
  background: var(--surface2);
  color: var(--text);
  border-color: var(--hover-border);
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
  border-radius: var(--radius);
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

.detail-back {
  background: transparent;
  border: none;
  padding: 0;
  min-height: 0;
  color: var(--muted);
  font-size: 0.88rem;
  cursor: pointer;
  margin-bottom: 0.65rem;
}
.detail-back:hover {
  color: var(--text);
  background: transparent;
}

.lecture-detail,
.task-detail {
  display: grid;
  gap: 0.65rem;
}
.lecture-detail.detail-panel,
.task-detail.detail-panel {
  padding: 0.85rem;
}
.lecture-detail h2,
.task-detail h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 500;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.lecture-list,
.task-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}

.lecture-row,
.task-list-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.68rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  min-height: 44px;
  font: inherit;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.lecture-row:hover,
.task-list-row:hover {
  background: var(--surface2);
  border-color: var(--hover-border);
}
.task-list-row.open {
  border-color: var(--focus-border);
  background: var(--surface2);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
.task-list-item .task-row {
  border-top: none;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.lecture-row-main {
  display: grid;
  gap: 0.12rem;
  min-width: 0;
}
.lecture-row-title,
.task-list-title {
  font-weight: 500;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lecture-row-side {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-shrink: 0;
}
.row-badge {
  font-size: 0.72rem;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.08rem 0.4rem;
  white-space: nowrap;
}

.task-list-meta {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-list-item {
  display: grid;
  gap: 0.35rem;
}

.section-label {
  margin: 0.75rem 0 0.35rem;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--muted);
}

.linkish {
  background: transparent;
  border: none;
  padding: 0;
  min-height: 0;
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.linkish:hover {
  color: var(--text);
  background: transparent;
}
.lecture-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.lecture-head h2,
.lecture-head h3 {
  overflow-wrap: anywhere;
}
.lecture-head h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 500;
}
.icon-btn-sm.danger:hover {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

.lecture-video {
  width: 100%;
  max-width: 100%;
  overflow: hidden;
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
  gap: 0.3rem;
}
.attach-list a {
  display: block;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.88rem;
  background: var(--surface2);
}
.attach-list a:hover {
  border-color: var(--hover-border);
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
  border-radius: var(--radius);
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
  align-items: flex-start;
  flex-wrap: wrap;
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
  border-radius: var(--radius);
}
.grid-2 {
  display: grid;
  gap: 0.4rem;
  grid-template-columns: 1fr 1fr;
}
@media (max-width: 640px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
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
  min-width: 480px;
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
  border-radius: var(--radius);
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

.grade-modal-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(0.65rem, env(safe-area-inset-top)) max(0.65rem, env(safe-area-inset-right))
    max(0.65rem, env(safe-area-inset-bottom)) max(0.65rem, env(safe-area-inset-left));
  box-sizing: border-box;
}
.grade-modal-backdrop {
  position: absolute;
  inset: 0;
  margin: 0;
  background: rgba(0, 0, 0, 0.6);
  cursor: pointer;
}
.grade-modal {
  position: relative;
  z-index: 1;
  width: min(100%, 40rem);
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  max-height: min(92vh, 44rem);
  max-height: min(92dvh, 44rem);
  min-height: 0;
  overflow: hidden;
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
  max-height: min(36dvh, 14rem);
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
  flex: 0 0 auto;
  margin: 0.4rem 0.4rem 0.1rem;
  min-height: 36px;
  padding: 0.55rem 0.85rem;
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
  border-radius: var(--radius);
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
    max-height: 48dvh;
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
</style>
