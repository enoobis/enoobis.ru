import { run, nowIso } from "../db.js";
import { awardAchievement } from "./achievements.js";

export function finalizeBlogPublish(postId, authorId) {
  const now = nowIso();
  run(
    "UPDATE blog_posts SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?",
    now,
    now,
    postId,
  );
  awardAchievement(authorId, "first_blog");
  run("UPDATE users SET coins = coins + 2 WHERE id = ?", authorId);
}
