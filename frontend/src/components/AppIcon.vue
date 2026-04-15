<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    name:
      | "home"
      | "blog"
      | "courses"
      | "invites"
      | "write"
      | "admin"
      | "profile"
      | "login"
      | "register"
      | "logout"
      | "like"
      | "liked"
      | "comment"
      | "tag"
      | "bookmark"
      | "bookmarked"
      | "report"
      | "send"
      | "delete"
      | "edit"
      | "settings"
      | "menu"
      | "play"
      | "sun"
      | "moon"
      | "contrast"
      | "close"
      | "filter"
      | "spark"
      | "import"
      | "block";
    size?: number;
  }>(),
  { size: 16 },
);

const viewBox = "0 0 24 24";

const d = computed(() => {
  switch (props.name) {
    case "home":
      return "M3 10.5L12 3l9 7.5M6.5 9.5V21h11V9.5";
    case "blog":
      return "M5 5h14v14H5zM8 9h8M8 13h8M8 17h5";
    case "courses":
      return "M3 8l9-4 9 4-9 4-9-4zm3 3.5l6 2.7 6-2.7M6 16l6 2.8 6-2.8";
    case "invites":
      return "M9 8h6M9 12h6M9 16h4M5 4h14v16H5z";
    case "write":
      return "M4 20h4l10-10-4-4L4 16v4zm9-13l4 4";
    case "admin":
      return "M12 3l2.1 2.1 3-.4.9 2.8 2.8.9-.4 3L23 12l-2.1 2.1.4 3-2.8.9-.9 2.8-3-.4L12 23l-2.1-2.1-3 .4-.9-2.8-2.8-.9.4-3L1 12l2.1-2.1-.4-3 2.8-.9.9-2.8 3 .4L12 3zm0 5.5A3.5 3.5 0 1012 15a3.5 3.5 0 000-7z";
    case "profile":
      return "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0";
    case "login":
      return "M10 17l-5-5 5-5M5 12h10M14 4h5v16h-5";
    case "register":
      return "M12 5v14M5 12h14";
    case "logout":
      return "M14 7l5 5-5 5M4 12h14M10 4H5v16h5";
    case "like":
      return "M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z";
    case "liked":
      return "M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z";
    case "comment":
      return "M4 5h16v11H8l-4 4V5z";
    case "tag":
      return "M20 10l-9.5 9.5L3 12V4h8l9 6zM8 8h.01";
    case "bookmark":
      return "M7 4h10v16l-5-3-5 3V4z";
    case "bookmarked":
      return "M7 4h10v16l-5-3-5 3V4z";
    case "report":
      return "M12 9v4m0 4h.01M10.3 3h3.4L21 17.5a2 2 0 01-1.7 3H4.7a2 2 0 01-1.7-3L10.3 3z";
    case "send":
      return "M3 11l18-8-8 18-2-7-8-3zm8 3l10-10";
    case "delete":
      return "M6 7h12M9 7V5h6v2m-8 0l1 12h8l1-12";
    case "edit":
      return "M4 20h4l10-10-4-4L4 16v4zm9-13l4 4";
    case "settings":
      return "M12 3l2.1 2.1 3-.4.9 2.8 2.8.9-.4 3L23 12l-2.1 2.1.4 3-2.8.9-.9 2.8-3-.4L12 23l-2.1-2.1-3 .4-.9-2.8-2.8-.9.4-3L1 12l2.1-2.1-.4-3 2.8-.9.9-2.8 3 .4L12 3zm0 5.5A3.5 3.5 0 1012 15a3.5 3.5 0 000-7z";
    case "menu":
      return "M4 7h16M4 12h16M4 17h16";
    case "play":
      return "M9 7l9 5-9 5V7z";
    case "sun":
      return "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66 5.66l1.41 1.41M2.93 4.93l1.41 1.41m0 11.32l-1.41 1.41m14.73-14.73l-1.41 1.41M12 8a4 4 0 100 8 4 4 0 000-8z";
    case "moon":
      return "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z";
    case "contrast":
      return "M12 3a9 9 0 100 18V3zM12 3a9 9 0 010 18";
    case "close":
      return "M6 6l12 12M18 6L6 18";
    case "filter":
      return "M3 5h18M6 12h12M10 19h4";
    case "spark":
      return "M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 16l-1.7-5L6 9.3l4.3-1.7L12 3z";
    case "import":
      return "M12 3v12m0 0l4-4m-4 4l-4-4M5 19h14";
    case "block":
      return "M12 3a9 9 0 100 18 9 9 0 000-18zm0 0l0 0m6.4 2.6L5.6 18.4";
    default:
      return "";
  }
});
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    :viewBox="viewBox"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="d" />
    <path v-if="name === 'liked' || name === 'bookmarked'" :d="d" fill="currentColor" stroke="none" />
  </svg>
</template>
