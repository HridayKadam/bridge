# Bridge

Transfer playlists between Spotify and YouTube. Install the extension, log in to both, and move playlists either way.

---

## For users

1. **Install**
   - From Chrome Web Store (when published), or  
   - **Load unpacked:** open `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → select the `bridge-extension` folder.

2. **Use**
   - Click the Bridge icon.
   - **Log in** with Spotify and with Google (YouTube).
   - Choose **Spotify → YouTube** or **YouTube → Spotify**.
   - Pick the **source** and **destination** playlists.
   - Click **Transfer to YouTube** or **Transfer to Spotify**.
   - Wait for the progress bar; you’ll see how many tracks were transferred (duplicates are skipped).

No configuration needed. Just log in and transfer.

---

## For you (publisher) – one-time setup

Before giving the extension to users, set your API keys once:

1. **Spotify**
   - [Spotify Dashboard](https://developer.spotify.com/dashboard) → create an app → copy **Client ID**.
   - Put it in **config.js** as `SPOTIFY_CLIENT_ID`.
   - In the same app, **Edit settings** → **Redirect URIs** → add **exactly** (no path, trailing slash required):  
     `https://<YOUR_EXTENSION_ID>.chromiumapp.org/`  
     Example for this extension: `https://eppajbfepkbidpdciloobkdipfhbinfl.chromiumapp.org/`  
     (Get the extension ID from `chrome://extensions` after loading the folder once.)

2. **Google / YouTube** (required for YouTube login)
   - [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → select or create a project.
   - Enable **YouTube Data API v3**: **APIs & Services** → **Library** → search “YouTube Data API v3” → **Enable**.
   - **Create credentials** → **OAuth client ID**.
   - If asked, configure the **OAuth consent screen** (e.g. External, add your email as test user).
   - Application type: **Chrome extension** (not “Web application”).
   - **Application ID**: your extension ID, e.g. `eppajbfepkbidpdciloobkdipfhbinfl` (from `chrome://extensions`).
   - Create → copy the **Client ID** (looks like `xxxxx.apps.googleusercontent.com`).
   - Put it in **manifest.json** under `oauth2.client_id`, and in **config.js** and **background.js** as `GOOGLE_CLIENT_ID`.
   - Reload the extension after changing the manifest.

3. **Firebase (optional)**
   - If you want transfer analytics, create a project in [Firebase Console](https://console.firebase.google.com), then in **Project settings** copy the config into **config.js** under `FIREBASE`. Create a **Firestore** database; the extension writes to a `transfers` collection.

After this, the same build is ready for users: they only install and use it.

**Icons:** To regenerate icons, run `python3 make_icons.py` inside `bridge-extension`.
