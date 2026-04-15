<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  createAssignment,
  createCourse,
  createStreamPost,
  enrollCourse,
  getClassroom,
  gradeSubmission,
  listAssignmentSubmissions,
  listCourses,
  setClosedStudents,
  submitAssignment,
  unenrollCourse,
  type Assignment,
  type AssignmentSubmission,
  type Course,
  type CourseClassroom,
} from "../api/courses";
import { useAuthStore } from "../stores/auth";

type Tab = "stream" | "assignments" | "people";

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

const canTeach = computed(() => auth.role === "teacher" || auth.role === "admin");
const isTeacherInCurrent = computed(() => classroom.value?.is_teacher ?? false);

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
    tab.value = "stream";
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
    <p class="muted">Лента, задания, сдачи, оценки, участники.</p>
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
</style>
