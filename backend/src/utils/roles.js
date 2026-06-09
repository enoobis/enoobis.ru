export const ALL_ROLES = ["student", "teacher", "master", "admin"];

/** учитель, мастер или админ — staff-привилегии */
export function isStaffRole(role) {
  return role === "teacher" || role === "master" || role === "admin";
}
