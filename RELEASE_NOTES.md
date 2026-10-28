# Application Release Notes

## 28 October 2026 — Account Search, profile layout, navigation and mobile hardening

- Added type, status, date sort, inclusive From/To date-range, user, and Clear controls to Account Search. Query matching includes Arabic names, descriptions, and creator/updater/owner/assignee identity information.
- Added explicit **Open in workspace** and **Activity history** actions to Search results and history actions to Assigned/Pinned results. Opening items switches away from My Account; child navigation expands Task ancestors after lazy root hydration before scrolling the selected item into view.
- Removed the privilege textbox from the profile form while preserving the privilege indicator beside the name. Renamed the Arabic label to **Label (Arabic)**, placed both labels together, and moved Profile icon to the final personal-detail field.
- Hardened account Search matching for canonical AWS identity fields as well as demo aliases. Removed meaningless keyboard focus from result cards that are not actions.
- Adjusted the Search filter grid for widths up to 820 CSS pixels, constrained date/select controls to their grid columns, and allowed result actions to wrap on mobile.
- Added regression assertions for all of the above. Public CI checks JavaScript syntax, data API behavior, seed data, progressive loading, history, UI behavior, and the static demo build; it does not substitute for manual visual checks on every browser/device.

This is a browser UI/data-selection change only. The public demo remains local-storage-only and uses demonstration sign-in; it does not become a shared database or a production authentication system.

## 28 October 2026 — Workspace Search collapse stability

- Fixed Search sidebar close handling by separating visibility state updates from the full translation refresh.
- Invalidated delayed and in-flight sidebar query results on close to prevent stale list renders after collapse.
- Defaulted workspace Search to collapsed, including navigation from Account, while preserving the chosen state across viewport changes.
- Added regression tests for DOM visibility, accessible expanded state, timer cancellation, query-sequence invalidation, and open/close behavior.

## Current public demo

- Bilingual English/Arabic workspace for projects, jobs, tasks, and follow-ups.
- Search and assignment views, item metadata, priority/status controls, item and application-wide activity history, archive, and hierarchy-aware restore.
- Responsive desktop/mobile interface with light and dark themes.
- Mixed Arabic/English item-name handling and localized activity labels.
- Built-in team demo identities and browser-local workspace persistence.
- Automated regression tests for JavaScript syntax, local data behavior, activity history, archive/restore, search, language rendering, and UI refinements.
- GitHub Actions workflow that tests, builds, and publishes the static demo with GitHub Pages.

## 16 October 2026 — Frontend responsiveness and reliability

- Prevented modal clicks from reaching the outer workspace delegate and dispatching the same action a second time.
- Replaced recursive descendant collection with an iterative, cycle-safe traversal and added early-exit checks for parent-type validation.
- Removed unnecessary full-root Activity lookups from child timestamp comparisons by using the existing per-item Activity index.
- Added regression coverage for modal event propagation, cyclic/deep hierarchies, selected child sort modes, and Activity timestamp lookup behavior.
- These changes affect the browser UI/runtime only. They do not add a remote API, change the demo storage model, or change the GitHub Pages artifact/deployment contract.

Validation: `npm test` and `npm run build`; deployment runs through [the Pages workflow](.github/workflows/pages.yml).

## Demo limitations

- Username-based demo sign-in accepts any non-empty password and is not real authentication.
- Workspaces persist only in the current browser's local storage; there is no cross-device or shared team database.
- A server-side backend is not included in the public application repository. Backend technology and hosting will be chosen separately if shared persistence is required.
