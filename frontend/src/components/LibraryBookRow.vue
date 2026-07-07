<script setup lang="ts">
import type { LibraryBook } from "../api/library";
import AppIcon from "./AppIcon.vue";

defineProps<{
  book: LibraryBook;
  canManage: boolean;
  canRead: boolean;
  showSize: boolean;
  sizeLabel: string;
}>();

const emit = defineEmits<{
  read: [];
  download: [];
  edit: [];
}>();
</script>

<template>
  <li
    class="list-row"
    :class="{ 'has-cover': !!book.cover_url }"
    :data-book-id="book.id"
  >
    <span class="title">{{ book.title }}</span>
    <div class="row-actions">
      <button
        v-if="canRead"
        class="secondary read-btn"
        type="button"
        @click="emit('read')"
      >
        читать
      </button>
      <button
        class="icon-btn-sm"
        type="button"
        aria-label="скачать"
        title="скачать"
        @click="emit('download')"
      >
        <AppIcon name="download" :size="16" />
      </button>
      <button
        v-if="canManage"
        class="icon-btn-sm"
        type="button"
        aria-label="изменить"
        title="изменить"
        @click="emit('edit')"
      >
        <AppIcon name="edit" :size="16" />
      </button>
    </div>
    <span v-if="book.author" class="muted small author">{{ book.author }}</span>
    <span v-if="book.description" class="muted small desc">{{ book.description }}</span>
    <span class="muted small meta">
      <span v-if="book.category" class="cat-pill">{{ book.category }}</span>
      @{{ book.uploader_nickname }}<template v-if="showSize"> · {{ sizeLabel }}</template>
    </span>
    <img
      v-if="book.cover_url"
      :src="book.cover_url"
      :alt="book.title"
      class="book-cover"
      loading="lazy"
      decoding="async"
    />
  </li>
</template>

<style scoped>
.list-row {
  display: grid;
  column-gap: 0.75rem;
  row-gap: 0.2rem;
  align-items: start;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    "title"
    "actions"
    "author"
    "desc"
    "meta";
}

.list-row:not(:has(.author)) {
  grid-template-areas:
    "title"
    "actions"
    "desc"
    "meta";
}

.list-row.has-cover {
  grid-template-columns: minmax(0, 1fr) 68px;
  grid-template-areas:
    "title title"
    "actions actions"
    "author author"
    "desc cover"
    "meta cover";
}

.list-row.has-cover:not(:has(.author)) {
  grid-template-areas:
    "title title"
    "actions actions"
    "desc cover"
    "meta cover";
}

.title {
  grid-area: title;
  font-size: 0.95rem;
  text-transform: none;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.author {
  grid-area: author;
}

.desc {
  grid-area: desc;
  white-space: pre-wrap;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
}

.meta {
  grid-area: meta;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.15rem;
}

.row-actions {
  grid-area: actions;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.15rem;
  flex-wrap: nowrap;
}

.read-btn {
  min-height: 0;
  padding: 0.3rem 0.55rem;
  font-size: 0.78rem;
}

.row-actions button {
  min-height: 0;
}

.cat-pill {
  display: inline-block;
  padding: 0.05rem 0.45rem;
  border-radius: var(--radius);
  background: var(--surface2);
  color: var(--text);
  font-size: 0.74rem;
}

.book-cover {
  grid-area: cover;
  justify-self: center;
  align-self: center;
  display: block;
  width: 60px;
  height: 90px;
  object-fit: cover;
  border-radius: 3px;
}

@media (max-width: 640px) {
  .list-row.has-cover {
    grid-template-columns: minmax(0, 1fr) 60px;
  }

  .book-cover {
    width: 52px;
    height: 78px;
  }
}
</style>
