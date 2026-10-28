# Team Follow-Up Application — Complete Documentation

This document describes the current implementation in the **Team Follow-Up demo application repository**. It covers the product behavior, data model, code organization, local execution, regression testing, deployment, and security boundaries.

- Demo repository: https://github.com/retzed/Team_Follow-Up
- Hosted demo: https://retzed.github.io/Team_Follow-Up/
- Step-by-step contributor guide: [PROJECT_GUIDE.md](../PROJECT_GUIDE.md)
- Architecture and data flow: [ARCHITECTURE.md](ARCHITECTURE.md)
- AWS-backed implementation and infrastructure: https://github.com/retzed/Team_Follow-Up_AWS-Deployment

The demo and AWS-backed application have intentionally different persistence and authentication models. This document does not describe the AWS repository as if its backend were running behind the demo site.

## 1. Product overview

Team Follow-Up is a bilingual workspace for following project work, temporary jobs, tasks, follow-ups, assignments, priorities, and activity history. It offers responsive desktop/mobile layouts, English/Arabic interface labels, right-to-left support, light/dark themes, search, assignment views, and hierarchy-aware archive/restore behavior.

### Built-in demonstration profiles

The demo includes six selectable team identities:

| User ID | Display name | Role label | English / Arabic sign-in name |
|---|---|---|---|
| `u1` | Marwa | Team Leader | `Marwa` / `مروة` |
| `u2` | Zyad | AWS Engineer | `Zyad` / `زياد` |
| `u3` | Nadine | AWS Engineer | `Nadine` / `نادين` |
| `u4` | Omar | AWS Engineer | `Omar` / `عمر` |
| `u5` | Haneen | AWS Engineer | `Haneen` / `حنين` |
| `u6` | Dina | AWS Engineer | `Dina` / `دينا` |
| `root` | root | Protected root profile | `root` |

These roles and profiles are demonstration data, not an authorization system. The entered sign-in username selects the identity but is not displayed in normal application UI; **Name** in Profile is the user-facing display name. For each standard demo identity, the first non-empty password is accepted once and then stored as a salted PBKDF2-HMAC-SHA-256 hash; subsequent sign-ins verify it. Clearing or editing browser-local storage can reset or bypass this simulation. The protected demo `root` identity starts with `root@1234` and verifies it using PBKDF2-HMAC-SHA-256 (210,000 iterations). Changed demo passwords are stored as salted PBKDF2-HMAC-SHA-256 hashes in this browser's local storage. This remains a demo-only simulation: users control the browser and can inspect/modify local data, so it is not production authentication. The AWS application continues to authenticate and change passwords through Cognito.

### Account page

The application opens on **My Account → Assigned Items**. Account tabs are **Profile**, **Assigned Items**, **Pinned Items**, and **Search**. Profile fields include display name, optional Arabic display name, phone, e-mail, icon, label, and optional Arabic label. The icon selector lists icon names and previews the current selection before saving. Theme and language changes apply immediately and persist independently of the Profile **Save changes** button. Password changes use the provider appropriate to the deployment: browser-local password simulation in this demo and Cognito in AWS. Pinned items are stored per user.

### Main capabilities

- Create and edit Projects, Jobs, Tasks, and Follow-ups.
- Validate the supported parent/child hierarchy.
- Assign work, change statuses and priorities, and maintain creator/update metadata.
- Mark important work using the star/maximum-priority control.
- Search and filter project/job lists, child items, and assignments.
- Open item-specific or application-wide activity history and search activity by relevant fields.
- Archive items and restore selected archived records only when their required parent hierarchy is available.
- Switch interface language and theme while preserving user-entered work text.
- Use compact cards, dialogs, and controls on mobile screens as well as expanded desktop views.

## 2. Work-item rules

Projects and Jobs are top-level work containers. They cannot be created as children.

| Item type | Allowed parent | Allowed children |
|---|---|---|
| Project | None | Tasks and direct Follow-ups |
| Job | None | Direct Follow-ups only |
| Task | Project | Follow-ups |
| Follow-up | Project, Job, or Task | None |

The client enforces these rules to guide the user and avoid invalid forms. The demo's checks run entirely in the browser and are not a security boundary.

### Common item fields

A work item can contain an identifier, item type, name, description, parent/root references where applicable, creator, assignee, status, priority, creation/update timestamps, and applicable due-date information. The UI labels the status and priority values using the selected interface language; the persisted values remain stable machine-readable values.

Supported statuses are:

- `not-started`
- `in-progress`
- `on-hold`
- `completed`

Child items use the priority scale `low`, `medium`, `high`, and `urgent`. The important/star control raises an item to the maximum priority. Status/assignment changes and item edits are expected to produce activity entries.

## 3. Search, assignment, history, and archive behavior

### Search and assignment views

The workspace sidebar remains a **Search** view over Projects and Jobs. It is expanded by default and can be expanded or collapsed using its floating toggle. **Assigned Items** is available in the account page rather than as a second sidebar mode; the account page's Search tab also searches Projects and Jobs without leaving that page. Workspace filters support type, status, date ranges, and text queries. Child-item filters scope results to the selected Project or Job. For a Job, only its direct Follow-ups are eligible; Tasks remain Project-only.

The interface includes clear/reset controls so a user can return to an unfiltered view. Counts reflect the active item scope rather than silently mixing different hierarchy levels.

### Activity history

Activity history is a first-class part of the data model. The UI supports selected-item history and broader history for the selected root where applicable. Activity rows retain the affected item, root/parent context, actor, action/kind, and timestamp needed for display and filtering. Newest activity appears first.

Mutations should not silently bypass the audit stream. When a change generates multiple related activity rows, the adapter normalizes and merges them using event identity to avoid duplicate events. If activity handling is modified, run the data API, activity coverage, merge-idempotency, and history-structure tests.

### Archive and restore

Archive entries preserve the item snapshot and relevant parent/root names and identifiers. Restoring a child requires its parent to exist as an active item or to be restored in the same selection in valid hierarchy order. The UI should make restore validation failures visible instead of creating orphaned children.

## 4. Runtime requirements

### Using the hosted demo

A current Chrome, Edge, Firefox, or Safari browser is recommended, with JavaScript and site storage enabled. The application needs no GPU, database server, cloud account, or special hardware.

The app persists data in browser storage when available. Browser privacy settings, private browsing restrictions, storage quota limits, or clearing site data can remove or prevent persistence. Do not use the public demo for confidential, business-sensitive, or personal information.

### Developing and testing

| Tool | Requirement | Purpose |
|---|---|---|
| Git | Current version | Clone the source repository and manage changes |
| Node.js and npm | Node.js 20 or newer | Run JavaScript syntax/data/UI tests and build the static artifact |
| Python | Python 3 | Optional local HTTP server |
| Modern browser | Current version | Manual interaction and responsive-layout validation |

No third-party npm packages are currently required. A normal modern development computer is sufficient; 2 CPU cores, 4 GB RAM, and roughly 500 MB free disk space are practical recommendations, not enforced minimums.

## 5. Install and run locally

### Get the source

```bash
git clone https://github.com/retzed/Team_Follow-Up.git
cd Team_Follow-Up
```

### Run a local HTTP server

From the repository root, where `index.html` resides:

```bash
python -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000). Stop the server with `Ctrl+C`.

Opening `index.html` directly can work, but the local HTTP server provides more consistent origin and browser-storage behavior.

### Sign in to the demo

1. Enter one of the six English or Arabic usernames from Section 1.
2. Enter any non-empty password.
3. Sign in and explore the current workspace.
4. Use **Reset demo data** to restore the starter dataset in this browser.

A login only sets the acting demonstration identity. It does not protect a user account.

## 6. Source layout and code organization

| Path | Responsibility |
|---|---|
| `index.html` | HTML shell, styles, responsive layouts, translation labels, demo sign-in gate, data adapter, renderers, dialogs, event handlers, and startup |
| `scripts/build.mjs` | Builds the static artifact and forces the browser-local demo configuration |
| `scripts/check-syntax.mjs` | Parses the embedded executable JavaScript blocks |
| `scripts/test-data-api.mjs` | Regression checks for the data-access adapter and local persistence behavior |
| `scripts/test-demo-build.mjs` | Ensures the public artifact has demo auth/data settings and no remote API credentials/configuration |
| `scripts/test-output-escaping.mjs` | Exercises the central HTML-output escaping helper |
| `scripts/test-activity-write-coverage.mjs` | Checks that item mutations maintain activity history |
| `scripts/test-activity-merge-idempotency.mjs` | Checks duplicate activity merge behavior |
| `scripts/test-history-structure.mjs` | Checks history scope, structure, and display contract |
| `scripts/test-child-search-arabic-activity.mjs` | Checks child search and bilingual activity rendering |
| `scripts/test-progressive-loading.mjs` | Checks progressive UI loading behavior |
| `scripts/test-ui-refinements.mjs` | Checks key UI structure and responsive refinements |
| `package.json` | Defines the local build and test commands |
| `PROJECT_GUIDE.md` | User/developer guide and GitHub Pages instructions |
| `docs/ARCHITECTURE.md` | System boundary, component responsibilities, data flow, and future backend boundary |
| `.github/workflows/pages.yml` | Runs tests/build and publishes the static GitHub Pages artifact |

### Internal structure of the HTML source

The application keeps its public distribution self-contained. Within `index.html`, the work is separated into script-level responsibilities:

1. Early language, direction, and theme preference bootstrap.
2. Runtime configuration block overwritten by the build script.
3. Data-access adapter and conversion/normalization helpers.
4. Authentication gate that chooses the demo sign-in flow.
5. Main UI controller for state, rendering, list/search logic, activity refresh, dialogs, and delegated interactions.
6. Layout compatibility fixes for the finished responsive interface.

JavaScript functions use descriptive camelCase names; persisted item/status identifiers use stable machine-readable values; reusable conversion, activity, storage, filtering, and rendering helpers reduce duplicated logic. Python code in the separate AWS repository follows snake_case conventions. Keep security-sensitive behavior and storage/API details behind the respective data-access boundaries.

The one-file presentation source is a deliberate static-distribution choice, but its large size is a maintainability trade-off. Future extraction into multiple JavaScript/CSS modules should be staged and should preserve script order, authentication gating, build-time configuration replacement, selectors, and regression coverage.

### Modal actions, hierarchy traversal, and Activity-index behavior

The modal container is inside the main application DOM tree. Its delegated click handler stops propagation before processing `data-action` controls, and the outer workspace delegate ignores clicks whose target is inside the modal root. Keep this single-owner event model intact when adding modal actions; otherwise one click could dispatch twice, especially if the first handler replaces the dialog DOM.

Hierarchy lookups are built through an indexed parent/child map. Full descendant collection is iterative and keeps a visited set, so deeply nested or cyclic input cannot recurse indefinitely. Type selection should use direct-child lookups when that matches the validation rule rather than enumerating every descendant during modal rendering.

The Activity index groups normalized events by both item and root. Child sorting reads the child's indexed timeline, instead of repeatedly scanning the entire root timeline during a comparator call. Root history remains scoped to its root as intended.

These rules are covered by `scripts/test-progressive-loading.mjs` and `scripts/test-child-search-arabic-activity.mjs`. When changing these paths, run `npm test` and `npm run build`; the GitHub Pages workflow publishes only after the test/build job succeeds. These optimizations do not alter the demo's browser-local persistence or turn it into a shared backend.

## 7. Data access and storage model

The built-in adapter maintains four logical collections:

- **Work items:** active items, hierarchy references, assignment, status/priority, and timestamps.
- **Activity events:** event identity, actor, affected item, hierarchy context, action/kind, and time.
- **User profiles:** six built-in demonstration identities and display-role labels.
- **Archive records:** deleted snapshots with archive and parent/root context.

The local adapter emulates common access patterns using derived fields for top-level lists, parent queries, workspace/root views, assignment lists, and timestamp ordering. Those derived keys are for local application behavior and future adapter compatibility; they do not turn browser storage into DynamoDB.

### Storage and isolation

- `localStorage` stores the demo workspace and its built-in logical tables.
- `sessionStorage` remembers the active demo identity for the tab.
- Demo users within the same profile see the same local workspace.
- Different browsers/devices/profiles/incognito windows do not share state.
- There is no synchronized multi-user database, server backup, or cross-device data transfer.

The data is editable by the visitor through browser developer tools. Local persistence is not durable storage for important work.

## 8. Build, test, and publish

Run the full regression suite from the repository root:

```bash
npm test
```

Build the static artifact:

```bash
npm run build
```

The result is `dist/index.html` plus `dist/.nojekyll`. The build script explicitly sets the public demo to the built-in local data mode and enables the local demonstration sign-in. It clears Cognito identifiers and the remote API URL so the published demo cannot accidentally point at a configured AWS endpoint.

### GitHub Pages workflow

The workflow in `.github/workflows/pages.yml` runs tests and builds on changes. Pushes to `main` publish the built `dist` artifact after the build job succeeds; pull requests validate without publishing. Ensure **Settings → Pages → Source** is configured for **GitHub Actions**.

The Pages artifact contains the static application, not the full source repository as a website root.

## 9. Security, privacy, and error handling

This repository is a demonstration, **not a production application**.

- The public demo is not a security boundary. PBKDF2 protects the representation of locally changed passwords from plain-text storage, but the code and root credential record are shipped to the browser and users can inspect or edit browser-local data.
- The workspace and all client-side code are visible to the visitor.
- Do not put real credentials, secrets, customer information, employee-sensitive notes, or confidential project data in the demo.
- Keep production keys and real identity mappings out of HTML, sample datasets, configuration, source control, and CI logs.
- Use the central `esc()` helper before interpolating untrusted values into HTML templates. Prefer `textContent` where markup is not required.
- Continue catching storage/bootstrap/network failures and presenting a useful failure or fallback state without exposing tokens or internal secrets.
- Client-side hierarchy checks improve usability only; authorization must be enforced server-side in a production deployment.
- Do not interpret passing frontend tests as proof of production security or live-service availability.

The separate AWS repository is the appropriate place to review the production-oriented trust boundary: Cognito JWT validation, trusted user-profile mapping, Lambda-side hierarchy/field validation, server-owned timestamps/index fields, least-privilege DynamoDB access, and append-oriented activity writes. The public demo remains disconnected from that runtime.

## 10. Troubleshooting

**The sign-in fails.** Use one of the six standard demo identities (English or Arabic alias), or use `root` with its initial `root@1234` password. If a standard demo user's password was changed in this browser, sign in with that saved password.

**A different teammate sees the same items.** This is expected: the demo profiles share one workspace in the same browser profile.

**Changes do not persist after closing the browser.** Check whether site storage is blocked, the browser is in a privacy mode, or the site's data was cleared. The app can fall back to memory when storage fails, in which case changes may not survive.

**The demo data looks wrong after a prior test.** Use **Reset demo data** to restore the starter dataset for the current browser.

**Tests fail.** Run `npm test`, read the first failing assertion, and inspect the associated test in `scripts/` before changing behavior. Add or update a regression test when requirements intentionally change.

**The site did not publish.** Check the latest GitHub Actions run, confirm Pages is configured to use GitHub Actions, and verify the build/deploy jobs succeeded.

**The team needs shared, synchronized work data.** The current demo does not provide it. Review the separate AWS implementation and treat backend authentication, API authorization, data migration, monitoring, recovery, and cost controls as a dedicated deployment effort.


## Account page updates (28 October 2026)

The application opens on **My Account → Assigned Items** and the username control in the top bar opens **Profile**. Account tabs are **Profile**, **Assigned Items**, **Pinned Items**, and **Search**. Search in My Account filters the loaded Projects/Jobs; the Projects workspace retains its own Search tab, now collapsible/expandable with a floating button (expanded by default). The old “Assigned to me” sidebar mode is removed.

Profile fields include the display name (not the login username), optional Arabic display-name text, phone number, e-mail, icon, label, optional Arabic label, and a read-only privilege. Display name and label Arabic variants are used when Arabic is selected. The icon selector lists icon names, includes modern outline icons such as `cowboy-hat`, and previews the selection before saving. **Save changes** saves profile fields only. Theme and language changes apply immediately and persist independently. The password form validates the current password and confirmation before requesting a password change.

The local demo stores profile preferences, Arabic display-name/label variants, and pin IDs in its browser-local table simulation. Root is read-only in the app profile editor; its demo credential hash and changed demo password records are browser-local and must not be treated as secure server-side secrets.
