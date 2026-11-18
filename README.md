# Purple Fox: one-time setup

Your app address (after GitHub Pages is on): **https://dumtaz.github.io/Purple-Fox/**

## 1. Free AI writing (Google Gemini key), 2 minutes
1. Go to https://aistudio.google.com/apikey and sign in with Google.
2. Press **Create API key**, then copy the key.
3. In the app: **Settings → AI writing**, paste the key, then press **Test key**.

The key is saved on that device only. Add it once on each device you use.

## 2. Sync between devices (free Supabase), 5 minutes
1. In your personal Supabase account, create a **New project** (free plan). Choose the Singapore region.
2. Open **SQL Editor → New query**, paste everything from `setup.sql`, then press **Run**.
3. Open **Project Settings → API**. Copy the **Project URL** and the **Publishable key** (it starts with `sb_publishable_`).
4. In the app: **Settings → Sync with Supabase**, paste both, then press **Save**.
5. Enter your email and a password, then press **Create account**. Open the confirmation email from Supabase and click the link. The page it opens may show an error; that's fine, because your email is confirmed anyway.
6. Back in the app, press **Sign in**. Do the same on your other devices: paste the URL and key, then **Sign in** (no new account).
7. Recommended: in Supabase, go to **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**, so only your account exists.

What syncs: plans, storyboards, scenes, captions and your host settings.
What stays on each device: made videos, voice recordings, the AI voices, and the Gemini key.

## 3. AI voice, once per device
**Settings → AI voice → Download voices** (about 85-130 MB), then press **Test voice**.

## 4. Install the app
- **Windows (Edge or Chrome):** open the app address, then click the install icon in the address bar.
- **iPad (Safari):** Share → Add to Home Screen.

## Language and subtitles
On the **Make** tab, each video has two choices:
- **Speak in:** Original line (your English + 华语 mix), **All English**, or **全中文**.
- **Subtitles:** Same as voice, **English**, **中文**, **中文 + English** (two lines), or none.

For All English, 全中文 or bilingual subtitles, every line needs an English and a 中文 version. **Write scenes with AI** now makes both automatically. For older videos, press **Make English & 中文 with AI**, or type them into each scene. In the **Write** tab you can also pick **All English** or **全中文** as the language mix.

## Daily use
**Plan → Plan 7 ideas with AI → Add to plan**, then **Write → Write scenes with AI** for each one, then **Plan → Make all videos**. Upload the files to TikTok and YouTube Shorts, and use **Copy all** in the post pack for the captions.
