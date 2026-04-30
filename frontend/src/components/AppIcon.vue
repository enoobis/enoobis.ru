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
      return "M4 10.5L12 4l8 6.5M6.5 9.8V20h11V9.8M10 20v-4.5h4V20";
    case "blog":
      return "M6 4.5h8l4 4V19a1 1 0 01-1 1H6a1 1 0 01-1-1V5.5a1 1 0 011-1zM14 4.5V9h4M8 12h8M8 15.5h8M8 19h5";
    case "courses":
      return "M3 8l9-4 9 4-9 4-9-4zm4 4v4l5 2.2 5-2.2v-4";
    case "invites":
      return "M4 8l8-4 8 4-8 4-8-4zm3 4v5l5 2.4 5-2.4v-5";
    case "write":
      return "M4 20h4l10.2-10.2a1.5 1.5 0 000-2.1l-2-2a1.5 1.5 0 00-2.1 0L4 16v4zm9.8-12.2l2.9 2.9";
    case "admin":
      return "M12 3l7 3v6c0 4.8-3 8-7 9-4-1-7-4.2-7-9V6l7-3zm0 5l1.2 2.3 2.6.4-1.9 1.8.4 2.6-2.3-1.2-2.3 1.2.4-2.6-1.9-1.8 2.6-.4L12 8z";
    case "profile":
      return "M12 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm-6.5 7a6.5 6.5 0 0113 0";
    case "login":
      return "M10 17l-5-5 5-5M5 12h11M15 4h4v16h-4";
    case "register":
      return "M16 21v-1.2a3.8 3.8 0 00-3.8-3.8H8.8A3.8 3.8 0 005 19.8V21M10.5 8.5a2.5 2.5 0 105 0 2.5 2.5 0 00-5 0zM19 8v4M17 10h4";
    case "logout":
      return "M15 7l5 5-5 5M20 12H9M9 4H5v16h4";
    case "like":
      return "M12 20s-6.8-4.3-6.8-9.6A3.8 3.8 0 0112 8a3.8 3.8 0 016.8 2.4C18.8 15.7 12 20 12 20z";
    case "liked":
      return "M12 20s-6.8-4.3-6.8-9.6A3.8 3.8 0 0112 8a3.8 3.8 0 016.8 2.4C18.8 15.7 12 20 12 20z";
    case "comment":
      return "M5 6h14v9H10l-5 4V6z";
    case "tag":
      return "M20 10l-9.5 9.5L3 12V4h8l9 6zM8 8h.01";
    case "bookmark":
      return "M7 4h10v16l-5-3-5 3V4z";
    case "bookmarked":
      return "M7 4h10v16l-5-3-5 3V4z";
    case "report":
      return "M12 3l8 4.5v9L12 21 4 16.5v-9L12 3zm0 5v5m0 3h.01";
    case "send":
      return "M3 11.5L21 4l-7 16-2.6-6.4L3 11.5zm8.4 2.1L21 4";
    case "delete":
      return "M6 7h12M9 7V5h6v2m-8 0l1 12h8l1-12M10 11v6M14 11v6";
    case "edit":
      return "M4 20h4l10-10-4-4L4 16v4zm9-13l4 4";
    case "settings":
      return "M12 3v3M12 18v3M21 12h-3M6 12H3m13.7-5.7L14.6 8.4M9.4 15.6l-2.1 2.1m0-11.4l2.1 2.1m5.2 7.2l2.1 2.1M12 9a3 3 0 100 6 3 3 0 000-6z";
    case "menu":
      return "M4.5 7h15M4.5 12h15M4.5 17h15";
    case "play":
      return "M8 6.5v11L18 12 8 6.5z";
    case "sun":
      return "M12 3v2M12 19v2M21 12h-2M5 12H3m14.4 6.4l-1.4-1.4M8 8L6.6 6.6m10.8 0L16 8M8 16l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z";
    case "moon":
      return "M20 14.2A8.5 8.5 0 119.8 4 6.8 6.8 0 0020 14.2z";
    case "contrast":
      return "M12 3a9 9 0 100 18V3zM12 3a9 9 0 010 18";
    case "close":
      return "M6 6l12 12M18 6L6 18";
    case "filter":
      return "M4 6h16M7 12h10M10 18h4";
    case "spark":
      return "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z";
    case "import":
      return "M12 3v12m0 0l4-4m-4 4l-4-4M5 19h14";
    case "block":
      return "M12 3a9 9 0 100 18 9 9 0 000-18zm6.4 2.6L5.6 18.4";
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
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="d" />
    <path v-if="name === 'liked' || name === 'bookmarked'" :d="d" fill="currentColor" stroke="none" />
  </svg>
</template>
