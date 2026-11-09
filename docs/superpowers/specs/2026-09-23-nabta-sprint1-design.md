# Nabta — Sprint 1 Design: Application Foundation

- **Date:** 2026-09-23
- **Scope:** Charter §16.1, user stories US01–US08
- **Milestone (charter §20.1):** growers can register plants and save observations in a working application.
- **Status:** Building. Section 1 (structure and accounts) was reviewed and approved. Sections 2–3 (data/API, frontend) were not reviewed separately — the team asked to proceed — so they record the defaults chosen. Correct anything here and the code follows.

## 1. Decisions and deviations from the charter

The team chose a different stack from charter §18:

| Concern | Charter §18 | Sprint 1 build |
| --- | --- | --- |
| Frontend | Next.js + TypeScript | React 19 + Vite 8, **JavaScript (JSX)** |
| Styling | — | Tailwind CSS 4, Headless UI (dialogs, menus), lucide-react icons |
| Backend | Next.js API + FastAPI analysis service | One **FastAPI** backend (Python 3.13). The Sprint 2 classifier plugs into it. |
| Auth | Firebase Authentication | Own: Argon2 password hashes + server-side sessions |
| Photos | Firebase Storage | Local disk (`backend/storage/photos/`), served only through an authorised endpoint |
| Database | MongoDB | **SQLite** via SQLAlchemy 2 + Alembic migrations |

**Team decision, 2026-09-24: both roles sign up themselves.** The sign-up and sign-in screens have a Grower / Plant specialist picker. Each role is a separate account (one email, one role). Sign-in refuses an account whose role doesn't match the picker. This replaces "specialists are created only by the team". US08's "authorised specialists" is now satisfied by role checks rather than by vetting; revisit this before specialists can see real growers' cases in Sprint 2. The CLI can still create specialists.

**Not in this build:** the dataset/classifier track (charter §20.1 bullet 4 — separate ML work); everything in Sprints 2–3 (identification, review requests, guidance, tasks, notes, photo comparison, search, Arabic UI, data-deletion and consent controls, deployment); email verification; login rate limiting; an admin UI.

## 2. Repository layout

```
Nabta/
├─ backend/
│  ├─ app/
│  │  ├─ main.py            app factory, routers, error handlers, security middleware
│  │  ├─ config.py          settings from NABTA_* environment variables / backend/.env
│  │  ├─ db.py              engine, session factory, Base, SQLite pragmas
│  │  ├─ models/            SQLAlchemy models (user, session, reset token, plant, observation)
│  │  ├─ schemas/           Pydantic request/response models
│  │  ├─ routers/           auth, account, plants, observations, specialist, health
│  │  ├─ services/          security (hashing, tokens, sessions), email, photos
│  │  ├─ deps.py            current-user and role dependencies
│  │  ├─ errors.py          ApiError + uniform error responses
│  │  └─ cli.py             create-specialist, seed-demo
│  ├─ alembic/              migrations (render_as_batch for SQLite)
│  ├─ tests/                pytest
│  ├─ storage/              nabta.db + photos/ (git-ignored)
│  └─ requirements.txt
├─ frontend/
│  ├─ public/               favicon, logo files
│  └─ src/
│     ├─ api/               axios client + one module per resource
│     ├─ auth/              auth context, route guards
│     ├─ components/        ui/ primitives, layout/
│     ├─ features/          auth, account, dashboard, plants, observations, specialist
│     ├─ i18n/              i18next setup, locales/en.json
│     ├─ lib/               small helpers (dates, uuid, file validation)
│     └─ styles/            Tailwind entry + theme tokens
└─ docs/superpowers/specs/  this document
```

**Local development:** the Vite dev server (port 5173) proxies `/api` to FastAPI at `http://127.0.0.1:8000`. The browser sees one origin, so there is no CORS setup and the session cookie works unchanged. (Using `127.0.0.1` rather than `localhost` avoids Node resolving to IPv6 on Windows.)

## 3. Backend

### 3.1 Configuration

Settings are read from environment variables with prefix `NABTA_` (optionally from `backend/.env`) via pydantic-settings.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NABTA_DATABASE_URL` | `sqlite:///<backend>/storage/nabta.db` | Database |
| `NABTA_STORAGE_DIR` | `<backend>/storage` | Photos go in `<dir>/photos/` |
| `NABTA_FRONTEND_URL` | `http://localhost:5173` | Used to build password-reset links |
| `NABTA_SESSION_DAYS` | `7` | Session lifetime |
| `NABTA_COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `NABTA_RESET_TOKEN_MINUTES` | `60` | Reset-link lifetime |
| `NABTA_MAX_UPLOAD_MB` | `10` | Photo size limit |
| `NABTA_SMTP_HOST`, `_PORT` (587), `_USER`, `_PASSWORD`, `_FROM`, `_STARTTLS` (true) | unset | When `SMTP_HOST` is unset, emails are printed to the console |

### 3.2 Data model (SQLite)

SQLite needs `PRAGMA foreign_keys=ON` on every connection (it is off by default) and uses WAL journal mode. All timestamps are stored and returned in UTC. The API returns ISO 8601 with a `Z` suffix; dates are `YYYY-MM-DD`.

| Table | Columns |
| --- | --- |
| `users` | `id`, `email` (unique, stored trimmed + lowercase, ≤254), `full_name` (1–100), `password_hash`, `role` (`grower` \| `specialist`, CHECK constraint), `created_at`, `updated_at` |
| `sessions` | `id`, `user_id` → users (CASCADE), `token_hash` (SHA-256 hex, unique), `created_at`, `expires_at` |
| `password_reset_tokens` | `id`, `user_id` → users (CASCADE), `token_hash` (unique), `created_at`, `expires_at`, `used_at` (nullable) |
| `plants` | `id`, `owner_id` → users (CASCADE, indexed), `name` (1–80), `plant_type` (≤80, nullable), `location` (≤120, nullable), `notes` (≤1000, nullable), `created_at`, `updated_at` |
| `observations` | `id`, `plant_id` → plants (CASCADE, indexed), `observed_on` (DATE), `notes` (≤2000, nullable), `photo_filename`, `thumb_filename`, `photo_width`, `photo_height`, `client_request_id` (unique, nullable), `created_at` |

Optional text fields are trimmed; an empty string is stored as NULL. Observations reach their owner through `plant.owner_id`, so ownership has a single source of truth (NFR08).

### 3.3 Accounts and security

- **Passwords:** Argon2id via `argon2-cffi`, 8–128 characters.
- **Sessions:** a successful register or sign-in creates a random token (`secrets.token_urlsafe(32)`). It goes to the browser in cookie `nabta_session` (HttpOnly, SameSite=Lax, Path=/, Max-Age = session lifetime, Secure when configured). The database stores only its SHA-256 hash. Signing in or registering while holding a session revokes the old one. Sign-out deletes the session row, so the cookie stops working immediately. Expired sessions are rejected and deleted when seen.
- **Password reset:** the request endpoint always returns the same 202 response, whether or not the email exists. For a known email it stores a hashed single-use token (60 min) and emails `NABTA_FRONTEND_URL/reset-password?token=…`, sending in a background task so response timing doesn't reveal account existence. Confirming sets the new password, marks the token used, invalidates the user's other unused reset tokens, and deletes **all** the user's sessions.
- **Password change** (signed in): requires the current password and deletes the user's *other* sessions, keeping the current one.
- **Roles:** `/api/auth/register` takes `role` (`grower`, the default, or `specialist`). `python -m app.cli create-specialist` also creates specialists. `/api/auth/login` takes an optional `role`; after the password is verified, a different role is refused with 403 `role_mismatch`, and no session is created.
- **Cross-site protection:** SameSite=Lax cookies, plus middleware that rejects POST/PUT/PATCH/DELETE carrying `Sec-Fetch-Site: cross-site` (403 `cross_site_request`). This uses a browser-set header instead of a custom one so the interactive `/docs` page keeps working for write requests.

**Access rules, enforced on the server (NFR05, NFR06, R06):**

| Endpoint group | Anonymous | Grower | Specialist |
| --- | --- | --- | --- |
| register, login, logout, password reset, health | allowed | allowed | allowed |
| `/api/auth/me`, `/api/account/*` | 401 | allowed | allowed |
| `/api/plants/*`, `/api/observations/*` | 401 | own records only; another grower's record → **404** | 403 |
| `/api/specialist/*` | 401 | 403 | allowed |

### 3.4 API contract

All endpoints are under `/api`. Request and response bodies are JSON, except the observation upload (multipart) and photo responses (JPEG).

**Response shapes**

```jsonc
// User
{ "id": 1, "email": "sara@example.com", "full_name": "Sara Ahmed", "role": "grower", "created_at": "2026-09-23T10:15:00Z" }

// Plant (list items and single plant share this shape)
{ "id": 3, "name": "Lemon tree", "plant_type": "Lemon", "location": "Back garden", "notes": null,
  "created_at": "…Z", "updated_at": "…Z",
  "observation_count": 2, "last_observed_on": "2026-09-20",          // null when no observations
  "cover_photo_url": "/api/observations/7/photo?variant=thumb" }      // latest observation's thumbnail, or null

// Observation
{ "id": 7, "plant_id": 3, "plant_name": "Lemon tree", "observed_on": "2026-09-20",
  "notes": "Small green insects under the leaves",
  "photo_url": "/api/observations/7/photo", "thumb_url": "/api/observations/7/photo?variant=thumb",
  "photo_width": 2560, "photo_height": 1920, "created_at": "…Z" }

// Error (every non-2xx response)
{ "code": "validation_error", "message": "Some fields need attention.", "fields": { "email": "invalid_email" } }
```

`fields` appears only when an error belongs to specific inputs. Field codes form a fixed vocabulary that the frontend translates: `required`, `too_short`, `too_long`, `invalid_email`, `invalid`, `future_date`, `too_early`, plus the photo codes below. A blank required string maps to `required`, not `too_short`.

**Endpoints**

| Method & path | Body | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/health` | — | 200 `{"status":"ok"}` | — |
| `POST /api/auth/register` | `{full_name, email, password, role?}` | 201 User + session cookie | 409 `email_taken`, 422 |
| `POST /api/auth/login` | `{email, password, role?}` | 200 User + session cookie | 401 `invalid_credentials`, 403 `role_mismatch`, 422 |
| `POST /api/auth/logout` | — | 204, cookie cleared (idempotent) | — |
| `GET /api/auth/me` | — | 200 User | 401 `not_authenticated` |
| `POST /api/auth/password-reset/request` | `{email}` | 202 `{"ok": true}` always | 422 (malformed email only) |
| `POST /api/auth/password-reset/confirm` | `{token, new_password}` | 204 | 400 `invalid_reset_token`, 422 |
| `PATCH /api/account` | `{full_name?, email?}` | 200 User | 409 `email_taken`, 422 |
| `POST /api/account/password` | `{current_password, new_password}` | 204 | 400 `wrong_password`, 422 |
| `GET /api/plants` | — | 200 `[Plant]`, latest activity first (newest observation, else creation) | — |
| `POST /api/plants` | `{name, plant_type?, location?, notes?}` | 201 Plant | 422 |
| `GET /api/plants/{id}` | — | 200 Plant | 404 |
| `PATCH /api/plants/{id}` | any subset; `null` or `""` clears an optional field | 200 Plant | 404, 422 |
| `DELETE /api/plants/{id}` | — | 204; deletes its observations and their photo files | 404 |
| `GET /api/plants/{id}/observations` | — | 200 `[Observation]`, `observed_on` desc then `created_at` desc | 404 |
| `POST /api/plants/{id}/observations` | multipart: `photo` (file), `observed_on`, `notes?`, `client_request_id?` | 201 Observation; **200** with the existing observation if this user already used `client_request_id` | 404, 400/413 photo codes, 409 `duplicate_request` (id used by another user), 422 |
| `GET /api/observations/{id}` | — | 200 Observation | 404 |
| `GET /api/observations/{id}/photo?variant=full\|thumb` | — | 200 `image/jpeg`, `Cache-Control: private, max-age=3600` | 404 |
| `GET /api/specialist/cases` | — | 200 `[]` (the queue is filled by review requests in Sprint 2) | — |

Every protected endpoint can also return 401 `not_authenticated` and 403 `forbidden` according to the access table. Unknown `/api` paths return 404 `not_found`; unexpected failures return 500 `server_error`.

**Observation rules:** `observed_on` is required, not before 2000-01-01 (`too_early`), and not after tomorrow in UTC (`future_date`; this allows for the user's time zone). `client_request_id` is optional, 8–64 characters of `[A-Za-z0-9-]`. The frontend sends a UUID generated once per form, so a retried upload never creates a second observation (US06, NFR09).

### 3.5 Photos

- **Accepted:** JPEG, PNG, WebP, judged by decoding the file with Pillow rather than trusting the extension or MIME type. Otherwise 400 `unsupported_image_type`; undecodable data returns 400 `invalid_image`.
- **Limits:** above `NABTA_MAX_UPLOAD_MB` (10 MB) or above 60 megapixels returns 413 `image_too_large`. A shortest side under 256 px returns 400 `image_too_small`. Photo errors also set `fields.photo` to the same code.
- **Processing:** apply EXIF orientation, convert to RGB (transparent areas become white), and cap the long edge at 2560 px. Save as JPEG quality 90 **without metadata**, which removes the GPS location phones embed. Also save a 480 px thumbnail at quality 80. Files are named `<uuid4hex>.jpg` and `<uuid4hex>_thumb.jpg` in `storage/photos/`.
- **Consistency:** files are written before the database commit and removed again if the commit fails. Deleting a plant commits the row deletions first, then removes the files; a failed file removal is logged, not raised.
- Photos are never served from a public folder, only through `/api/observations/{id}/photo` after the ownership check.

### 3.6 Command line

- `python -m app.cli create-specialist --email E --name N [--password P]` prompts for the password twice when `--password` is omitted. It refuses an email that already exists.
- `python -m app.cli seed-demo` idempotently creates demo accounts `grower@example.com` and `specialist@example.com` (password `NabtaDemo2026`), and three plants for the grower.

### 3.7 Backend tests (pytest)

Each test gets its own temporary database file and photo folder. Coverage:

- **Registration:** success sets a cookie; duplicate email; validation codes.
- **Sign-in, `me` and sign-out:** a logged-out cookie no longer works; an expired session is rejected.
- **Password reset:** unknown and known emails get the same response; the link works exactly once; an expired token fails; reset revokes all sessions.
- **Account:** update details; email conflict; wrong current password; a password change revokes other sessions.
- **Plants:** CRUD; list ordering and summary fields; deleting a plant removes observations and files.
- **Observations:** JPEG and PNG upload; non-image, oversized, undersized and future-date rejections; EXIF data is stripped and orientation applied; a retry with the same `client_request_id` returns the same observation; photo variants.
- **Access-control matrix:** anonymous, grower, other grower and specialist against every protected endpoint.
- **Cross-site write rejection.**
- **Migrations:** `alembic upgrade head` succeeds on an empty database, and the resulting schema matches the models.

## 4. Frontend

### 4.1 Libraries

React 19, Vite 8, React Router 8, TanStack Query 5 (server state and caching), react-hook-form (forms), axios (API calls and upload progress), i18next + react-i18next, Tailwind CSS 4 (`@tailwindcss/vite`), Headless UI 2 (Dialog, Menu), lucide-react (icons), sonner (toasts), `@fontsource-variable/readex-pro`. Tests use Vitest, React Testing Library and jsdom.

### 4.2 Routes and screens

| Path | Access | Screen |
| --- | --- | --- |
| `/` | any | Public home page for signed-out visitors. A grower is redirected to `/dashboard`, a specialist to `/specialist`. |
| `/sign-in`, `/register` | signed-out only | Auth forms with a Grower / Plant specialist picker. The choice is kept in `?as=` so links can preselect it. After success, return to the requested page or the role home. |
| `/forgot-password`, `/reset-password?token=` | any | Request a link, then set a new password; success leads to sign-in with a confirmation |
| `/dashboard` | grower | **US07.** Plant cards: latest photo or a placeholder, name, type · location, observation count, last observed date. Actions: *New observation*, *Add plant*. Empty state for first use. |
| `/plants/new`, `/plants/:plantId/edit` | grower | **US05.** Plant form: name, plant type, location, notes |
| `/plants/:plantId` | grower | **US05, US06.** Plant details, *Add observation*, *Edit*, *Delete* (confirmation dialog naming the plant and its observation count), observation history grid |
| `/observations/new?plantId=` | grower | **US06, FR06.** Plant picker, photo picker (drag-and-drop or browse; phones offer camera or gallery), preview, date (defaults to today, no future dates), notes, "Tips for a clear photo" panel, upload progress bar. On failure: the error plus *Try again*, keeping every input and the same request id. If the grower has no plants: a prompt to add one first. |
| `/observations/:observationId` | grower | Photo, plant link, observed date, saved time, notes |
| `/account` | any signed-in | **US04.** "Your details" (name, email) and "Change password" |
| `/specialist` | specialist | **US08.** Review-queue workspace, with an empty state until Sprint 2 |
| other | — | 404 page; a role mismatch shows a 403 page inside the layout |

**Header:** logo lockup (leaf mark + "Nabta"), role navigation (grower: Dashboard, New observation; specialist: Review queue) and an account menu (Account, Sign out). Below 768 px the navigation collapses behind a menu button.

### 4.3 State and API access

- `api/client.js`: an axios instance with `baseURL: "/api"`. It normalises every failure to `ApiError {status, code, message, fields}`, adding `network_error` (no response) and `server_error` (5xx).
- **Auth state:** a TanStack Query `["auth","me"]` query, where 401 means signed out. Sign-in and register write the user into the cache. Sign-out calls logout, then clears the whole query cache so no private data lingers (US02). A 401 on any other request marks the session ended; the guards then redirect to sign-in with a "session ended" notice.
- **Forms:** client-side rules mirror the server's (required fields, lengths, email shape, password ≥ 8, confirmation matches) for instant feedback. Server `fields` errors are mapped onto inputs with `setError`.
- **Photo checks before upload:** type must be JPEG, PNG or WebP, and size ≤ 10 MB. Only the server can check dimensions.
- **Request ids:** generated with `crypto.randomUUID`, falling back to a `crypto.getRandomValues` UUID on insecure origins (a phone testing over LAN via `http://192.168.…`).

### 4.4 Visual design (light theme from the logo)

The palette is derived from the logo's two greens. Brand colours are forest `#1C3F28` (the leaf and wordmark) and sage `#83996A` (the second leaf).

| Token | Value | Use |
| --- | --- | --- |
| `forest-50…950` | `#F3F7F5` `#E2EBE5` `#C5D7CB` `#9FBCA8` `#759F82` `#3A714C` `#2C5A3B` **`#1C3F28`** `#163220` `#102517` `#0B1910` | 700 = primary buttons, headings, active nav; 600 = hover; 500 = focus ring; 50–100 = tinted surfaces |
| `sage-50…900` | `#F5F7F3` `#E6EBE1` `#D0D8C6` `#B5C2A6` `#9CAD88` **`#83996A`** `#697A55` `#515F42` `#3B4530` `#2A3122` | 500 = decorative accents only (3.1:1 on white); 600+ when used for text |
| `paper` | `#F7F8F3` | page background |
| `ink` / `muted` | `#17261C` / `#56655A` | body / secondary text (14.8:1 and 5.8:1 on paper) |
| `line` / `line-strong` | `#DDE3D5` / `#839385` | card dividers / form-control borders (`line-strong` is 3.2:1 on white and 3.0:1 on paper, meeting WCAG 1.4.11) |
| danger | `#B42318` on `#FEF3F2` | errors, delete |

- **Type:** Readex Pro (variable, self-hosted). It is a rounded geometric sans close to the wordmark, and it covers Arabic, so Sprint 3 needs no font change.
- **Shapes:** white cards with a `line` border and a soft shadow, `rounded-2xl`; controls `rounded-lg`; generous spacing; content max width ≈ 72rem.
- **Home and auth pages (redesign, 2026-09-24):** the hero is an animated rendition of the logo. A forest leaf and a sage leaf unfurl, the veins draw in, an insect walks up the midrib, a pollen-yellow (`#C99A2E`) magnifier glides over it, and a pinned specimen label shows the observation record. It plays once per visit, and faster on the auth pages. Everything else is quiet: a graph-paper ground on a pale leaf-green (`#E6EDDF`) surface, pages easing in, and cards appearing one after another. `prefers-reduced-motion` turns all of it off.

### 4.5 Language readiness (for US23 in Sprint 3)

Every visible string comes from `i18n/locales/en.json` through `t()`; this includes API error codes, as `errors.<code>`. Only English ships in Sprint 1. `<html lang dir>` follows the active language. Layout uses logical utilities (`ms-/me-/ps-/pe-/start-/end-/text-start`), and direction-implying icons flip with `rtl:`. Dates are formatted with `Intl.DateTimeFormat` in the active language. Adding Arabic later means adding `ar.json` and a language switch.

### 4.6 Accessibility (NFR03)

- A visible label on every control.
- Errors linked with `aria-describedby` and `aria-invalid`.
- A visible `focus-visible` ring on everything interactive.
- A skip-to-content link, and landmarks (`header`, `nav`, `main`).
- Headless UI dialogs and menus for focus trapping and keyboard support.
- Upload progress exposed as `role="progressbar"` with a value.
- Photos carry alt text naming the plant and date.
- Touch targets ≥ 40 px.

### 4.7 Frontend tests (Vitest + Testing Library)

- Registration and sign-in form validation, and display of server errors.
- Route guards: signed-out redirect; grower on specialist route → 403 view; specialist on grower route → 403 view.
- Photo file validation.
- The new-observation retry flow reuses the same request id and keeps the inputs.
- Dashboard cards and empty state.
- Plant deletion requires confirmation.

## 5. Story → evidence

| Story | Acceptance criteria (charter) | Evidence |
| --- | --- | --- |
| US01 Create an account | Valid details create an account; invalid entries receive feedback | register tests (API + form); manual run |
| US02 Sign in and out | Valid credentials open the workspace; sign-out ends protected access | login/logout/session tests; cache cleared on sign-out |
| US03 Reset my password | A reset link allows the account owner to set a new password | reset tests (single use, expiry, session revocation); console/SMTP email |
| US04 Update account details | Valid changes persist; invalid entries receive feedback | account tests; account page |
| US05 Manage plant profiles | Owners can create, view, edit, and confirm deletion | plant CRUD + ownership tests; confirm dialog test |
| US06 Save a pest observation | Valid photos and notes retain the plant and date; failed uploads can be retried | upload/validation/idempotency tests; retry flow test |
| US07 View my dashboard | Shows owned plants and links to their profiles | plant list tests; dashboard test |
| US08 Access specialist tools | Authorised specialists gain access; grower accounts are denied | access matrix; guard tests; role sign-up and `role_mismatch` tests (see the 2026-09-24 decision in §1) |

## 6. Later sprints, prepared for but not built

- **Sprint 2:** analysis results get their own table linked to `observations`, with model version (NFR13). Review cases feed `/api/specialist/cases`.
- **Sprint 3:** add `ar.json` and a language switch. FastAPI serves the built frontend for deployment behind HTTPS (`NABTA_COOKIE_SECURE=true`). Add rate limiting on sign-in and reset.
