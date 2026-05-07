# enoobis.ru

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend :

```bash
cd backend
npm install
npm run dev
```

Deploy 

```bash
cd `the/dir`
git fetch origin
git reset --hard origin/main
sudo bash deploy.sh `the.domname`
```

TLS once DNS points to the server:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d `the.domname`
```

If you changed

```bash
ssh theusr@theserv
cd /path/thewebst
git pull
sudo bash deploy.sh thewebst
```

Sanity check:

```bash
systemctl status enoobis-backend --no-pager
curl -sS http://127.0.0.1:3000/api/health
```
