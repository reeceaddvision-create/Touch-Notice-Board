# Touch Notice Board

The touch screen lives at **/** and the admin page staff use lives at **/admin**.

## What's in here

| Path | What it is |
|---|---|
| `public/index.html` | The touch screen |
| `public/admin/index.html` | The admin page (password protected) |
| `public/content.json` | Starting content, used until you first press Publish |
| `public/assets/` | Shared icons and page styling |
| `netlify/functions/api.mjs` | The server part: login, saving, publishing, picture uploads, feedback |
| `netlify.toml`, `package.json` | Settings Netlify needs. Don't edit these. |

## One-time setup on Netlify

1. **Project configuration → Environment variables → Add a variable**
   - `ADMIN_PASSWORD` = the password staff will use
   - `SESSION_SECRET` = any long random text (keep it private, never put it in this repository)
2. **Deploys → Trigger deploy → Deploy project** (new variables only apply after a fresh deploy).
3. Open **https://addvision-kiosk.netlify.app/admin**, log in, and press **Publish to screen** once.

Content is stored in Netlify Blobs (included with Netlify). Uploaded pictures are resized in the browser before upload.
To change the password, edit `ADMIN_PASSWORD` and redeploy.
