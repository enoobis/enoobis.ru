import { all, get, nowIso, run } from "../db.js";

export const ACHIEVEMENTS = [
  { key: "first_blog", title: "первый блог", description: "опубликовал первый блог" },
  { key: "first_micro", title: "первое сообщение", description: "написал первый микроблог" },
  { key: "first_course", title: "ученик", description: "записался на первый курс" },
  { key: "ten_followers", title: "10 подписчиков", description: "набрал 10 подписчиков" },
  { key: "hundred_followers", title: "100 подписчиков", description: "набрал 100 подписчиков" },
  { key: "hundred_likes_blog", title: "100 лайков на блоге", description: "блог собрал 100 лайков" },
  { key: "hundred_likes_micro", title: "100 лайков на микроблоге", description: "микроблог собрал 100 лайков" },
  { key: "course_complete", title: "выпускник", description: "сдал все задания курса" },
  { key: "mentor", title: "ментор", description: "получил роль ментора" },
];

const KEYS = new Set(ACHIEVEMENTS.map((a) => a.key));

export function awardAchievement(userId, key) {
  if (!userId || !KEYS.has(key)) return false;
  try {
    const existing = get(
      "SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_key = ?",
      userId,
      key,
    );
    if (existing) return false;
    run(
      "INSERT INTO user_achievements (user_id, achievement_key, earned_at) VALUES (?, ?, ?)",
      userId,
      key,
      nowIso(),
    );
    return true;
  } catch {
    return false;
  }
}

export function listAchievementsForUser(userId) {
  const earned = all(
    "SELECT achievement_key, earned_at FROM user_achievements WHERE user_id = ? ORDER BY earned_at DESC",
    userId,
  );
  const earnedMap = new Map(earned.map((r) => [r.achievement_key, r.earned_at]));
  return ACHIEVEMENTS.map((a) => ({
    key: a.key,
    title: a.title,
    description: a.description,
    earned: earnedMap.has(a.key),
    earned_at: earnedMap.get(a.key) ?? null,
  }));
}

export function checkFollowerMilestones(userId) {
  if (!userId) return;
  const count =
    get(
      "SELECT COUNT(*) as v FROM user_follows WHERE following_user_id = ?",
      userId,
    )?.v ?? 0;
  if (count >= 10) awardAchievement(userId, "ten_followers");
  if (count >= 100) awardAchievement(userId, "hundred_followers");
}

export function checkBlogLikeMilestone(postId) {
  if (!postId) return;
  const row = get(
    "SELECT author_id, (SELECT COUNT(*) FROM blog_post_likes WHERE post_id = bp.id AND vote = 1) as likes FROM blog_posts bp WHERE bp.id = ?",
    postId,
  );
  if (!row) return;
  if (row.likes >= 100) awardAchievement(row.author_id, "hundred_likes_blog");
}

export function checkMicroLikeMilestone(microId) {
  if (!microId) return;
  const row = get(
    "SELECT author_id, (SELECT COUNT(*) FROM micropost_likes WHERE micropost_id = m.id AND vote = 1) as likes FROM microposts m WHERE m.id = ?",
    microId,
  );
  if (!row) return;
  if (row.likes >= 100) awardAchievement(row.author_id, "hundred_likes_micro");
}
