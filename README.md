# enoobis.ru

Private project repository.
Built in a low-latency style: fast, minimal, and direct every time.
Code comments follow the same rule: short, clear, and only when needed.

## Admin Access

- Login: `REDACTED`
- Password: `REDACTED`

## Run Locally

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend (JS):

```bash
cd backend
npm install
npm run dev
```

## Blog Platform Features

- Public blog feed with pagination, search, tag/category filters, and author pages.
- Post lifecycle for authors (`teacher`/`admin`): draft, publish, archive, edit, delete.
- Comments for approved users, plus reporting and admin moderation actions.
- Likes and bookmarks for approved users (with personal bookmarks feed).
- Image upload endpoint for blog content (`/api/blog/upload-image`).
- Admin moderation queue for blog reports (`/api/admin/blog/reports`).
- Markdown editor with common formatting tools (bold, italic, headings, links, lists, quotes, code) and live preview.

## Profile Settings

- Wallpaper URL (`wallpaper_url`)
- Description (`bio`)
- Theme (`black`, `graphite`, `contrast`)
- Language (`ru`, `en`)
- Font scale (`compact`, `normal`, `large`)
