PRAGMA foreign_keys = ON;

ALTER TABLE users
ADD COLUMN theme_preference TEXT NOT NULL DEFAULT 'black' CHECK (theme_preference IN ('black', 'graphite', 'contrast'));

ALTER TABLE users
ADD COLUMN language_preference TEXT NOT NULL DEFAULT 'ru' CHECK (language_preference IN ('ru', 'en'));

ALTER TABLE users
ADD COLUMN font_preference TEXT NOT NULL DEFAULT 'normal' CHECK (font_preference IN ('compact', 'normal', 'large'));

UPDATE users
SET
  theme_preference = COALESCE(NULLIF(theme_preference, ''), 'black'),
  language_preference = COALESCE(NULLIF(language_preference, ''), 'ru'),
  font_preference = COALESCE(NULLIF(font_preference, ''), 'normal');
