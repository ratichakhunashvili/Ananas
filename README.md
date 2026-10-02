# Ananas

A live team competition / classroom "homework" platform: buzzer rounds,
photo association, music guessing, karaoke bonuses, and timed problem cases,
with a dedicated Admin control room, a simple mobile Team view, and a
big-screen Spectator display.

A **team is the login** - there are no individual participant accounts.
Admin creates a team with one shared username/password, gives it to
whoever's on that team, and any of their phones can sign in with it to
share that team's buzzer and score. See **Architecture notes** below.

## Tech stack

- React + TypeScript + Vite
- React Router
- Firebase Authentication (email/password; teams and spectators use a
  synthetic `username@<domain>` email under the hood)
- Firebase Realtime Database - server-authoritative **live** game state
  (current question, buzzer, music/karaoke playback, problem-case timers)
- Firestore - durable data (accounts, teams, question bank, categories,
  music library, games, score history, audit log)
- Firebase Storage - question images / problem-case files
- Plain CSS (`src/styles/global.css`) using the Ananas brand tokens

No backend server and no Cloud Functions are used - see **Architecture
notes** below for why, and what that trades off.

## Firebase project setup

1. Create a project at the [Firebase console](https://console.firebase.google.com/).
2. Add a Web App to the project (gear icon → Project settings → Your apps →
   `</>`). Copy the config values shown there.
3. Enable these products in the console:
   - **Authentication** → Sign-in method → enable **Email/Password**.
   - **Firestore Database** → create in production mode.
   - **Realtime Database** → create a database (note its URL).
   - **Storage** → create a default bucket.
4. Install the Firebase CLI if you don't have it (`npm install -g firebase-tools`),
   then from this project root:
   ```
   firebase login
   # edit .firebaserc and replace REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID
   firebase deploy --only firestore:rules,firestore:indexes,database,storage
   ```
   This pushes `firestore.rules`, `firestore.indexes.json`, `database.rules.json`,
   and `storage.rules` - all mandatory. The app will not behave correctly
   (and is not safe) without these deployed.
5. (Optional) To search for music by name in the Admin Music Library, enable
   the **YouTube Data API v3** in Google Cloud Console for the same project
   (or any project) and create an API key. Without it, Admin can still add
   tracks by pasting a YouTube URL directly.

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values from step 2 above:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_DATABASE_URL=
VITE_AUTH_USERNAME_DOMAIN=ananas.local
VITE_YOUTUBE_API_KEY=
```

`.env.local` is gitignored and must never be committed.

## Running locally

```
npm install
npm run dev
```

Open the printed localhost URL. Until `.env.local` is filled in, the app
shows a "Firebase isn't configured yet" screen instead of crashing.

## Creating the first Admin account

There is intentionally **no in-app "sign up as Admin" form** - that would be
a standing attack surface on a publicly reachable login page. Instead, the
first (and any subsequent) Admin account is created with a small script that
uses the Firebase **Admin SDK**, run locally by you:

1. Firebase console → Project settings → Service accounts → **Generate new
   private key**. Save the JSON file somewhere outside of git (e.g. the
   project root as `serviceAccountKey.json` - already gitignored).
2. Copy `.env.admin.example` to `.env.admin` and fill in `ADMIN_EMAIL`,
   `ADMIN_PASSWORD`, `FIREBASE_DATABASE_URL`, and the path to the service
   account JSON.
3. Run:
   ```
   npm run create-admin
   ```
4. Sign in at `/login` with that email and password. Admin credentials are
   never stored in source, and re-running the script safely resets the
   password if you forget it.

Teams and spectator accounts, by contrast, **are** created from inside the
app (Admin → a homework → Teams tab for teams; Admin → Spectators for
spectator logins), since the Admin is already authenticated and that's the
normal, intended flow.

## Architecture notes

- **A team IS the login, not a container of individual logins.** Admin
  creates a team and its one shared username/password together in one step
  (`teamService.createTeamWithLogin`). Every device that signs in with those
  credentials gets the *same* Firebase Auth user - that's normal, supported
  behavior (Firebase doesn't limit concurrent sessions for one user), and
  it's exactly what "the team" means for buzzing and scoring: whichever
  device on the team buzzes first wins it for the whole team. There's no
  per-person name recorded anywhere (the buzzer and score history only ever
  know "Team Atlas buzzed", not who on the team pressed it) - a deliberate
  simplification, not a missing feature.
- **Realtime Database is the single source of truth for live session
  state** (`liveGames/{gameId}`): current question, buzzer window/claims,
  music/karaoke playback, problem-case timers. Every client (Admin, Team,
  Spectator) subscribes directly to this and reacts automatically - there is
  no "tell the other clients" step, which is what makes refresh/reconnect
  recovery work for free: a client that reconnects just re-subscribes and
  gets the current state.
- **The question timer visibly freezes the instant a team buzzes.** Rather
  than a separate RTDB write, every client derives this for free from data
  it already has: `endsAt - claim.at` (both server timestamps) is a fixed
  number the moment a claim exists, so the displayed countdown stops ticking
  for everyone at once without any extra round trip. See
  `freezeRemainingMsForClaim` in `src/hooks/useCountdown.ts`.
- **Firestore holds durable, structured records**: accounts, teams,
  question bank, categories, music library, game metadata, score events
  (append-only), and the audit log.
- **Timers are server-time-based, not countdown timers.** Admin computes an
  `endsAt` timestamp (using the Realtime Database's `serverTimeOffset` to
  correct for each device's clock skew) and writes that one number. Every
  client just computes `endsAt - serverNow()` on an interval - they can't
  drift apart because they're all deriving from the same stored number, not
  independently ticking down.
- **The buzzer is a Realtime Database transaction, not a client race.**
  `src/services/buzzerService.ts` runs a transaction against a single
  `buzzer/{questionId}/claim` node. Firebase resolves concurrent attempts on
  the server (retrying losers against the latest value), so "who was first"
  is never decided by comparing `Date.now()` between two different phones.
  `database.rules.json` independently re-enforces the same invariants
  (buzzer must be open; this team hasn't already had a turn this question)
  server-side, so a modified client still can't force a win.
- **No Cloud Functions.** The brief's tech stack list is Auth + Realtime
  Database + Firestore + Storage, and Cloud Functions need a paid (Blaze)
  plan and a separate deploy step, so this intentionally stays client-SDK +
  Security Rules only:
  - Role checks (`isAdmin()`) are enforced in `firestore.rules` and
    `database.rules.json`, reading each user's role from Firestore/a small
    RTDB `rolesIndex` mirror - not Firebase Auth custom claims, which can
    only be set server-side.
  - Creating a team or spectator login from the Admin UI uses a disposable
    secondary Firebase App instance purely to call
    `createUserWithEmailAndPassword` without hijacking the Admin's own
    signed-in session (the normal client SDK would otherwise switch the
    current session to the newly created user).
  - "Deleting" a team or spectator (Admin → Teams/Spectators → Delete) removes
    the `usernames/{name}` lookup doc immediately, which blocks that login's
    next sign-in attempt outright, and cleans up the rest of its Firestore/RTDB
    footprint. It does **not** delete the underlying Firebase Auth record -
    the client SDK cannot delete another user's account. A real purge would
    need a small Admin SDK script in the same style as
    `scripts/createAdmin.mjs` (using `admin.auth().deleteUser(uid)`); not
    built out here since it's an off-event housekeeping task, not something
    needed during a live game.
- **Music/karaoke audio plays on exactly one device: the Spectator screen**
  (the one assumed to be connected to the room's speakers/projector). Admin
  and every team's phone only ever show a synced visual indicator (▶/⏸,
  timer, "now answering" state) - if every team's phone played the YouTube
  audio locally, the room would turn into an out-of-sync echo chamber. If
  your setup instead has the Admin's laptop wired to the speakers, just open
  the Spectator view in a second tab on that machine.

## Known limitations

- **Automated verification covers the engine, not the UI.**
  `scripts/stressTest.mjs` runs against the Firebase Local Emulator Suite and
  checks the things that would be expensive to get wrong live: a 20-team
  simultaneous buzz resolving to exactly one winner, lockout after a wrong
  answer, buzzing refused while paused / after the timer expires / with a
  forged timestamp / on another team's behalf, the music answer being
  unreadable by teams, teams being unable to write privileged state, and team
  scores reconciling against the score-event log. Run it with the emulators
  up: `node scripts/stressTest.mjs`. There is **no automated browser test** of
  the actual screens, so a visual pass on a phone and a projector before a
  real event is still worth doing.
- YouTube is the only music provider wired up (`src/services/musicService.ts`,
  `src/components/MusicPlayer.tsx` are the two places a Spotify/other
  provider would need to plug in instead). Embedding requires the YouTube
  IFrame API to load client-side, which needs normal internet access in the
  room.
- Deleting a game from the Admin dashboard is only offered for games that
  are still `DRAFT` (never started), so a played game's history can't be
  wiped out by accident; there's no bulk-purge of Firebase Auth accounts
  from the UI (see the Cloud Functions note above).
- **Team passwords cannot be recovered or reset from the app.** Firebase
  never returns a password, and the client SDK can't reset another user's.
  The Teams tab therefore shows every login it creates in a "copy all" panel
  at the moment of creation - that is the only chance to record them. Losing
  one means deleting and recreating that team (which loses its score), or
  writing an Admin-SDK reset script.
- `usernames/{name}` is readable without signing in, because the login form
  has to resolve a username to its account before authenticating. That lets
  someone confirm a username exists; it exposes no secret, and the generated
  passwords are what keep it from being useful. Replacing it with a callable
  function would close it completely.
- The JS bundle is ~300KB gzipped, almost entirely the Firebase SDK. Admin
  and Spectator screens are code-split out so team phones don't download
  them, but the SDK itself is the floor without a larger refactor.
