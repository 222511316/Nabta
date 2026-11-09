# Nabta: how the prototype meets the charter

This record checks the prototype against every requirement in [the project charter](../Nabta_Project_Charter.md), as of 28 October 2026, updated on 8 November 2026 for the fixes to the supervisor's review of the Sprint 3 release (see [Supervisor review fixes](#supervisor-review-fixes-8-november-2026)). Each row says where the requirement is met and how it is checked. Rows that still need the team, and changes the team decided on, are explained after the tables.

**Statuses**

- **Met:** built and checked by automated tests.
- **Met, changed:** built, but in a different way from the charter, by a team decision (see [Changes the team decided](#changes-the-team-decided)).
- **Needs the team:** the software is ready; what's left is work only the team can do (see [What the team still has to do](#what-the-team-still-has-to-do)).

**Where the tests are**

- Backend tests: `backend/tests/`, run with `pytest` (555 tests; the 2 in `test_real_ai.py` call the paid OpenAI API and are left out of the default run).
- Screen tests: `frontend/src/**/*.test.js(x)`, run with `npm test` (184 tests).
- Browser tests (the real app, `frontend/e2e/`, run with `npm run e2e`): 55 tests, each in Chromium, Firefox and WebKit at phone width (390 px) and laptop width (1366 px), so 330 runs. The suite was missing from the Sprint 3 folder and was rewritten (supervisor review OBS-09).
- Model reports: `ml/reports/`.

## Summary

- All 22 functional requirements and all 24 user stories are built and tested.
- One requirement is met in a different way, by team decision: the technology stack (§18, §21).
- Specialist access now follows the charter: only specialists the team has approved see review cases (FR03, FR12, US08, NFR05, NFR06). Until 8 November 2026 anyone could sign up as a specialist and open unclaimed cases.
- The AI features (OpenAI) are outside the charter and are **switched off in the assessed release**.
- What remains is team work, not code:
  - hosting
  - a specialist's review of the pest content
  - a native speaker's review of the Arabic
  - collecting growers' photos for the practical evaluation
  - the usability study
  - version control

## Functional requirements (§10)

| ID | Requirement | Status | Where it's built and checked |
| --- | --- | --- | --- |
| FR01 | Register, sign in, sign out, reset password | Met | `test_register.py`, `test_sessions.py`, `test_password_reset.py`, `auth.test.jsx` |
| FR02 | View and update account details | Met | `test_account.py`, `account.test.jsx` |
| FR03 | Role-based workspaces for growers and authorised specialists | Met | Separate workspaces, enforced on the server. A specialist who signs up is pending until the team runs `approve-specialist`; pending specialists get `403 specialist_pending` on every specialist endpoint (`test_access_control.py`, `test_specialist_approval.py`, `approval.test.jsx`, browser test `specialist-approval.spec.js`) |
| FR04 | Create, view, edit, delete plant profiles | Met | `test_plants.py`, `plants.test.jsx` |
| FR05 | Upload insect photos as dated observations on a plant | Met | `test_observations.py`, `observations.test.jsx`, browser test "records a sighting" |
| FR06 | Photo-taking instructions; file type and size checks | Met | "Tips for a clear photo" on the upload screen; JPEG, PNG or WebP up to 10 MB (`test_observations.py`) |
| FR07 | Analyse photos with the trained classifier and save the result | Met | `test_analysis.py`, `test_real_model.py` |
| FR08 | Suggested category with confidence, or an unclear outcome | Met | `analysis.test.jsx`; the rule is in `ml/reports/evaluation.md` |
| FR09 | Reviewed descriptions and reference images | Met (review sign-off: needs the team) | 8 pest pages, each with 3 or 4 credited reference photos (`test_pests.py`, `pests.test.jsx`). Every page says "Awaiting specialist review" until signed off |
| FR10 | Plant history keeps observations, results and specialist feedback | Met | Plant page and observation page; `plants.test.jsx`, `reviews.test.jsx` |
| FR11 | Flag a result and request review with notes | Met | `test_reviews.py`, `reviews.test.jsx`, browser test "a review runs from request to assessment" |
| FR12 | Authorised specialists open permitted cases from a queue | Met | Only approved specialists see the queue. Unclaimed cases are visible to every approved specialist; once taken, only to that one (`test_reviews.py`, `test_access_control.py`, browser test `specialist-journey.spec.js`) |
| FR13 | Specialists ask for clarification; growers reply in the case | Met | `test_reviews.py`, browser review test |
| FR14 | Dated feedback and guidance, including "inconclusive" | Met | `test_reviews.py`; the browser review test sends an inconclusive answer |
| FR15 | Review status shown; growers notified of questions and answers | Met | `test_reviews.py`, `reviews.test.jsx`, browser review test |
| FR16 | Reviewed pest-management information with sources | Met (review sign-off: needs the team) | "What you can do" on each pest page, from UC IPM and USDA APHIS, with sources (`guidance.test.jsx`) |
| FR17 | Plant tasks that can be completed, with in-app reminders | Met | A task's due date schedules its reminder in the bell (`test_followup.py`, `tasks.test.jsx`, browser test) |
| FR18 | Add, edit and retrieve dated notes | Met | `test_followup.py`, `notes.test.jsx`, browser test |
| FR19 | Compare two photos of the same plant | Met | Compare page with the date ribbon (`compare.test.jsx`, browser test) |
| FR20 | Dashboard summaries; search and filters for plants, observations, pending tasks | Met | "Needs attention" and Search (`test_search.py`, `search.test.jsx`, `attention.test.jsx`, browser test) |
| FR21 | Switch between Arabic and English | Met (Arabic review: needs the team) | `language.test.jsx`, `locales.test.js`, browser Arabic test |
| FR22 | Delete selected records; manage research consent separately | Met | Delete a note, task, observation, plant or the whole account; separate consent switch (`test_data_controls.py`, `dataControls.test.jsx`, browser test) |

## User stories (§16)

Every story is built, and its acceptance criteria are checked by the tests listed for its requirement above.

| Sprint | Stories | Status |
| --- | --- | --- |
| 1, application foundation | US01–US07 | Met |
| 1 | US08 (authorised specialists) | Met: specialists are approved by the team (`approve-specialist`) |
| 2, identification and review | US09, US10, US12–US16 | Met |
| 2 | US11 (reviewed examples) | Met; specialist sign-off needs the team |
| 3, guidance, follow-up and release | US17 (reviewed guidance) | Met; specialist sign-off needs the team |
| 3 | US18–US22 | Met |
| 3 | US23 (Arabic or English) | Met; native-speaker review needs the team |
| 3 | US24 (mobile and desktop) | Met in the browser test set; the hosted deployment needs the team |

## Non-functional requirements (§11)

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| NFR01 | Usability | Met in design; the study needs the team | The same header, labels and feedback on every screen. "Verified through representative user tasks" is the usability study (§8) |
| NFR02 | Compatibility | Met | Every core workflow passes in Chromium, Firefox and WebKit, at 390 px and 1366 px, with no sideways scrolling |
| NFR03 | Accessibility | Met | `e2e/accessibility.spec.js`: axe-core finds no WCAG 2.1 A/AA problems on 19 core screens, in English and Arabic, at both widths, in all three browsers. The keyboard reaches the controls on six key screens and each stop shows a focus outline or ring; the plant page tabs show the app-wide ring (5.4:1 or more against their backgrounds) and follow the reading direction with the arrow keys in Arabic (supervisor review DEF-03) |
| NFR04 | Language consistency | Met (review needs the team) | A test fails if any string is missing from either language. Arabic covers screens, errors, pest content, AI answers and the password-reset email, right to left |
| NFR05 | Authorisation on the server | Met | `test_access_control.py` tries every protected endpoint with the wrong role, another grower, a pending specialist and no session; every `/api/specialist` route the app publishes is checked to refuse a pending specialist |
| NFR06 | Privacy | Met | A grower's records are only ever served to their owner, and their review cases only to approved specialists (`test_access_control.py`, `test_specialist_approval.py`) |
| NFR07 | HTTPS; credentials kept off the client | Credentials met; HTTPS needs hosting | The assessed release has no OpenAI key at all. The deployed image marks cookies Secure and needs an HTTPS host (`docs/DEPLOY.md`) |
| NFR08 | Data integrity | Met | Database foreign keys with cascading deletes; photo files removed with their records (`test_data_controls.py`). Upgrading, downgrading and upgrading again a database full of records keeps every row and link (`test_migrations.py`); `backup-db` and `restore-db` protect real data (supervisor review DEF-02) |
| NFR09 | Error recovery | Met | Failed uploads and analyses can be retried; a request id stops duplicate observations and a result is saved once (`test_observations.py`, `test_analysis.py`) |
| NFR10 | Responsiveness | Met | Upload progress and analysis status, without blocking navigation (`observations.test.jsx`, `analysis.test.jsx`) |
| NFR11 | Reliability | Met | Records live in SQLite and photos on disk, so they survive refresh, sign-out and restart |
| NFR12 | Separation and version control | Separation met; version control needs the team | Interface (`frontend/`), application logic (`backend/app`) and model (`backend/app/analysis`, `ml/`) are separate. This folder is not a git repository |
| NFR13 | Traceability | Met | Each analysis stores its model version; each specialist message and assessment stores its author and date |
| NFR14 | Content quality | Met | Every pest page records its sources and review status; `python -m app.cli review-content` records the reviewer and date |
| NFR15 | Reproducibility | Met | Pinned dataset revision, category mapping, duplicate list and seed (`ml/README.md`, `ml/reports/`) |

## Success measures (§8)

| Measure | Status | Result |
| --- | --- | --- |
| Feature completion | Met | All High-priority stories built and tested (the technology stack changed by team decision) |
| Identification performance | Met | Test macro F1 0.828, against 0.625 for the published IP102 ResNet-50 and 0.796 for the in-house ResNet-50, on the same held-out split. Per-category precision and recall and the confusion matrix are in `ml/reports/evaluation.md` |
| Uncertainty handling | Met | At the chosen threshold, 73.3% of supported insects are accepted, and 86.9% of a held-out group of unsupported insects are rejected |
| Practical evaluation | Tools ready; photos needed | `export-research-photos` and `evaluate-collected` produce a separate report with sample counts and collection conditions. Growers' photos still have to be collected |
| Usability (≥ 80% of growers complete core tasks) | Needs the team | The study with growers is still to be run |
| Review workflow | Met | Browser test: request, question, reply and assessment, with notifications, in every browser and size |
| Access control | Met | `test_access_control.py` |
| Language coverage | Met (review needs the team) | All screens and essential messages in both languages |

## Scope (§5) and constraints (§7)

- **In scope (§5.1):** every item is built. The independently collected photo set is "subject to access", and its tools are ready.
- **Out of scope (§5.2):** respected.
  - Guidance covers only checking, prevention, removal and natural enemies, and every guide sends pesticide questions to a specialist.
  - The AI features are told never to name pesticides, products or doses. They are outside the charter and are switched off in the assessed release (no OpenAI key; checked by `test_ai_off.py`, `aiOff.test.jsx` and `e2e/ai-off.spec.js`).
  - Nabta asks for a photo of the insect itself, not of plant damage.
- **Data usage (§7):**
  - Reference photos carry their IP102 credit.
  - Research use of growers' photos requires their recorded consent. `export-research-photos` only copies photos from growers whose consent is on, without names, emails, plants or notes, and refuses to write inside the repository.
- **Budget (§7):** hosting will use the SAR 200 hosting allowance once the team picks a host.

## Changes the team decided

1. **Technology stack (§18, §21).** The team chose:

   | Charter | Built with |
   | --- | --- |
   | Next.js and TypeScript | React and Vite, in JavaScript |
   | Separate Python analysis service | FastAPI backend that runs the model in-process (onnxruntime) |
   | Firebase Authentication | Sign-in and sessions in the backend |
   | Firebase Storage | Photos on the server's disk |
   | MongoDB | SQLite |

   The model is still trained with PyTorch and torchvision (`ml/`). The interface, application logic and model are still separate parts (NFR12).

2. **Specialist approval (FR03, FR12, US08, NFR06).** Superseded on 8 November 2026. From 24 September to 8 November 2026 the team let anyone sign up as a specialist, so any specialist account could see unclaimed cases. After the supervisor's review (OBS-14) a specialist who signs up is pending until the team approves them with `python -m app.cli approve-specialist`. Checking professional qualifications stays out of scope: the team approves people it knows. There is no admin role or admin screen.

3. **AI features (OpenAI) are switched off for the assessment.** The plant report, "Draft with AI" and "Ask about this pest" are outside the charter. The code is kept, but the assessed release runs without an OpenAI key: the controls are hidden and the endpoints answer `503 ai_unavailable` without contacting OpenAI (supervisor review OBS-06).

## What the team still has to do

1. **Host the prototype** (§20.3 milestone, US24, NFR07). The app runs as one Docker container that needs HTTPS and a persistent disk; see [DEPLOY.md](DEPLOY.md). The image has not been built yet, because Docker isn't installed on the development machine.
2. **Specialist review of the pest content** (FR09, FR16, US11, US17). A plant specialist on the team reads each pest page and its "What you can do" steps, then records the sign-off:

   ```
   python -m app.cli review-content --by "Full name" --pest aphids
   python -m app.cli review-content --by "Full name" --all
   ```

3. **Native review of the Arabic** (NFR04). It was machine translated. A native-speaking team member checks `frontend/src/i18n/locales/ar.json` and the `ar` content in `backend/content/pests/catalog.json`, then runs:

   ```
   python -m app.cli review-content --by "Full name" --translation ar
   ```

4. **Practical evaluation** (§8, §22.2).
   - Growers who switch on research consent in Account settings contribute their photos. Specialists identify them through the normal review.
   - Then, from `backend/`:

     ```
     python -m app.cli export-research-photos --out D:\nabta-collected
     ```

   - Fill in the `conditions` column of `manifest.csv`, for example "outdoors, phone, daylight".
   - Then:

     ```
     python -m app.cli evaluate-collected --set D:\nabta-collected --report ..\ml\reports\collected.md
     ```

   - Photos the team collects outside the app can go in a second folder with the same `manifest.csv` columns, added with another `--set`.
5. **Usability study and requirements evidence** (§8 usability, NFR01, §19). Run the core tasks with growers and record the completion rate; add the survey and specialist findings.
6. **Version control** (NFR12, §18). Put the project in the team's Git repository. `.gitignore` already keeps out secrets (`backend/.env`), the database, uploaded photos, model files and datasets.

## Supervisor review fixes (8 November 2026)

| Review item | Problem | Fix | Checked by |
| --- | --- | --- | --- |
| DEF-02 | Upgrading a Sprint 2 database to the Sprint 3 schema deleted plants, observations and reviews | `alembic/env.py` migrates with SQLite foreign keys off for that connection, in one transaction, and undoes the upgrade if `PRAGMA foreign_key_check` finds a broken link; `backup-db` and `restore-db` | `test_migrations.py` (populated upgrade, downgrade and upgrade again, rollback, backup and restore) |
| OBS-14, Sprint 1 §5 | Anyone could register as a specialist and open pending cases | Pending specialists (`users.approved_at`, migration `0007_specialist_approval`); `approve-specialist`, `revoke-specialist`, `list-pending-specialists`; `403 specialist_pending` on every specialist route; "Awaiting approval" screen | `test_access_control.py`, `test_specialist_approval.py`, `approval.test.jsx`, `specialist-approval.spec.js` |
| OBS-06 | OpenAI features outside the charter and untested | Switched off in the assessed release; the report page no longer calls the report endpoint when AI is off | `test_ai_off.py`, `aiOff.test.jsx`, `ai-off.spec.js` |
| DEF-03 | Plant page tabs had no visible keyboard focus | `outline-none` removed so the app-wide ring shows; arrow keys follow the reading direction in Arabic | `tabsKeyboard.test.jsx`, `accessibility.spec.js` |
| OBS-09 | The Playwright folder was missing | `frontend/e2e/` rewritten: `server.mjs` and five specs | `npm run e2e` (330 runs) |
