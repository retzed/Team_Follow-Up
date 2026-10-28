# Team Follow-Up Application

A bilingual (English/Arabic) team workspace for organizing projects, jobs, tasks, follow-ups, assignments, priorities, and activity history.

**Demo URL: [retzed.github.io/Team_Follow-Up](https://retzed.github.io/Team_Follow-Up/)** · [Project guide](PROJECT_GUIDE.md) · [Application architecture](docs/ARCHITECTURE.md) · [Complete application documentation](docs/DOCUMENTATION.md)

> **Demo only:** this public build uses browser-local demo sign-in and local browser storage. It has no server-side database or real authentication. Do not enter private, personal, or confidential information. Each browser profile has its own copy of the demo data.

## Try the demo

1. Open the [hosted demo application](https://retzed.github.io/Team_Follow-Up/). If the site has not been published for this repository yet, follow the one-time [GitHub Pages setup](PROJECT_GUIDE.md#7-github-pages-publishing).
2. Enter one of the built-in team usernames below. English and Arabic aliases are supported; use `root` for the protected demo root identity.
3. The six standard demo users accept any non-empty password until they set one from their account page. The demo `root` login starts with password `root@1234`; root uses a client-side PBKDF2-HMAC-SHA-256 hash record, and changed demo passwords are stored as salted PBKDF2-HMAC-SHA-256 hashes in browser local storage. This remains a client-only simulation, not production authentication.
4. Explore the comprehensive AWS deployment runbook built into the workspace: 16 documentation Projects plus a separate optional SAM/CloudFormation Job, a varied set of 3–5 Tasks per Project, 2–4 Follow-ups per Task, 1–4 direct Project checkpoints, and four Activity events per work item.

| Demo teammate | Username (English) | Username (Arabic) | Team label |
|---|---|---|---|
| Marwa | `Marwa` | `مروة` | Team Leader |
| Zyad | `Zyad` | `زياد` | AWS Engineer |
| Nadine | `Nadine` | `نادين` | AWS Engineer |
| Omar | `Omar` | `عمر` | AWS Engineer |
| Haneen | `Haneen` | `حنين` | AWS Engineer |
| Dina | `Dina` | `دينا` | AWS Engineer |
| Root | `root` | — | System administrator (protected demo identity) |

The entered username is used only for sign-in; **Display name** is the name shown throughout the app. The account page opens on **Assigned Items** and also provides **Profile**, **Pinned Items**, and **Search** tabs. Profile fields are ordered as Display name, Arabic display name, phone, e-mail, Label, Label (Arabic), and Profile icon; the privilege indicator remains beside the display name at the top, not as an editable profile textbox. Theme and language apply immediately; **Save changes** saves profile fields only. Search filters Projects/Jobs by type, status, creator/updater/owner/assignee user, and inclusive date ranges, with explicit **Open in workspace** and **Activity history** buttons. Assigned/Pinned results also have workspace and history actions. The workspace keeps its own Search sidebar and floating expand/collapse toggle; selection is retained when the sidebar is expanded. At tablet/mobile widths the Search controls use a two-column layout, date controls stay within their columns, and action buttons may wrap. Do not use the demo for real users or real data.

### Where does demo data go?

- Work items, assignments, archive entries, and activity events are saved in the browser's `localStorage` for this site.
- The demo sign-in session is stored in the current browser tab's `sessionStorage`.
- Visitors using another browser, device, profile, or private window have a separate local workspace. The app does not synchronize demo data over the internet.
- The built-in workspace is intentionally large: **a few hundred work items and four Activity events per item**. It organizes the AWS project step by step across architecture, account/cost setup, Cognito, all four DynamoDB tables and five GSIs, IAM/Lambda, API Gateway, Amplify, frontend integration, lazy loading, archive/restore, CloudWatch, acceptance testing, recovery, and an isolated optional SAM/CloudFormation path.
- The enlarged fixture is demo-only and remains in browser storage. It is not uploaded, synchronized, or seeded into the AWS deployment account. The demo’s built-in storage namespace was versioned so existing browser profiles start with the new runbook data after the updated app is published; earlier demo data remains isolated under the old local-storage keys.

## What the application does

- Organizes work into **Projects** and **Jobs** at the top level.
- Supports **Tasks** and **Follow-ups** beneath eligible parent items.
- Tracks assignees, status, priority, due dates, descriptions, and changes.
- Provides item-specific and application-wide activity history.
- Includes archive, hierarchy-aware restore, search, assignment filters, and overview counts.
- Supports English and Arabic interface languages, including mixed-language item names.
- Includes responsive desktop/mobile layouts and light/dark themes.

## Application architecture

The hosted demo is a static client-side application. Its data layer is an in-browser adapter that provides a consistent asynchronous interface over local browser storage.

```mermaid
flowchart TD
    Visitor[Team member / demo visitor] --> Auth[Demo sign-in screen]
    Auth --> Session[Tab session state]
    Auth --> UI[Application UI]
    UI --> Views[Projects, jobs, tasks and follow-ups]
    UI --> Search[Search and assignment filters]
    UI --> History[Activity history and archive]
    Views --> DataAPI[Team Follow-Up data access layer]
    Search --> DataAPI
    History --> DataAPI
    DataAPI --> Store[Browser-local data store]
    Store --> Items[Work items and hierarchy]
    Store --> Events[Activity events]
    Store --> Archive[Archived items]
    Store --> Profiles[Built-in team profiles]
```

This repository deliberately focuses on the application rather than cloud-specific deployment infrastructure. No separate server process is required for the current demo. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the component/data flow and the boundary intended for a future interchangeable backend.

## Loading, modal actions, and responsiveness

The interface uses revisioned in-memory indexes for item lookup, parent/child relationships, and Activity lookup. This keeps repeated rendering and sorting from rebuilding or scanning unrelated records unnecessarily.

- Opening **New Project/Job**, **New Child Item**, or **Edit** builds the dialog from the relevant item and its direct relationships. The New Project/Job form does not walk an unrelated hierarchy just to populate its type selector.
- The shared `allDescendants()` helper used by subtree validation/deletion is iterative and cycle-safe, so those operations do not depend on recursive call-stack depth. Other hierarchy renderers must keep their own visited-ID guards.
- Modal actions are handled by the modal event handler only; modal clicks are stopped before they can bubble into the workspace's delegated-action handler and dispatch a second action.
- Child item ordering uses the selected date mode and pre-indexed per-item Activity events; it does not repeatedly scan the entire Project/Job Activity timeline for every sort comparison.
- Loading remains local in the demo adapter. The above indexing and click-handling safeguards are shared frontend behavior, not a separate backend or deployment requirement.

The regression suite includes checks for modal click propagation, deep/cyclic hierarchy traversal, date sorting, Activity merge integrity, and UI structure. Run `npm test` and `npm run build` before publishing a frontend change.

The **Projects & Jobs** workspace Search sidebar starts collapsed. Its floating toggle updates sidebar visibility directly, cancels the queued top-level search timer, and invalidates in-flight search results before hiding the panel. Reopening continues to use the existing cached list and root-child loading flow; viewport changes preserve the selected collapsed/expanded state. Regression tests cover the toggle state and stale-response protection.

## System requirements

**For using the demo:** a current desktop or mobile browser with JavaScript enabled and browser storage available. No GPU, database server, cloud account, or special hardware is required. The demo is tested as a static browser application; persistent demo data requires the browser to allow site storage.

**For development:** Git to clone the repository, Node.js 20 or newer for the test/build scripts, and Python 3 if you want to use Python's built-in local HTTP server. A typical modern laptop or desktop is sufficient; 2 CPU cores, 4 GB RAM, and roughly 500 MB of free disk space are practical recommendations, not strict application limits. No third-party npm packages are currently required.

## Installation

Clone the repository and change into its root directory:

```bash
git clone https://github.com/retzed/Team_Follow-Up.git
cd Team_Follow-Up
```

No dependency installation is needed for the current demo. The application uses browser-native APIs, and the test/build scripts do not require third-party npm packages. Install Node.js 20 or newer only if you plan to run the validation/build commands.

## Run locally

You only need a modern browser to open `index.html`. For a more representative local setup, serve the project over HTTP:

**Python**

```bash
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

**Node.js development checks** (Node.js 20 or newer recommended)

```bash
npm test
npm run build
```

The static build is written to `dist/index.html`. No third-party package install is currently required for the application tests or build.

## Configuration

The browser-local demo is intentionally zero-configuration. It does not need a `.env` file, AWS account, Cognito configuration, API URL, backend server, or database setup. `scripts/build.mjs` replaces the runtime-configuration block with demo-only settings and explicitly clears AWS user-pool, client, and API values. Do not add production credentials or private data to the public repository.

To rebuild the static artifact after changing the source:

```bash
npm run build
```

The generated `dist/index.html` is the browser-loadable deployment artifact. Preview that artifact locally with:

```bash
python -m http.server 8000 --directory dist
```

Then open [http://localhost:8000](http://localhost:8000).

## API documentation

The public demo has **no HTTP/REST API** and makes no requests to a remote database. `TeamFollowUpDataApi` is an internal asynchronous JavaScript interface implemented in the browser; its built-in adapter persists the demonstration workspace in `localStorage`. Its method names are not externally callable HTTP endpoints.

For the separate Cognito/API Gateway/Lambda/DynamoDB implementation, see the [AWS deployment repository](https://github.com/retzed/Team_Follow-Up_AWS-Deployment), which documents that API contract.

## Executable artifact and deployed application

This is a browser-based web application, so a native `.exe`, `.jar`, or `.apk` package is not applicable. The deployable web artifact is `dist/index.html` plus `.nojekyll`; the GitHub Actions workflow builds it and publishes it to GitHub Pages.

- **Run the deployed demo:** [https://retzed.github.io/Team_Follow-Up/](https://retzed.github.io/Team_Follow-Up/)
- **Review deployment status/build:** [GitHub Actions — Test and deploy demo](https://github.com/retzed/Team_Follow-Up/actions/workflows/pages.yml)

The deployed URL runs the browser-local demo, not the AWS-backed shared-data application. Demo sign-in is not secure authentication, and data is not synchronized between different browsers/devices.

## Project structure

```text
.
├── index.html                 # Complete responsive UI and built-in demo adapter
├── package.json               # Local build and regression-test commands
├── PROJECT_GUIDE.md           # Step-by-step user and developer guide
├── RELEASE_NOTES.md           # Application-focused release notes
├── docs/
│   ├── ARCHITECTURE.md        # UI, data model, and browser storage architecture
│   └── DOCUMENTATION.md       # Full product, developer, security, and testing reference
├── scripts/
│   ├── build.mjs              # Create the static demo artifact
│   ├── check-syntax.mjs       # Parse inline JavaScript
│   └── test-*.mjs             # Regression tests for data/UI behavior
└── .github/
    └── workflows/
        └── pages.yml          # Test and publish the demo with GitHub Pages
```

## Development and contributions

- Read [PROJECT_GUIDE.md](PROJECT_GUIDE.md) before making changes.
- Keep the current demo functional without a server, external database, or cloud account.
- Add a regression test for behavior changes where practical. Run `npm test` before pushing.
- Work on feature branches and use pull requests to review larger changes.
- Keep secrets, personal information, credentials, generated output, and local environment files out of source control.

Changes pushed to `main` run the test suite and publish the demo through GitHub Pages. The deployment workflow is in [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

## Current scope and future work

**Included now:** the browser application, local demo sign-in, sample data, client-side persistence, UI/data regression tests, project documentation, and automated static-site publishing.

**Not included in the public demo:** shared multi-user persistence, real account authentication, a server-side API, or a production database. A future backend can be introduced behind the data access interface without tying the product to any particular cloud provider.
