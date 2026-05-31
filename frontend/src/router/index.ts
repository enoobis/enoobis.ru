import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { routeNavPending } from "../sync/routeNavPending";
import { applyDocumentSeo } from "../utils/seo";
import { clearProfileOwnerTheme, isProfileThemeRoute } from "../utils/preferences";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: () => import("../views/HomeView.vue") },

    { path: "/blogs", name: "blog", component: () => import("../views/BlogListView.vue") },
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
      component: () => import("../views/MicroFeedView.vue"),
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
    { path: "/login", name: "login", component: () => import("../views/LoginView.vue") },
    { path: "/register", name: "register", component: () => import("../views/RegisterView.vue") },
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
      path: "/admin",
      name: "admin",
      component: () => import("../views/AdminView.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
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

router.beforeEach((to) => {
  routeNavPending.value = true;
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.token) return { name: "login", query: { next: to.fullPath } };
  if (to.meta.requiresAdmin && auth.role !== "admin") return { name: "home" };
  return true;
});

router.afterEach((to) => {
  routeNavPending.value = false;
  applyDocumentSeo();
  if (!isProfileThemeRoute(to.path)) {
    clearProfileOwnerTheme();
  }
});

router.onError(() => {
  routeNavPending.value = false;
});

export default router;
