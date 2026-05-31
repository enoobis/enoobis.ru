import { get, run, nowIso } from "../db.js";
import { awardAchievement } from "./achievements.js";

export function finalizeBlogPublish(postId, authorId) {
  const row = get("SELECT published_at FROM blog_posts WHERE id = ?", postId);
  const firstPublish = !row?.published_at;
  const now = nowIso();
  run(
    "UPDATE blog_posts SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?",
    now,
    now,
    postId,
  );
  if (firstPublish) {
    awardAchievement(authorId, "first_blog");
    run("UPDATE users SET coins = coins + 2 WHERE id = ?", authorId);
  }
}
