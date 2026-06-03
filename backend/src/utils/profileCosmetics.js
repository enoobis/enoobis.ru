import fs from "node:fs";
import { all, run } from "../db.js";
import { saveIdenticon } from "./identicon.js";
import { safeResolveUploadUrl, UPLOAD_SUBDIRS } from "./uploadSafe.js";

function uploadExists(url) {
  if (!url || typeof url !== "string") return false;
  if (!url.startsWith("/uploads/")) return true;
  const abs = safeResolveUploadUrl(url, UPLOAD_SUBDIRS);
  if (!abs) return false;
  try {
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

export function sanitizeUserCosmetics(user) {
  if (!user?.id) return user;

  let avatar_url = user.avatar_url ?? "";
  let avatar_frame_url = user.avatar_frame_url ?? "";
  let wallpaper_url = user.wallpaper_url ?? "";
  let profile_cover_url = user.profile_cover_url ?? "";
  let changed = false;

  if (avatar_url && !uploadExists(avatar_url)) {
    avatar_url = saveIdenticon(user.nickname || user.id, user.id);
    changed = true;
  }
  if (avatar_frame_url && !uploadExists(avatar_frame_url)) {
    avatar_frame_url = "";
    changed = true;
  }
  if (wallpaper_url && !uploadExists(wallpaper_url)) {
    wallpaper_url = "";
    changed = true;
  }
  if (profile_cover_url && !uploadExists(profile_cover_url)) {
    profile_cover_url = "";
    changed = true;
  }

  if (changed) {
    run(
      `UPDATE users SET avatar_url = ?, avatar_frame_url = ?, wallpaper_url = ?, profile_cover_url = ?
       WHERE id = ?`,
      avatar_url,
      avatar_frame_url,
      wallpaper_url,
      profile_cover_url,
      user.id,
    );
  }

  return { avatar_url, avatar_frame_url, wallpaper_url, profile_cover_url };
}

export function detachShopItemFromUsers(kind, url) {
  if (!url) return;

  if (kind === "avatar") {
    const users = all("SELECT id, nickname FROM users WHERE avatar_url = ?", url);
    for (const u of users) {
      const next = saveIdenticon(u.nickname || u.id, u.id);
      run("UPDATE users SET avatar_url = ? WHERE id = ?", next, u.id);
    }
    return;
  }
  if (kind === "frame") {
    run("UPDATE users SET avatar_frame_url = '' WHERE avatar_frame_url = ?", url);
    return;
  }
  if (kind === "wallpaper") {
    run("UPDATE users SET wallpaper_url = '' WHERE wallpaper_url = ?", url);
    return;
  }
  if (kind === "cover") {
    run("UPDATE users SET profile_cover_url = '' WHERE profile_cover_url = ?", url);
  }
}

export function regenerateUserAvatar(userId, nickname) {
  const url = saveIdenticon(nickname || userId, userId);
  run("UPDATE users SET avatar_url = ? WHERE id = ?", url, userId);
  return url;
}
