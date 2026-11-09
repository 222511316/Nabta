*SE499 Senior Project*

# Nabta Project Charter

*Insect Pest Identification and Specialist Review*

Supervisor  
Dr. Suad Alramouni

### Prepared by

222410482   Rema Altamimi   SE-3  
222410460   Danah Alfaris   SE-3  
222410346   Alanoud Almubarak   SE-3  
222410458   Dana Alhamdan   SE-3  
222511316   Rema Alsabhan   SE-3

Planned duration  
Twelve weeks across three development sprints

## 1. Project Title and Team Information

**Project name: **Nabta

**Project title: **Insect Pest Identification and Specialist Review

**Course: **SE499 Senior Project

**Supervisor: **Dr. Suad Alramouni

**Planned duration: **Twelve weeks across three development sprints

### Team members

| **Student ID** | **Name** | **Track** |
| --- | --- | --- |
| 222410482 | Rema Altamimi | SE-3 |
| 222410460 | Danah Alfaris | SE-3 |
| 222410346 | Alanoud Almubarak | SE-3 |
| 222410458 | Dana Alhamdan | SE-3 |
| 222511316 | Rema Alsabhan | SE-3 |

## 2. Project Objectives

Nabta aims to help growers identify visible insect pests and obtain informed support when a result is uncertain. Its objectives are to:

- Develop a working web application for recording and reviewing pest observations.
- Train and evaluate an image classifier for a manageable selection of insect pest categories.
- Present identification suggestions with clear confidence and uncertainty information.
- Allow growers to request specialist review of questioned results.
- Help specialists examine photographs, request clarification, and provide feedback.
- Connect observations with reviewed pest-management information and follow-up tasks.
- Provide an accessible experience in Arabic and English.
- Evaluate the prototype through model performance, workflow completion, and user feedback.

## 3. Project Description and Problem Statement

Growers who notice an unfamiliar insect on a plant may struggle to identify it or decide what to do next. Searching through photographs and advice can be difficult when insects look similar or the available information does not match the observation. Relevant details may also become scattered across photographs, messages, and personal notes.

Nabta is a web application that allows growers to submit a clear photograph of a visible insect and receive a suggested identification from a trained model. The first release will target approximately five to eight categories, selected according to dataset quality, practical relevance, and evaluation results.

Each observation will retain the photograph, identification result, and grower's notes. A grower who questions a result can request manual review by a plant specialist with relevant pest-identification knowledge. Reviewed information, specialist feedback, and follow-up tasks will help the grower decide on an appropriate next step.

## 4. Stakeholders

- **Growers: **Submit observations, review suggestions, request assistance, and record follow-up actions. They need understandable results and convenient access to their records.
- **Plant specialists: **Review cases and provide identification feedback and suitable guidance. They need clear photographs, relevant context, and an organised review queue.
- **Development team: **Designs, implements, evaluates, and maintains the prototype throughout the project.
- **Project supervisor: **Provides academic guidance, reviews progress, and advises on scope and technical decisions.
- **Examination committee: **Assesses the project's distinct problem focus, engineering quality, and supporting evidence.
- **Research participants: **Provide feedback on their experiences and the usability of the prototype.
- **Dataset and reference providers: **Supply resources used under their stated terms, with appropriate attribution.

## 5. Project Scope

### 5.1 In Scope

- A responsive web application with grower and specialist roles.
- Account access and personal plant records.
- Uploading close-up insect photographs with observation notes.
- Classification of approximately five to eight supported insect pest categories.
- Confidence information and an unclear-result outcome.
- Pest descriptions and reviewed reference examples.
- Manual review requests, clarification exchanges, and specialist feedback.
- Reviewed pest-management guidance and follow-up tasks.
- Observation history, personal notes, and photograph comparison.
- In-app reminders and review notifications.
- Arabic and English interfaces.
- Personal record deletion and separate research-consent controls.
- Evaluation using held-out dataset images and an independently collected photo set, subject to access.

### 5.2 Out of Scope

- General plant-health assessment, plant-disease diagnosis, and nutrient-deficiency identification.
- Identifying an unseen pest solely from damage to a leaf or plant.
- Recognition of every insect species or guaranteed identification of unsupported insects.
- Automated determination that an insect is harmful in every plant context.
- Multiple-insect localisation, automated counting, and infestation-severity measurement.
- Drone, sensor, and continuous video monitoring.
- Automatic confirmation of pest elimination or plant recovery.
- Automatically generated pesticide prescriptions or application dosages.
- Native mobile applications, commercial deployment, and continuous specialist availability.

## 6. Risks and Risk Register

Likelihood and impact are assessed as Low, Medium, or High. Owners coordinate the response, with support from the team.

| **ID** | **Risk** | **Likelihood** | **Impact** | **Owner** | **Mitigation and response** |
| --- | --- | --- | --- | --- | --- |
| R01 | Selected categories contain insufficient, imbalanced, or unreliable images. | High | High | Alanoud Almubarak | Audit original images and labels; select suitable categories and use balanced training methods. |
| R02 | Performance drops on growers' photographs. | High | High | Alanoud Almubarak | Evaluate independent photos, vary training conditions, and revise poorly supported categories. |
| R03 | Unsupported insects receive confident predictions. | Medium | High | Alanoud Almubarak | Evaluate unsupported inputs, tune uncertainty handling, and provide a review route. |
| R04 | Suitable specialists or verified local samples are difficult to obtain. | Medium | High | Dana Alhamdan | Arrange access early and agree on a manageable review and sample-collection plan. |
| R05 | Guidance is misunderstood or unsuitable for the observation. | Medium | High | Rema Alsabhan | Use attributed, reviewed content and allow specialists to explain uncertainty and context. |
| R06 | A permissions error exposes private records. | Medium | High | Danah Alfaris | Enforce server-side ownership and role checks; verify unauthorised access scenarios. |
| R07 | Training resources or hosted services become unavailable or exceed the budget. | Medium | Medium | Danah Alfaris | Monitor usage, retain model checkpoints, and maintain a local demonstration setup. |
| R08 | Integration work or additional features delay delivery. | Medium | High | Rema Altamimi | Integrate incrementally, review dependencies each sprint, and prioritise essential stories. |
| R09 | Duplicate or related images leak between training and evaluation sets. | Medium | High | Alanoud Almubarak | Check duplicates, group related images, and record the final split before evaluation. |

## 7. Project Constraints

**Time and team capacity.** Five students will deliver the prototype within approximately twelve weeks alongside other academic commitments.

**Dataset suitability.** The supported categories depend on the number, quality, and relevance of available images. Category selection will be confirmed after the initial dataset audit.

**Image quality.** Identification depends on the insect being visible at a useful scale. Focus, lighting, background, and insect life stage may affect the result.

**Specialist access.** Review turnaround and verification of collected photographs depend on specialist availability.

**Computing and connectivity.** Training will use available local or hosted computing resources. The deployed application will require internet access for its hosted functions.

**Budget.** A provisional allowance of SAR 600 is proposed: SAR 250 for model-training resources, SAR 200 for application hosting and storage, and SAR 150 as contingency. These are planning allocations, subject to actual usage and available university resources.

**Data usage.** Dataset, image, and reference-content terms must be respected. Research use of participant photographs requires recorded consent.

## 8. Success Measures and KPIs

The following measures will be used to assess the prototype:

- **Feature completion: **All High-priority stories meet their acceptance criteria before final delivery.
- **Identification performance: **The trained model improves on the initial baseline's macro F1 score on the same held-out split. Per-category precision, recall, and the confusion matrix are reported.
- **Uncertainty handling: **Evaluation reports both rejection of unsupported inputs and acceptance of supported inputs at the chosen threshold.
- **Practical evaluation: **Results on independently collected photographs are reported separately, including sample counts and collection conditions.
- **Usability: **At least 80% of participating growers complete the agreed core tasks without facilitator intervention.
- **Review workflow: **All agreed review scenarios complete successfully, including requesting information and returning feedback.
- **Access control: **All defined unauthorised-access checks pass before release.
- **Language coverage: **All core screens and essential messages are available in both Arabic and English.

These are evaluation targets. Findings and limitations will be recorded even when a target is not achieved.

## 9. Core Functions and Key Features

- **Pest observation: **Combines a photograph, date, plant reference, and notes into one record.
- **AI identification: **Suggests a supported pest category and communicates uncertainty.
- **Reference information: **Helps growers compare visible characteristics and understand the suggested pest.
- **Specialist review: **Provides a structured route for checking questionable results.
- **Guidance and follow-up: **Connects reviewed information with tasks and reminders.
- **Personal history: **Keeps observations, feedback, and actions available for later reference.

## 10. Functional Requirements

### Account Access and Plant Records

- **FR01: **The system shall allow growers to register, sign in, sign out, and reset their passwords.
- **FR02: **The system shall allow users to view and update their account details.
- **FR03: **The system shall provide role-based workspaces for growers and authorised specialists.
- **FR04: **The system shall allow growers to create, view, edit, and delete their plant profiles.

### Observation and Identification

- **FR05: **The system shall allow growers to upload insect photographs with dated observations linked to a plant.
- **FR06: **The system shall provide photograph-taking instructions and validate uploaded file types and sizes.
- **FR07: **The system shall analyse submitted photographs using the trained classifier and save the result.
- **FR08: **The system shall display a suggested category with confidence information or an unclear outcome.
- **FR09: **The system shall display reviewed descriptions and reference images for supported categories.
- **FR10: **The system shall retain dated observations, identification results, and specialist feedback in plant history.

### Specialist Review

- **FR11: **The system shall allow growers to flag results and submit review requests with supporting notes.
- **FR12: **The system shall allow authorised specialists to access permitted cases through a review queue.
- **FR13: **The system shall allow specialists to request clarification and growers to reply within the case.
- **FR14: **The system shall allow specialists to submit dated feedback and guidance, including an inconclusive outcome.
- **FR15: **The system shall display review status and notify growers of information requests and completed responses.

### Guidance and Personal Organisation

- **FR16: **The system shall provide reviewed pest-management information with supporting sources.
- **FR17: **The system shall allow growers to create and complete plant-linked tasks and schedule in-app reminders.
- **FR18: **The system shall allow growers to add, edit, and retrieve dated personal notes.
- **FR19: **The system shall allow growers to compare two photographs from the same plant.
- **FR20: **The system shall provide dashboard summaries and search or filters for plants, pest observations, and pending tasks.
- **FR21: **The system shall allow users to switch between Arabic and English.
- **FR22: **The system shall allow growers to delete selected personal records and manage research consent separately.

## 11. Non-Functional Requirements

- **NFR01 — Usability: **Core tasks shall use consistent navigation, clear labels, and understandable feedback, verified through representative user tasks.
- **NFR02 — Compatibility: **Core workflows shall operate in the agreed mobile and desktop browser test set.
- **NFR03 — Accessibility: **Essential controls shall support keyboard access, visible focus, descriptive labels, and readable contrast.
- **NFR04 — Language consistency: **Core content shall remain equivalent across Arabic and English, with appropriate text direction.
- **NFR05 — Authorisation: **Protected operations shall enforce role and record-access permissions on the server.
- **NFR06 — Privacy: **Personal observations shall be accessible only to their owner and specialists permitted to review the relevant case.
- **NFR07 — Secure communication: **The deployed application shall use HTTPS and keep service credentials outside client code.
- **NFR08 — Data integrity: **Photos, results, reviews, and tasks shall retain valid links to their associated records.
- **NFR09 — Error recovery: **Failed uploads and analysis requests shall provide clear feedback and a retry route without creating duplicate completed observations.
- **NFR10 — Responsiveness: **Upload and analysis operations shall show progress or status while keeping navigation responsive.
- **NFR11 — Reliability: **Stored observations shall remain retrievable after refresh, sign-out, and application restart.
- **NFR12 — Maintainability: **Interface, application logic, and model-service responsibilities shall be separated and managed through version control.
- **NFR13 — Traceability: **Analysis records shall retain the model version; specialist responses shall retain the author and date.
- **NFR14 — Content quality: **Published guidance shall have a recorded source and review status.
- **NFR15 — Reproducibility: **Model evaluation shall use recorded dataset versions, category mappings, configurations, and fixed evaluation splits.

## 12. User Need and Expected Value

Nabta is intended to reduce the effort involved in moving from an unfamiliar insect observation to a documented next step. Growers will be able to keep their photographs, identification suggestions, and specialist responses together, making follow-up easier.

For specialists, a structured case provides more useful context than an isolated photograph. For the project team, the application provides a practical setting in which to evaluate how image classification, uncertainty communication, and human review work together. These benefits will be assessed through the prototype evaluation.

## 13. Target Users

**Home growers and garden owners in Saudi Arabia **are the primary audience. They need simple photograph submission, understandable identification information, and a way to seek clarification.

**Small nursery growers and staff **are a secondary audience, subject to the selected pest categories. They may use the application to organise observations and follow-up work across several plants.

**Plant specialists with relevant pest-identification knowledge **form the review audience. They need access to case history, clear communication tools, and the ability to return either a supported opinion or an inconclusive response.

## 14. Similar Systems and Comparative Analysis

**Picture Insect **provides photograph-based insect identification and supporting insect information. It is relevant to Nabta's identification interface and the presentation of visual characteristics. Nabta's proposed emphasis is the connection between a grower's plant record, a questioned result, and a tracked specialist review.

Picture Insect — https://pictureinsect.com/app

**Seek by iNaturalist **uses image recognition to identify organisms and encourages nature observation through learning activities and challenges. It provides a useful reference for accessible identification and observation experiences. Nabta concentrates on selected insect pests encountered by growers and the follow-up associated with each case.

Seek by iNaturalist — https://www.inaturalist.org/pages/seek_app

**Plantix **connects crop photographs with diagnosis and treatment suggestions, agricultural information, and community expert advice. It is relevant to Nabta's guidance and assistance workflow. Nabta's contribution will be a focused prototype that integrates visible-insect identification, explicit uncertainty, and case-based specialist feedback.

Plantix — https://plantix.net/en/

These comparisons establish design references. Nabta's value will be assessed through the suitability and usability of its focused workflow rather than assumed uniqueness of individual features.

## 15. High-Level Workflow

A grower signs in, opens a plant record, and submits an insect photograph with notes. The system saves the observation, analyses the photograph, and presents a suggestion or unclear outcome. The grower can consult relevant information, add a follow-up action, or request specialist review.

During review, the specialist may request further information before providing feedback. The response is added to the observation history and the grower is notified.

![Nabta observation and specialist review workflow](Nabta_Pest_Workflow.png)

*Figure 1. Nabta observation workflow with optional specialist review and follow-up.*

## 16. Initial User Stories

**High **priority identifies essential capabilities. **Medium **priority identifies supporting capabilities planned for the prototype.

### 16.1 Sprint 1 — Application Foundation

| **ID and title** | **User story** | **Acceptance criteria** | **Priority** |
| --- | --- | --- | --- |
| US01 — Create an account | As a grower, I want to register so that I can keep personal plant records. | Valid details create an account; invalid entries receive feedback. | High |
| US02 — Sign in and out | As a user, I want secure access so that I can use my workspace. | Valid credentials open the workspace; sign-out ends protected access. | High |
| US03 — Reset my password | As a user, I want to reset my password so that I can regain access. | A reset link allows the account owner to set a new password. | High |
| US04 — Update account details | As a user, I want to update my details so that my profile stays accurate. | Valid changes persist; invalid entries receive feedback. | Medium |
| US05 — Manage plant profiles | As a grower, I want separate plant profiles so that I can organise observations. | Owners can create, view, edit, and confirm deletion of profiles. | High |
| US06 — Save a pest observation | As a grower, I want to upload an insect photo so that I can record what I found. | Valid photos and notes retain the plant and date; failed uploads can be retried. | High |
| US07 — View my dashboard | As a grower, I want an overview of my plants so that I can open their records easily. | The dashboard shows owned plants and links to their profiles. | High |
| US08 — Access specialist tools | As an authorised specialist, I want my own workspace so that I can access review tools. | Authorised specialists gain access; grower accounts are denied. | High |

### 16.2 Sprint 2 — Pest Identification and Specialist Review

| **ID and title** | **User story** | **Acceptance criteria** | **Priority** |
| --- | --- | --- | --- |
| US09 — Identify a visible insect | As a grower, I want my photo analysed so that I can learn its possible pest category. | Analysis shows status, saves the result, and supports retry after failure. | High |
| US10 — Understand uncertainty | As a grower, I want unclear results explained so that I can choose a next step. | Results show confidence or an unclear outcome with suitable next actions. | High |
| US11 — View reference examples | As a grower, I want reference photos so that I can compare visible characteristics. | Supported results display matching descriptions and reviewed examples. | Medium |
| US12 — Request manual review | As a grower, I want to question a result so that a specialist can examine it. | A confirmed request includes the photo, result, and supporting notes. | High |
| US13 — Track my request | As a grower, I want review updates so that I know when action is needed. | Current status is visible; requests and responses trigger notifications. | High |
| US14 — Open a review case | As a specialist, I want to view pending cases so that I can examine observations. | Permitted cases show photos, results, notes, and status. | High |
| US15 — Request clarification | As a specialist, I want additional details so that I can understand the observation. | Growers can reply; dated exchanges and case status are saved. | High |
| US16 — Provide feedback | As a specialist, I want to return my assessment so that the grower can respond appropriately. | Dated feedback identifies its author, allows uncertainty, and remains separate from AI output. | High |

### 16.3 Sprint 3 — Guidance, Follow-Up and Release

| **ID and title** | **User story** | **Acceptance criteria** | **Priority** |
| --- | --- | --- | --- |
| US17 — Read relevant guidance | As a grower, I want reviewed pest information so that I can consider suitable action. | Supported categories link to readable guidance with sources. | High |
| US18 — Manage tasks and reminders | As a grower, I want follow-up reminders so that I remember planned actions. | Plant-linked tasks can be completed; due reminders appear in the app. | High |
| US19 — Keep personal notes | As a grower, I want dated notes so that I can remember observations and actions. | Notes can be added, edited, and retrieved from the correct plant. | Medium |
| US20 — Compare photographs | As a grower, I want to compare photos so that I can observe visible changes. | Two photos from the same plant appear together with their dates. | Medium |
| US21 — Find records needing attention | As a grower, I want search and summaries so that I can locate pending work. | Search and filters match records; summaries reflect current data. | Medium |
| US22 — Control my information | As a grower, I want data and consent controls so that I can manage my information. | Confirmed deletions remove selected data; research consent is separately changeable. | High |
| US23 — Choose my language | As a user, I want Arabic or English so that I can use Nabta comfortably. | Core screens switch language and direction while retaining context. | High |
| US24 — Use different devices | As a user, I want mobile and desktop access so that I can use an available device. | Core workflows remain usable in the agreed browser test set. | High |

## 17. Initial Product Backlog

The user stories in Section 16 form the initial product backlog. Each item has a unique identifier, priority, acceptance criteria, and proposed sprint allocation. Supporting technical work will be recorded beneath the relevant stories:

- **US06 and US09: **Dataset audit, category mapping, image preparation, and initial classifier.
- **US09 and US10: **Model evaluation, uncertainty handling, and analysis-service integration.
- **US08 and US14–US16: **Specialist permissions, case status, and review records.
- **US17 and US18: **Reviewed content, task scheduling, and reminder delivery.
- **US22–US24: **Data controls, bilingual presentation, and deployment compatibility.

The team will estimate tasks during sprint planning and review the backlog at each sprint boundary. Material changes to the agreed scope will be documented and discussed with the supervisor.

## 18. Initial Technologies and Tools

- **Next.js and TypeScript: **Web pages and application backend, allowing the team to share types and coordinate interface development.
- **Python, PyTorch, and torchvision: **Image preparation, transfer learning, and model evaluation.
- **FastAPI: **A proposed interface between the application backend and the Python analysis service.
- **Firebase Authentication: **Account sign-in and identity management.
- **Firebase Storage: **Observation photographs and approved reference images.
- **MongoDB: **Plant records, observations, reviews, tasks, and guidance content.
- **Git and GitHub: **Version control, code review, issue tracking, and backlog coordination.
- **Available local or hosted GPU resources: **Training and experimentation within the project budget.

The final classifier architecture will be selected through baseline experiments, considering performance, model size, and deployment needs.

## 19. Requirements-Elicitation Evidence

At this stage, the project baseline draws on the defined grower and specialist workflow, review of similar systems, and published dataset information. These sources support the initial design but require validation with target users.

A structured survey will investigate how growers currently identify insects, photograph observations, seek advice, and keep follow-up records. Specialist discussions will address the information needed for review, common identification difficulties, and useful case statuses.

The evidence record will include:

- The survey questions and participant-selection criteria.
- The number and relevant characteristics of respondents.
- A summary of responses and recurring needs.
- Specialist discussion notes, with permission.
- A mapping from findings to requirements and backlog decisions.

**Evidence status: **Completed survey responses and specialist interview findings are pending. They will be added after collection and analysis, with the resulting requirement changes recorded.

## 20. Delivery Plan

### 20.1 Sprint 1 — Application Foundation — Weeks 1–4

- Build account access and role-based workspaces.
- Implement plant profiles and the dashboard.
- Add photo storage and dated observations.
- Prepare selected pest data and an initial classifier.

**Milestone: **Growers can register plants and save observations in a working application.

### 20.2 Sprint 2 — Pest Identification and Specialist Review — Weeks 5–8

- Integrate identification results and uncertainty messages.
- Add pest descriptions and reference examples.
- Develop review requests and the specialist queue.
- Connect clarification, feedback, history, and notifications.

**Milestone: **A grower can submit an insect photo and complete a specialist-review case.

### 20.3 Sprint 3 — Guidance, Follow-Up and Release — Weeks 9–12

- Complete guidance, tasks, and reminders.
- Add notes, photo comparison, and search.
- Complete data controls and bilingual layouts.
- Refine integrated interactions and deploy the prototype.

**Milestone: **A deployed prototype connects pest observations, review, guidance, and follow-up.

## 21. System Architecture

Nabta uses a Next.js interface and backend to support growers and specialists. The backend controls access and manages records, reviews, and follow-up activities. A separate Python service analyses insect photographs. Firebase provides authentication and image storage, while MongoDB stores application records and reviewed content.

![Nabta system architecture](Nabta_Pest_System_Architecture.png)

*Figure 2. Proposed Nabta architecture showing application components and supporting services.*

## 22. Datasets and Important Resources

### 22.1 Primary Dataset

**IP102 — A Large-Scale Benchmark Dataset for Insect Pest Recognition **is the proposed primary training resource. Its authors report more than 75,000 images across 102 pest categories, with approximately 19,000 images also carrying bounding-box annotations. The dataset has an uneven category distribution and is available for academic use.

Official IP102 repository — https://github.com/xpwu95/IP102

Nabta will use an audited classification subset. Final category selection will consider original image counts, label consistency, visible life stages, relevance to growers, and the availability of suitable evaluation photographs.

### Dataset links

Official repository and download options — https://github.com/xpwu95/IP102#data-download

Full category list — https://github.com/xpwu95/IP102/blob/master/classes.txt

IP102 research paper — Wu et al., CVPR 2019 — https://openaccess.thecvf.com/content_CVPR_2019/papers/Wu_IP102_A_Large-Scale_Benchmark_Dataset_for_Insect_Pest_Recognition_CVPR_2019_paper.pdf

### 22.2 Preparation and Evaluation

The team will inspect the selected images, remove unsuitable samples, check duplicates, and preserve a record of category mappings. Related images and augmented versions will remain within the same partition to reduce leakage.

Training, validation, and final evaluation data will be kept separate. A supplementary evaluation set will be sought from consented grower photographs, with identities checked by a suitable reviewer. Unsupported insects and unsuitable photographs will also be used to examine uncertainty handling.

Results will include macro F1, per-category precision and recall, and a confusion matrix. Performance on collected photographs will be presented separately from the benchmark results.

### 22.3 Development and Guidance Resources

- **PyTorch torchvision repository: **Model architectures and image transformations for building classification baselines.
- **FastAPI repository: **Implementation reference for the proposed Python analysis API.
- **UC Integrated Pest Management resources: **A reference for pest information and management principles, with selected content reviewed for the project's context.
- **Picture Insect, Seek, and Plantix: **Comparison resources for identification, information presentation, and assistance workflows.

PyTorch torchvision repository — https://github.com/pytorch/vision

FastAPI repository — https://github.com/fastapi/fastapi

UC Integrated Pest Management resources — https://ipm.ucanr.edu/home-and-landscape/

Picture Insect — https://pictureinsect.com/app

Seek by iNaturalist — https://www.inaturalist.org/pages/seek_app

Plantix — https://plantix.net/en/

Dataset images, reference materials, and software will be used under their respective terms. Sources and versions will be recorded to support attribution and reproducibility.
