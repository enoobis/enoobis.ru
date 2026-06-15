import { isAdmin } from "./roles.js";

/** гости видят только профили с role admin */
export function guestMayViewProfile(viewerId, profileRole) {
  if (viewerId) return true;
  return isAdmin(profileRole);
}

export function guestProfileAccessError() {
  return { status: 401, error: "login required" };
}
