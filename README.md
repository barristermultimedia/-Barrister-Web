# Barrister Multimedia website

Static site in `public/` plus a Netlify Functions backend in `netlify/functions/` (data stored in Netlify Blobs).

## Deploy on Netlify
Drag-and-drop deploys do **not** build functions that have dependencies. Use one of:
1. **Git (recommended):** push this folder to GitHub, then in Netlify choose *Add new site > Import from Git*. Settings are read from `netlify.toml`.
2. **CLI:** `npm i -g netlify-cli`, `npm install`, `netlify login`, `netlify deploy --prod`.

## Environment variables (Netlify > Site configuration > Environment variables)
See `.env.example`. Required: `ADMIN_PASSWORD`, `SESSION_SECRET`. Redeploy after changing them.
- **Gmail:** turn on 2-step verification, create an App Password at myaccount.google.com/apppasswords, set `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFY_EMAIL`.
- **WhatsApp:** message the CallMeBot number once to activate (callmebot.com), then set `WHATSAPP_PHONE` and `CALLMEBOT_APIKEY`. Or set `WHATSAPP_WEBHOOK_URL` for Twilio/Make/Zapier.
- Every enquiry is saved first, so it always appears on the admin page even if Gmail or WhatsApp fails. Use *Send a test notification* on the admin Overview.

## Your details
Edit `public/js/config.js` (email, phone, WhatsApp number). An empty WhatsApp number hides the WhatsApp buttons.

## Admin (`/admin.html`)
Sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Manage enquiries (status, notes, reply on WhatsApp or email, resend alerts, delete, CSV), staff (add, edit, switch off, reset password, delete), attendance (view, edit, add, delete, CSV) and settings. First job: **Settings > Use my current location** while at the studio, choose flag or block outside the area, set the time zone, save.

## Staff (`/staff.html`, `/attendance.html`)
Staff sign in, then clock in or out. The server compares the device location to the studio and records Verified, Outside or Unverified. Browser location can be faked, so treat it as a deterrent and review flagged records.

## Accessibility and speed
Skip link, landmarks, keyboard navigation, visible focus, AA contrast, alt text on all images, responsive webp/jpg images, captions (WebVTT) and transcript for the reel, play/pause/mute/skip/captions controls, reduced-motion support. To add your own video, put the file and a `.vtt` caption file in `public/media/` and copy the player block in `portfolio.html`.

## Notes
- Images are about 736px wide; replace with larger originals for sharper heroes.
- The reel is a placeholder built from your photos.
- Fonts load from Google Fonts.
