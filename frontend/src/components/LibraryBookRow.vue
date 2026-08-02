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
  <li class="book" :class="{ 'has-cover': !!book.cover_url }" :data-book-id="book.id">
    <img
      v-if="book.cover_url"
      :src="book.cover_url"
      :alt="book.title"
      class="cover"
      loading="lazy"
      decoding="async"
    />
    <div class="body">
      <div class="top">
        <div class="info">
          <span class="title">{{ book.title }}</span>
          <span v-if="book.author" class="muted small">{{ book.author }}</span>
        </div>
        <div class="actions">
          <button
            v-if="canRead"
            class="icon-btn-sm"
            type="button"
            aria-label="читать"
            title="читать"
            @click="emit('read')"
          >
            <AppIcon name="play" :size="18" />
          </button>
          <button
            class="icon-btn-sm"
            type="button"
            aria-label="скачать"
            title="скачать"
            @click="emit('download')"
          >
            <AppIcon name="download" :size="18" />
          </button>
          <button
            v-if="canManage"
            class="icon-btn-sm"
            type="button"
            aria-label="изменить"
            title="изменить"
            @click="emit('edit')"
          >
            <AppIcon name="edit" :size="18" />
          </button>
        </div>
      </div>
      <p v-if="book.description" class="muted small desc">{{ book.description }}</p>
      <p class="muted small meta">
        <template v-if="book.category">{{ book.category }} · </template>
        <template v-if="showSize">{{ sizeLabel }}</template>
        <template v-else>@{{ book.uploader_nickname }}</template>
      </p>
    </div>
  </li>
</template>

<style scoped>
.book {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  min-width: 0;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  list-style: none;
}

.cover {
  flex: 0 0 auto;
  width: 52px;
  height: 78px;
  object-fit: cover;
  border-radius: 4px;
  background: var(--surface2);
}

.body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 0.35rem;
}

.top {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-width: 0;
}

.info {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 0.15rem;
}

.title {
  font-size: 0.98rem;
  font-weight: 500;
  letter-spacing: -0.015em;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.05rem;
  flex-shrink: 0;
}

.actions .icon-btn-sm {
  width: 36px;
  height: 36px;
  min-height: 36px;
  color: var(--muted);
}

.actions .icon-btn-sm:hover {
  color: var(--text);
  background: var(--surface2);
}

.desc {
  margin: 0;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  white-space: pre-wrap;
}

.meta {
  margin: 0;
}

.small {
  font-size: 0.8rem;
}

@media (max-width: 520px) {
  .cover {
    width: 44px;
    height: 66px;
  }
}
</style>
