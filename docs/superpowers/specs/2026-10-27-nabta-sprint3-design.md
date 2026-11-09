# Nabta — Sprint 3 Design: Guidance, Follow-Up and Release

- **Date:** 2026-10-27
- **Scope:** Charter §16.3, user stories US17–US24, and the release work in §20.3
- **Milestone (§20.3):** a deployed prototype connects pest observations, review, guidance and follow-up.
- **Status:** Built, except hosting (§8), which needs the team's decision. As in Sprint 2, the charter is the requirements. Decisions marked **(Claude's call)** were made while building and can be changed. §11 lists what changed while building.

## 1. Guidance (US17, FR16, NFR14, R05)

- Each pest page gains **"What you can do"**: 4–6 practical steps taken from the UC IPM management sections (USDA APHIS for fruit flies). Each step is labelled by kind: *check*, *prevent*, *remove* or *protect natural enemies*. The steps are stored with the pest content in `backend/content/pests/catalog.json`, under the same sources and review status.
- **No chemical advice.** The charter puts pesticide prescriptions and doses out of scope (§5.2), and R05 asks for reviewed, attributed content. So the steps cover only monitoring, prevention, removal and natural enemies. Every guide ends with **"Before using any pesticide, ask a plant specialist"** and a link to the review route. (Claude's call.)
- A result links to its guidance ("What you can do about aphids"). An identified result or a specialist's assessment is where a grower most needs it.
- **"Add as a task"** on a step creates a follow-up task linked to the plant (and to the observation when there is one). This joins guidance and follow-up (§9).

## 2. Tasks and reminders (US18, FR17)

- A **task** belongs to a plant and can point to the observation or guidance step it came from. It has a title, optional notes, an optional due date, and done or not done.
- **Reminders are in-app.** On or after its due date, an open task puts a reminder in the notification bell ("Due today: check the new shoots for aphids, on Lemon tree"), once per task. Because "today" is the grower's own day, not the server's, the browser sends its local date with the inbox request. The server accepts dates within a day of its own clock.
- **Screens:**
  - A **Tasks** page groups tasks into overdue, today, upcoming, no date and done.
  - Each plant page lists its own tasks, with a quick way to add one.
  - Ticking a task done, or undoing it, is immediate.

## 3. Personal notes (US19, FR18)

Dated notes on a plant: add, edit and delete. Notes are shown newest first in the plant's **Notes** tab. They're separate from observation notes, which describe one photo.

## 4. Photo comparison (US20, FR19)

`/plants/:id/compare` shows two of the plant's photos side by side at the same size, each with its date, plus how far apart they were taken ("12 days apart"). This is the sprint's one memorable moment: the plant's observations sit on a **date ribbon**, a horizontal timeline with one dot per photo spaced by real time. The grower picks the two photos to compare from it, so the gaps between sightings are visible at a glance. By default the oldest and newest photos are compared.

## 5. Search and summaries (US21, FR20)

- **Dashboard: "Needs attention".** Counts that link to the matching records:
  - tasks overdue or due today
  - reviews waiting for the grower's reply
  - unclear results not yet sent for review
- **Search** (`/search`, and a search box in the grower's header) finds plants, observations (by notes, plant or pest), tasks and notes. Filters narrow it by kind, by result (identified pest, unclear, under review) and by task state (open or done). It all runs on the server; the database is SQLite, so search is a case-insensitive substring match.

## 6. Data and consent (US22, FR22, NFR06)

- **Selected deletions:**
  - **One observation** (new): removes its photo, Nabta's result and its review.
  - **One note or task.**
  - **A plant:** as before.
  - **The whole account:** in Account settings. The grower confirms by typing their password, and all their plants, photos, notes, tasks and reviews are removed. Every deletion asks for confirmation and says exactly what goes.
- **Research consent:** a separate switch in Account settings: "Let the Nabta team use my photos to test the model". It's off by default, records when it was changed, and can be changed at any time. Nothing else depends on it.

## 7. Arabic and English (US23, FR21, NFR04)

- **A language switch** in the header, on the landing page and on the sign-in screens. It changes the language and the text direction (RTL for Arabic) without reloading or leaving the page, so the current context is kept. The choice is remembered in the browser.
- **Every interface string** has an Arabic version (`ar.json`, with Arabic plural forms). Dates use Arabic month names on the Gregorian calendar. Readex Pro, the existing typeface, includes Arabic.
- **Pest content** (descriptions, guidance and photo captions) has Arabic versions in the catalog. The API returns the language the browser asks for. The Arabic content and interface text were translated by Claude and are marked **awaiting review by a native-speaking team member**, alongside the existing specialist review (NFR14).
- **AI features** write in the user's language.

## 8. Devices and release (US24, NFR02, NFR07)

- **Agreed browser test set** (Claude's call): Chromium (Chrome, Edge), Firefox and WebKit (Safari), each at phone width (390 px) and desktop (1366 px). A Playwright end-to-end suite runs the core workflows in all of them.
- **Release:**
  - **Build:** the frontend's production build is served by the FastAPI app, so one service runs everything.
  - **Packaging:** a `Dockerfile` and deploy notes cover HTTPS, environment secrets and the model file.
  - **Host:** where it is hosted is the team's decision. It needs their account and the SAR 200 hosting budget (§7).

## 9. Data model additions

`tasks`, `notes`, and on users `research_consent` and `research_consent_at`. Notifications gain an optional `task_id`, and `case_id` becomes optional. One migration.

## 10. Design

The Sprint 1–2 look stays: same palette, type and components. New lists stay rows in a card, not a card per item. The plant page gains tabs (**Observations, Tasks, Notes**), with the tab in the URL so it survives a refresh and a language switch. The date ribbon is the only new motion that runs on its own; everything else moves only in answer to the user.

## 11. As built

Calls made while building (all **Claude's call**):

- **Moving a task's due date** removes its old reminder, so the bell never points at the wrong day. Deleting a task removes its reminder too.
- **The plant page** keeps Add observation and Compare photos as buttons. Edit, Plant report and Delete moved into a **More** menu.
- **The date ribbon** reads like a ruler: a small tick per day (per week past two months), month marks, and the first and last dates at the ends. The two photos being compared carry the letters A and B. "Change: Photo A / Photo B" chooses which one a click on the ribbon replaces. Hovering or focusing a dot shows the photo.
- **Search** runs as the grower types, after a short pause. Every filter lives in the URL, and matching words are highlighted.
- **Arabic dates and numbers** use Western digits (0–9), the same as the counts in the interface text, so a page never mixes two numeral sets.
- **Pest names** in results and reviews are translated in the interface from each pest's key. The review queue's suggestion gained a `key` for this.
- **The AI features** get the Arabic pest guide and an instruction to write in Arabic when the interface is in Arabic. They now also receive each guide's "What you can do" steps. A blank `NABTA_OPENAI_API_KEY` counts as no key.
- **Deleting the account** signs the grower out and returns them to the home page.
- **The pest pages** show a note while the Arabic translation awaits review.
- **The demo data** (`seed-demo`) adds tasks in every state, two of them from the pest guides, plus a few dated notes.

Release work:

- **Production serving:** `app/frontend.py` serves `frontend/dist` and falls back to `index.html` for the app's own routes. Unknown `/api/*` paths stay JSON 404s.
- **Docker:** the `Dockerfile` builds the frontend, then runs the API on port 8000 with data on a `/data` volume. The image itself was not built here, because Docker isn't installed on the development machine; the same production setup was checked by running the API with the built frontend. Hosting steps are in `docs/DEPLOY.md`.
- **Browser tests:** `npm run e2e` runs 10 core workflows. They cover:
  - recording a sighting
  - turning guidance into a task, with its reminder
  - notes, compare and search
  - consent and deleting the account
  - phone navigation
  - Arabic
  - the specialist queue

  The run covers six configurations, each of the three browsers at 390 px and at 1366 px. On 2026-10-27 all 57 runs passed; 3 were skipped because the phone-menu test only runs at phone width.

## 12. After the charter check (2026-10-28)

A requirement-by-requirement check against the charter is in [CHARTER_ALIGNMENT.md](../../CHARTER_ALIGNMENT.md). It led to these additions:

- **Research consent now has a use.** `export-research-photos` copies photos only from growers whose consent is on, with the specialist's identification and no personal details. `evaluate-collected` reports the model on those photos apart from the benchmark (charter §8 practical evaluation, §22.2). The live analysis and the evaluation share one "unclear" rule (`services/analysis.decide`).
- **Content sign-off:** `review-content` records a specialist's review of pest pages, or a native speaker's review of the Arabic, with the name and date (NFR14).
- **Password-reset email in Arabic**, when requested from the Arabic screens (§8 language coverage).
- **Accessibility checks** (NFR03): axe-core scans 20 core screens in both languages at both widths, and a keyboard test checks every early tab stop shows a focus outline or ring. Three list links that showed focus only as a faint tint now get a ring.
- **Review workflow in the browser** (§8): request, question, reply and an inconclusive assessment, with notifications, by a grower and a specialist in separate sessions.

The team kept open specialist sign-up (FR03, US08, NFR06); the consequence is recorded in CHARTER_ALIGNMENT.md.
