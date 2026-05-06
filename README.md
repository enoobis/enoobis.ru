# enoobis.ru

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

## Deploy on VPS (after `git push`)

On the server, from the project directory (e.g. `/home/enoobis`):

```bash
cd /home/enoobis
git fetch origin
git reset --hard origin/main
sudo bash deploy.sh enoobis.ru
```

Use your real domain instead of `enoobis.ru` if `server_name` in nginx differs.

Optional — TLS once DNS points to the server:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d enoobis.ru
```

Sanity check:

```bash
systemctl status enoobis-backend --no-pager
curl -sS http://127.0.0.1:3000/api/health
```

`deploy.sh` reinstalls deps, rebuilds the frontend, restarts `enoobis-backend`, reloads nginx.

## Blog Platform Features

- Public blog feed with pagination, search, tag/category filters, and author pages.
- Post lifecycle for authors (`teacher`/`admin`): draft, publish, archive, edit, delete.
- Comments for approved users, plus reporting and admin moderation actions.
- Likes and bookmarks for approved users (with personal bookmarks feed).
- Image upload endpoint for blog content (`/api/blog/upload-image`).
- Admin moderation queue for blog reports (`/api/admin/blog/reports`).
- Markdown editor with common formatting tools (bold, italic, headings, links, lists, quotes, code) and live preview.

## Profile Settings

- Description (`bio`)
- Theme (`black`, `graphite`, `contrast`)
- Language (`ru`, `en`)
- Font scale (`compact`, `normal`, `large`)
