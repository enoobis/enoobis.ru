import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { applyDocumentSeo } from "../utils/seo";
import { clearProfileOwnerTheme, isProfileThemeRoute } from "../utils/preferences";
import HomeView from "../views/HomeView.vue";
import MicroFeedView from "../views/MicroFeedView.vue";
import BlogListView from "../views/BlogListView.vue";
import LoginView from "../views/LoginView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },

    { path: "/blogs", name: "blog", component: BlogListView },
    {
      path: "/blogs/write",
      name: "blog-write",
      component: () => import("../views/BlogWriteView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/blogs/:id",
      name: "blog-post",
      component: () => import("../views/BlogPostView.vue"),
    },
    {
      path: "/blogs/:id/edit",
      name: "blog-edit",
      component: () => import("../views/BlogWriteView.vue"),
      meta: { requiresAuth: true },
    },
    { path: "/blog", redirect: "/blogs" },
    { path: "/blog/write", redirect: "/blogs/write" },
    { path: "/blog/:id", redirect: (to) => `/blogs/${to.params.id}` },
    { path: "/blog/:id/edit", redirect: (to) => `/blogs/${to.params.id}/edit` },

    {
      path: "/microblogs",
      name: "micro",
      component: MicroFeedView,
    },
    {
      path: "/microblogs/saved",
      name: "micro-saved",
      component: () => import("../views/MicroBookmarksView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/microblogs/:id",
      name: "micro-post",
      component: () => import("../views/MicroPostView.vue"),
    },
    { path: "/micro", redirect: "/microblogs" },
    { path: "/micro/:id", redirect: (to) => `/microblogs/${to.params.id}` },

    {
      path: "/saved",
      name: "saved",
      component: () => import("../views/SavedView.vue"),
      meta: { requiresAuth: true },
    },
    { path: "/search", name: "search", component: () => import("../views/SearchView.vue") },
    {
      path: "/chats",
      name: "chats",
      component: () => import("../views/ChatsView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/leaderboard",
      name: "leaderboard",
      component: () => import("../views/LeaderboardView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/storage",
      name: "storage",
      component: () => import("../views/StorageView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/s/:token",
      name: "shared",
      component: () => import("../views/SharedView.vue"),
    },
    { path: "/login", name: "login", component: LoginView },
    { path: "/register", name: "register", component: () => import("../views/RegisterView.vue") },
    {
      path: "/auth/qr",
      name: "qr-login",
      component: () => import("../views/QrLoginView.vue"),
    },
    {
      path: "/courses",
      name: "courses",
      component: () => import("../views/CoursesView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/courses/:courseId/:tab?",
      name: "course-classroom",
      component: () => import("../views/CoursesView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/library",
      name: "library",
      component: () => import("../views/LibraryView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/invites",
      name: "invites",
      component: () => import("../views/InvitesView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/work",
      name: "work",
      component: () => import("../views/WorkView.vue"),
      meta: { requiresAuth: true, requiresWork: true },
    },
    {
      path: "/admin",
      name: "admin",
      component: () => import("../views/AdminGateView.vue"),
      meta: { panel: true },
    },
    {
      path: "/u/:nickname",
      name: "profile",
      component: () => import("../views/ProfileView.vue"),
    },
    {
      path: "/u/:nickname/follows",
      name: "follows",
      component: () => import("../views/FollowsView.vue"),
    },
    {
      path: "/me/edit",
      name: "profile-edit",
      component: () => import("../views/ProfileEditView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/shop",
      name: "shop",
      component: () => import("../views/ShopView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/inventory",
      name: "inventory",
      component: () => import("../views/InventoryView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("../views/NotFoundView.vue"),
    },
  ],
});

router.beforeEach((to, from) => {
  const auth = useAuthStore();
  if (to.name === "home" && auth.token) {
    return { name: "micro", replace: true };
  }
  if ((to.name === "login" || to.name === "register") && auth.token) {
    return { name: "micro", replace: true };
  }
  if (to.meta.requiresAuth && !auth.token) return { name: "login", query: { next: to.fullPath } };
  if (to.meta.requiresWork && auth.role !== "master" && auth.role !== "admin") {
    return { name: "home" };
  }
  if (typeof window !== "undefined" && to.fullPath !== from.fullPath) {
    window.dispatchEvent(new CustomEvent("enoobis:nav-start"));
  }
  return true;
});

router.afterEach((to) => {
  applyDocumentSeo();
  if (!isProfileThemeRoute(to.path)) {
    clearProfileOwnerTheme();
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("enoobis:nav-done"));
  }
});

router.onError(() => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("enoobis:nav-done"));
  }
});

export default router;
