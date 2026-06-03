const VOTE_TABLES = new Set(["blog_post_likes", "micropost_likes"]);
const VOTE_ID_COLUMNS = new Set(["post_id", "micropost_id"]);

/**
 * @param {string} table
 * @param {string} idColumn
 */
export function assertVoteTarget(table, idColumn) {
  if (!VOTE_TABLES.has(table) || !VOTE_ID_COLUMNS.has(idColumn)) {
    throw new Error("invalid vote target");
  }
}

const USER_PATCH_FIELDS = new Set([
  "bio",
  "full_name",
  "website_url",
  "birthday",
  "country",
  "readme_md",
  "theme_preference",
  "language_preference",
  "font_preference",
  "ui_ink_hex",
  "ui_accent_hex",
]);

/**
 * @param {string} field
 */
export function assertUserPatchField(field) {
  if (!USER_PATCH_FIELDS.has(field)) throw new Error("invalid field");
}

const BLOG_PATCH_FIELDS = new Set(["title", "body", "excerpt", "cover_image_url"]);

/**
 * @param {string} field
 */
export function assertBlogPatchField(field) {
  if (!BLOG_PATCH_FIELDS.has(field)) throw new Error("invalid field");
}

const ASSIGNMENT_PATCH_FIELDS = new Set(["title", "description", "max_points"]);

/**
 * @param {string} field
 */
export function assertAssignmentPatchField(field) {
  if (!ASSIGNMENT_PATCH_FIELDS.has(field)) throw new Error("invalid field");
}

const LECTURE_PATCH_FIELDS = new Set(["title", "body_text", "video_url"]);

/**
 * @param {string} field
 */
export function assertLecturePatchField(field) {
  if (!LECTURE_PATCH_FIELDS.has(field)) throw new Error("invalid field");
}
