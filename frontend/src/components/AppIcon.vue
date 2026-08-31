<script setup lang="ts">
import { computed, type Component } from "vue";
import {
  Ban,
  Bold,
  Bookmark,
  BriefcaseBusiness,
  ChevronLeft,
  Code,
  Contrast,
  Copy,
  Download,
  Eraser,
  Eye,
  FileText,
  Filter,
  Flame,
  Flag,
  Folder,
  GraduationCap,
  Heading,
  Heart,
  House,
  Image,
  Italic,
  Link,
  List,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Package,
  PenLine,
  Pencil,
  Pin,
  Play,
  QrCode,
  Quote,
  Reply,
  Search,
  Send,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Sun,
  Tag,
  Ticket,
  Trash2,
  Triangle,
  Trophy,
  Undo2,
  Plus,
  Upload,
  User,
  UserPlus,
  Users,
  X,
} from "@lucide/vue";

export type AppIconName =
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
  | "voteUp"
  | "voteDown"
  | "comment"
  | "tag"
  | "bookmark"
  | "bookmarked"
  | "report"
  | "send"
  | "recall"
  | "delete"
  | "download"
  | "edit"
  | "settings"
  | "menu"
  | "more"
  | "play"
  | "sun"
  | "moon"
  | "contrast"
  | "close"
  | "filter"
  | "spark"
  | "import"
  | "block"
  | "search"
  | "back"
  | "chat"
  | "folder"
  | "copy"
  | "image"
  | "pin"
  | "pinned"
  | "trophy"
  | "leaderboard"
  | "inventory"
  | "shop"
  | "bold"
  | "italic"
  | "code"
  | "heading"
  | "list"
  | "quote"
  | "link"
  | "seen"
  | "reply"
  | "clear"
  | "qr"
  | "briefcase"
  | "users"
  | "plus";

const icons: Record<AppIconName, Component> = {
  home: House,
  blog: FileText,
  courses: GraduationCap,
  invites: Ticket,
  write: PenLine,
  admin: Shield,
  profile: User,
  login: LogIn,
  register: UserPlus,
  logout: LogOut,
  like: Heart,
  liked: Heart,
  voteUp: Triangle,
  voteDown: Triangle,
  comment: MessageSquare,
  tag: Tag,
  bookmark: Bookmark,
  bookmarked: Bookmark,
  report: Flag,
  send: Send,
  recall: Undo2,
  delete: Trash2,
  download: Download,
  edit: Pencil,
  settings: Settings,
  menu: Menu,
  more: MoreHorizontal,
  play: Play,
  sun: Sun,
  moon: Moon,
  contrast: Contrast,
  close: X,
  filter: Filter,
  spark: Sparkles,
  import: Upload,
  block: Ban,
  search: Search,
  back: ChevronLeft,
  chat: MessageCircle,
  folder: Folder,
  copy: Copy,
  image: Image,
  pin: Pin,
  pinned: Pin,
  trophy: Trophy,
  leaderboard: Flame,
  inventory: Package,
  shop: ShoppingBag,
  bold: Bold,
  italic: Italic,
  code: Code,
  heading: Heading,
  list: List,
  quote: Quote,
  link: Link,
  seen: Eye,
  reply: Reply,
  clear: Eraser,
  qr: QrCode,
  briefcase: BriefcaseBusiness,
  users: Users,
  plus: Plus,
};

const FILLED = new Set<AppIconName>([
  "liked",
  "bookmarked",
  "voteUp",
  "voteDown",
  "pinned",
]);

const DEFAULT_SIZE = 20;
const STROKE_WIDTH = 2.5;
const SIZE_SCALE = 1.125;

const props = withDefaults(
  defineProps<{
    name: AppIconName;
    size?: number;
  }>(),
  { size: DEFAULT_SIZE },
);

const icon = computed(() => icons[props.name]);

const iconClass = computed(() => {
  if (props.name === "voteDown") return "app-icon app-icon--flip";
  return "app-icon";
});

const iconProps = computed(() => {
  const filled = FILLED.has(props.name);
  return {
    size: Math.round(props.size * SIZE_SCALE),
    strokeWidth: STROKE_WIDTH,
    ...(filled ? { fill: "currentColor" as const } : {}),
  };
});
</script>

<template>
  <component :is="icon" :class="iconClass" v-bind="iconProps" aria-hidden="true" />
</template>

<style scoped>
.app-icon {
  display: block;
  flex-shrink: 0;
}

.app-icon--flip {
  transform: rotate(180deg);
}
</style>
