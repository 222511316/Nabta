# Nabta — Sprint 2 Design: Pest Identification and Specialist Review

- **Date:** 2026-10-18
- **Scope:** Charter §16.2, user stories US09–US16, plus the model work listed for them in §17
- **Milestone (charter §20.2):** a grower can submit an insect photo and complete a specialist-review case.
- **Status:** Built 2026-10-18. The team pointed at the charter as the requirements. Decisions marked **(Claude's call)** were made while building and can be changed.

## 1. The model decision

**A classifier trained by the team on IP102, built on a pretrained biology model. No external AI service.** (Claude's call; the team asked for a recommendation.)

| Option | Verdict |
| --- | --- |
| General multimodal model (OpenAI or similar) | **No.** The charter requires a model the team trains and evaluates: macro F1 against a baseline on a fixed held-out split, per-category precision and recall, a confusion matrix, and measured rejection of unsupported insects (§8, NFR15). An external chatbot can't produce that evidence. It would also send growers' private photos to a third party (NFR06), cost money per photo, need internet for the demo (R07) and give uncalibrated confidence. |
| Official IP102 pretrained model (ResNet-50, 49.7% top-1 over 102 classes, 2019) | **Use as a baseline** that the charter's KPI compares against, next to an in-house ResNet-50 trained the same way as Nabta's model. The team supplied the weights (`resnet50_0.497.pkl`); they are loaded with PyTorch's weights-only loader, which accepts plain tensors only. Because it predicts 102 classes, it is reported two ways: restricted to Nabta's categories (the same task), and unrestricted. |
| Community YOLOv8 IP102 model (Hugging Face) | Not used: no published accuracy or split. |
| **Pretrained backbone + trained head (transfer learning)** | **Chosen.** Frozen image features from a pretrained model, plus a classification head trained on the selected categories. It trains on the team's CPU in minutes (no GPU on this machine; the AMD card isn't usable by PyTorch on Windows), runs locally in the backend and is fully reproducible. |

**Backbone.** Experiments compare an ImageNet ResNet-50 (the in-house baseline) with **BioCLIP** (`imageomics/bioclip`, MIT licence). BioCLIP is a ViT-B/16 trained on 10M images of living organisms, insects included. The winner is chosen on validation macro F1, then size and CPU latency, as charter §18 asks. BioCLIP's zero-shot result is reported too, to show what training adds.

## 2. Data

- **Dataset:** IP102 v1.1 (Wu et al., CVPR 2019), free for academic use. Downloaded from the Hugging Face copy `EnmmmmOvO/insect-pest-dataset`, pinned to revision `5d1b759`, because the official Drive link is over its quota. Its splits match the official sizes exactly: 45,095 train, 7,508 validation and 22,619 test. The label↔class mapping is checked visually during the audit.
- **Location:** raw data lives outside the repo (`NABTA_DATA_DIR`, here `D:\nabta-data`). Only code, configuration and reports are committed.
- **Categories (grower-level, Claude's call, confirmed by the audit).** Each Nabta category groups the IP102 classes a grower would call by one name; the mapping is recorded in `ml/categories.yaml`:

| Nabta category | IP102 classes (1-based ids from `classes.txt`) |
| --- | --- |
| Aphids | 25, 28, 29, 30, 53, 90, 91, 92 |
| Whiteflies | 72, 83 |
| Mealybugs | 65, 82 |
| Scale insects | 77, 78, 79, 80, 81 |
| Fruit flies | 84, 85, 86 |
| Armyworms and cutworms | 19, 20, 21, 24, 39, 40, 87 |
| Thrips | 13, 34, 54, 55, 93 |
| Locusts and grasshoppers | 49 |

  These are common on Saudi home-garden plants (citrus, tomatoes, roses, palms, vegetables). Categories that the audit finds too small or too noisy are dropped; the charter allows 5–8. Mites and leaf-mining damage are excluded: mites aren't insects, and identifying from damage is out of scope (§5.2).
- **Unsupported insects (R03):** every other IP102 class. They're split by class into two disjoint groups: one tunes the "unclear" threshold (validation images), and the other only measures rejection (test images), so the reported rejection rate is for insect types the threshold never saw.
- **Audit (R01, R09):** per-category image counts by split; a visual label check on contact sheets; near-duplicate detection (difference hash) across splits, with cross-split duplicates removed from test; tiny images reported. The output is `ml/reports/audit.md`.

## 3. Training, evaluation and uncertainty

1. Extract image features once per backbone. Training images get one extra augmented view (crop, flip, colour jitter) for robustness to growers' photos (R02).
2. Train a multinomial logistic-regression head with class-balanced weights; choose its regularisation on validation macro F1.
3. **Calibrate** with temperature scaling, fitted on validation.
4. **The "unclear" rule:** a photo is identified only when it is **familiar** (its features are close enough to at least one training photo) **and** its top category has at least a 50% probability. The 50% floor is fixed in advance (an identified result must be more likely than not). The familiarity cut-off is chosen on validation to maximise (acceptance of supported images + rejection of the tuning group of unsupported images) / 2. (Claude's call, from the evaluation: the first version used the top probability alone, which had to be set so high that only about 63% of known pests were accepted. On validation, familiarity separates known from unknown insects much better, at AUROC 0.86 against 0.76, so the combined rule accepts more known pests *and* rejects more unknown insects. The comparison is kept in the evaluation report.)
5. **Report** (`ml/reports/evaluation.md`), on the fixed test split:
   - macro F1 for the baselines and the final model
   - per-category precision and recall, and a confusion matrix
   - acceptance rate on supported test images, and accuracy among the accepted ones
   - rejection rate on the held-out unsupported group

   - how often deliberately unsuitable photos (heavily blurred or very dark test photos) are shown as unclear (§22.2)

   Field photos collected from growers will be reported separately when the team has them (§8).
6. **Export:** an ONNX model plus `model_card.json`. The single graph holds the image encoder, feature normalisation, head and the training photos' features, and returns calibrated logits and familiarity. The card records the version, categories, mapping, temperature, the rule's two thresholds, preprocessing, dataset source and metrics. Seeds, splits and the dataset revision are fixed (NFR15).
7. **Serving (NFR12):** the backend loads the ONNX model with `onnxruntime`. PyTorch is only needed in `ml/`. Model files are large, so they aren't committed; `ml/README.md` explains how to rebuild them.

### Results (`nabta-pest-1.0`, full report in `ml/reports/evaluation.md`)

All figures are on the deduplicated IP102 test split of the eight categories.

| Model | Test macro F1 | Test accuracy |
| --- | ---: | ---: |
| **BioCLIP + trained head (chosen)** | **0.828** | 88.4% |
| ResNet-50 + trained head (in-house baseline) | 0.796 | 84.6% |
| Published IP102 ResNet-50, within Nabta's categories | 0.625 | 74.7% |
| BioCLIP zero-shot | 0.591 | 72.3% |

- **Charter KPI:** met against both baselines.
- **The "unclear" rule:** 73.3% of supported insects are identified, at 94.7% accuracy. 86.9% of the held-out unsupported insects are shown as unclear, as are 99.5% of heavily blurred and 82.5% of very dark photos.
- **Weakest category:** mealybugs (F1 0.61), often confused with scale insects.
- **Serving:** one ONNX file, 372 MB, at 98 ms per photo on the team's CPU.

## 4. Identification in the app (US09, US10)

- After an observation is saved, the browser calls `POST /api/observations/{id}/analysis`. The server runs the model (well under a second on CPU) and stores **one analysis per observation**. Calling again returns the stored one, so retries never duplicate (NFR09).
- **Stored per analysis:**
  - outcome: `identified` or `unclear`, and for unclear results why: `unfamiliar` (unlike the training photos) or `uncertain` (no category likely enough)
  - the familiarity score
  - the top category and its confidence
  - the top three predictions
  - the **model version** (NFR13)
  - a timestamp
- **Failure:** without an installed model the endpoint returns 503 `analysis_unavailable` ("isn't available right now"; the observation is kept). If the model fails on a photo it returns 503 `analysis_failed`. Either way nothing is saved, and the screen offers **Try again** and **Ask a specialist** (US09).
- **Display:**
  - **While analysing:** the photo shows the brand's magnifier sweeping across it.
  - **Identified:** the category name, a confidence percentage with a plain-language level, a short description, then **Compare with reference photos** and **Ask a specialist**.
  - **Unclear:** "Nabta can't tell what this is", then three next steps: retake the photo, compare reference photos, or ask a specialist (US10). The explanation depends on the reason. For an *uncertain* result it reads "It looks closest to Aphids (41%) or Whiteflies (22%), but neither is likely enough to suggest". For an *unfamiliar* one it reads "It doesn't look enough like the insects Nabta knows. The closest are Aphids and Whiteflies", with no percentages, because the model can be sure of a category it has never seen this insect in.
- Observation cards on the plant page show the result (e.g. "Aphids · 92%" or "Unclear"), so results stay in the plant's history (FR10).

## 5. Reference examples (US11)

- Each category has a short description: a summary, what to look for, size (left out when the source gives none), where on the plant, damage, and look-alikes. Every statement comes from its cited source: the UC IPM pages for aphids, whiteflies, mealybugs, scales, thrips, grasshoppers, armyworms and cutworms (charter §22.3), and USDA APHIS for the oriental fruit fly. The source and a **review status** are recorded with it (NFR14). Status starts as "Awaiting specialist review"; a specialist on the team sets `reviewed`, their name and the date in `backend/content/pests/catalog.json`. The backend refuses to start if an entry has no source, an unknown status or a missing photo.
- 3–4 reference photos per category come from the IP102 **training** split, credited per photo (dataset and class). Photos with watermarks, photographer credits or the wrong insect were left out. They are stored with the content (29 images, 1.5 MB, committed).
- `GET /api/pests`, `GET /api/pests/{key}` and `GET /api/pests/{key}/images/{file}` are available to any signed-in user. Only the photos listed for a pest are served.
- The pest page opened from a result (`?observation=`) or a case (`?case=`) puts the photo being identified beside a reference photo of the same size. Thumbnails switch the reference photo, and the other predictions are one tap away ("Not a match? Compare with…").
- A **Pest guide** page lists every category and is linked in both roles' navigation (Claude's call), so growers can browse and the team's specialist can review the content.

## 6. Specialist review (US12–US16)

**Case lifecycle:**
- Request (grower) → **Waiting for a specialist**.
- Specialist takes the case → assigned to them.
- Specialist asks a question → **Waiting for the grower**; the grower replies → back to **Waiting for a specialist**.
- Specialist sends an assessment → **Answered**.

**Rules:**
- **One case per observation.** The request confirms what will be sent (photo, Nabta's result and the grower's note), then creates the case (US12).
- **Queue (US14):** specialists see unassigned waiting cases plus the cases assigned to them. Once a specialist takes a case, only they can open it, which keeps observations private (NFR06). "Take this case" is explicit (Claude's call).
- **Conversation (US15):** questions and replies are dated messages with authors.
- **Assessment (US16):** stored apart from the AI result, with:
  - an outcome: *agrees with Nabta's suggestion*, *a different pest* (choose a category or describe it) or *can't tell from this photo* (inconclusive)
  - a message to the grower
  - the specialist's name and the date

  The screens always label it "Specialist's assessment", separate from "Nabta's suggestion".
- **Tracking and notifications (US13, FR15):** status is shown on the observation, on its card in the plant's history and on a grower **Reviews** list. It is worded for the viewer. A grower sees "Waiting for a specialist", "Waiting for your reply" or "Answered"; a specialist sees "New", "Waiting for you", "Waiting for the grower" or "Answered". The status that needs the viewer's action is highlighted. In-app notifications go out when a question arrives, a grower replies and an assessment is sent, through a bell in the header with an unread count. The bell, the queue and open cases check every 30 seconds; there's no email (the charter says in-app).
- **Photos for specialists** come from a case-scoped endpoint that checks the case permission, never from the grower's own endpoint.

## 7. Data model additions (Alembic migrations `0002_analyses`, `0003_reviews`, `0004_familiarity`)

`analyses`, `review_cases`, `case_messages`, `case_feedback`, `notifications`. Every link uses a foreign key with `CASCADE`, so deleting a plant removes its observations, analyses and cases (NFR08).

## 8. Design

The Sprint 1 look stays unchanged: same palette, type and components. The one new memorable moment reuses the landing page's loupe. While Nabta analyses a photo, the magnifier sweeps across the grower's own photo, and the result is pinned to its corner as a specimen label in the hero's label style. Other new motion is limited to user-triggered moments: the result reveal, switching reference photos and new messages in a case. Reduced motion shows a still magnifier in the middle of the photo. Lists (reviews, the queue, the pest guide) are rows in one card rather than a card per item.

## 9. Testing

- **Backend:** pytest, with a deterministic fake model injected for API tests and a smoke test for the real ONNX model when its files exist. The access-control matrix is extended to every new endpoint.
- **ML:** pytest for the category mapping, duplicate hashing, calibration, threshold selection and metric code.
- **Frontend:** Vitest + MSW for every new state and flow.
- **End to end:** a browser run of the milestone: photo → result → review request → question → reply → assessment → notification.

## 10. Demo data

`seed-demo` uses eight real IP102 **test** photos, none with a near-duplicate in training and each credited in `backend/content/demo/demo.json`, so demo results are realistic. One shows an insect outside Nabta's categories, from the held-out unsupported group, to demonstrate "unclear". It runs the model on them when it's installed. It seeds one case in each state (waiting for a specialist, waiting for the grower, and answered), through the same services the API uses, so the notifications are real. `seed-demo --reset` rebuilds only the demo grower's data, for databases seeded before Sprint 2.
