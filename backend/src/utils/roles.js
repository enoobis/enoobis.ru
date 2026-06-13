export const ALL_ROLES = ["student", "teacher", "master", "moderator", "admin"];

export function isAdmin(role) {
  return role === "admin";
}

export function isModerator(role) {
  return role === "moderator";
}

/** админ или модератор — доступ к панели модерации */
export function isPanelStaff(role) {
  return role === "admin" || role === "moderator";
}

/** учитель, мастер или админ — staff-привилегии */
export function isStaffRole(role) {
  return role === "teacher" || role === "master" || role === "admin";
}

/** блог и личное хранилище: менторы, админ, модератор */
export function canBlogAndStorage(role) {
  return isStaffRole(role) || isModerator(role);
}

export function canBypassApproval(role) {
  return isAdmin(role) || isModerator(role);
}
