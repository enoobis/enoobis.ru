import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: () => import("../views/HomeView.vue") },
    { path: "/blog", name: "blog", component: () => import("../views/BlogListView.vue") },
    { path: "/blog/:id", name: "blog-post", component: () => import("../views/BlogPostView.vue") },
    { path: "/login", name: "login", component: () => import("../views/LoginView.vue") },
    { path: "/register", name: "register", component: () => import("../views/RegisterView.vue") },
    {
      path: "/courses",
      name: "courses",
      component: () => import("../views/CoursesView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/invites",
      name: "invites",
      component: () => import("../views/InvitesView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/blog/write",
      name: "blog-write",
      component: () => import("../views/BlogWriteView.vue"),
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
      path: "/me/edit",
      name: "profile-edit",
      component: () => import("../views/ProfileEditView.vue"),
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.token) return { name: "login", query: { next: to.fullPath } };
  if (to.meta.requiresAdmin && auth.role !== "admin") return { name: "home" };
  return true;
});

export default router;
