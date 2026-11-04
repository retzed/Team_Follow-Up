# Application Release Notes

## 4 November 2026 — Retain the selected parent through refresh reconciliation

- Parent selection now writes the current per-tab view snapshot immediately when a Project/Job or assigned child is opened.
- After all parent pages load, the app resolves the exact saved parent ID if it is not in the list. It only falls back when the resolver confirms the parent is missing; temporary resolver failures retain the selection.
- Removed the final unconditional first-parent reset and made detail lookup compare normalized IDs. Added regression coverage for present, missing, and temporarily unresolvable selections.

## 4 November 2026 — Keep off-page parent selections during refresh

- The first page of top-level Projects/Jobs is no longer treated as the complete parent set. Bootstrap follows every continuation page before validating the saved selection.
- This prevents a selected parent beyond the first 100 updated records from being replaced by the newest parent during refresh.
- The same paginated bootstrap path is used for local demo data and API-backed mode; per-tab `sessionStorage` isolation is unchanged.

## 4 November 2026 — Preserve selected workspace item on refresh

- Keep the saved parent selection while the startup data set is empty; reconcile it only when cached or fully hydrated parent records are available.
- Refresh now returns to the same selected Project or Job instead of defaulting to the latest-updated parent.
- Added regression coverage for empty-cache startup and post-hydration selection validation.

## 4 November 2026 — Browser-wide demo sign-in and tab-isolated views

- The demo identity remains browser-profile scoped in `localStorage`, so all same-origin tabs use the same active demo identity and cross-tab sign-in/sign-out changes are synchronized.
- Workspace/page view state now uses a versioned `sessionStorage` key, scoped to the current tab and team identity. Refreshing a tab restores its own page, selection, filters, expanded rows, and scroll position without changing another tab.
- The old shared `localStorage` view-state fallback has been removed. Legacy v1 data is migrated only from the current tab's `sessionStorage`; old browser-wide view snapshots are ignored.
- Regression coverage now verifies two tabs with different views, refresh restoration, no cross-tab view inheritance/overwrite, legacy tab-state migration, and tab-local sign-out cleanup.

This remains demonstration sign-in, not secure authentication. The public GitHub Pages build has no server-managed session or production account security.
## 3 November 2026 — Real-time Activity history

- Extended the demo's cross-tab item-change handler to fetch Activity rows only for the changed item IDs, then merge those rows into the workspace Activity index and application-wide history cache.
- Refreshes the currently selected project's Activity view and an open item-history view when their root is affected. Global Activity history now uses a visible refresh when its cache is invalidated, avoiding a silent refresh superseding the visible one.
- Added regression coverage for changed-item Activity reads, local workspace merge, selected timeline refresh, and global-history refresh.


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
- Fixed the underlying blank-workspace layout defect: collapsed mode now uses a single flexible grid column instead of leaving the main content in a zero-width first track.

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
