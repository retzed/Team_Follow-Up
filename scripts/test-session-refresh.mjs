import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile('index.html', 'utf8');
const helperStart = html.indexOf("const WORKSPACE_VIEW_STATE_PREFIX='team-follow-up-tab-view-state-v2:';");
const helperEnd = html.indexOf('\nconst activityRefreshRequests=new Map();', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'User-specific view-state helpers must exist.');
const helperSource = html.slice(helperStart, helperEnd);

assert.match(html, /const tokenStorage=utils\.defaultStorage/, 'Cognito uses Amplify’s documented persistent browser defaultStorage.');
assert.ok(html.includes("typeof tokenStorage.clear!=='function'"), 'The supported Amplify storage interface is checked, including its clear operation.');
assert.ok(html.includes('tokenStorageProbeKey') && html.includes('browserStorageProbe') && html.includes('Amplify defaultStorage is not backed by browser localStorage.'), 'Startup verifies the Amplify storage provider writes to browser localStorage before restoring a session.');
assert.match(html, /CognitoIdentityServiceProvider\./, 'Existing sessionStorage Cognito tokens are migrated to persistent storage.');
assert.doesNotMatch(html, /tokenStorage=utils\.sessionStorage/, 'A failed legacy-token migration cannot silently downgrade the active session to tab-scoped storage.');
assert.ok(html.includes('migrationVerified') && html.includes('stored!==value'), 'Legacy Cognito tokens are removed from sessionStorage only after persistent-storage verification.');
assert.ok(html.includes('getCognitoAccessToken(forceRefresh=false)'), 'The authenticated session can explicitly refresh an access token without restarting the application.');
assert.ok(html.includes('this.getAccessToken({forceRefresh:true})'), 'An API 401 retries once with a forced-refreshed access token instead of immediately dropping the signed-in session.');
const authStart = html.indexOf('async function ensureAuthenticatedContext(){');
const authEnd = html.indexOf('\n function finishVisualAuth(context){', authStart);
assert.ok(authStart >= 0 && authEnd > authStart, 'Authenticated session restoration helper must exist.');
const authSource = html.slice(authStart, authEnd);
assert.ok(authSource.indexOf('fetchAuthSession()') < authSource.indexOf('getCurrentUser()'),
  'Token refresh/session validation must run before reading the Cognito user.');
assert.ok(authSource.includes('identityErrorName') && authSource.includes("if(!/NotAuthorizedException|UserUnAuthenticatedException/.test(identityErrorName))throw identityError;"),
  'Only stale Cognito authorization errors trigger a forced refresh; transient profile failures remain visible to session recovery.');
assert.ok(authSource.includes('identityErrorName') && authSource.includes('session=await state.modules.fetchAuthSession({forceRefresh:true})'),
  'A Cognito identity lookup rejected by a stale access token gets one forced-refresh retry before sign-in is reset.');
assert.ok(authSource.includes("if(!/NotAuthorizedException|UserUnAuthenticatedException/.test(identityErrorName))throw identityError;"),
  'Transient profile-attribute failures are rethrown for session-recovery handling instead of being converted to an unmapped user.');
assert.ok(html.includes('id="signInRetrySession"') && html.includes('async function retrySessionRestoration()'),
  'A retry path must be available when a temporary auth/network error prevents session restoration.');
assert.match(html, /else if\(isDefinitiveSessionError\((?:error|e)\)\)enterDefaultMode\(\);\s*else enterSessionRestoreMode\(\)/,
  'Only definitive expired/absent sessions return to the sign-in form; transient errors retain the session and expose retry.');

assert.ok(html.includes('window.__TEAM_FOLLOW_UP_CLEAR_VIEW_STATE?.();'), 'Explicit sign-out clears the saved page state for the current team profile.');

const hydrationStart = html.indexOf('async function startWorkspaceHydration(){');
const hydrationEnd = html.indexOf('\n}', hydrationStart);
assert.ok(hydrationStart >= 0 && hydrationEnd > hydrationStart, 'Workspace data hydration helper must exist.');
const hydrationHeader = html.slice(hydrationStart, hydrationStart + 900);
assert.doesNotMatch(hydrationHeader, /ui\.page='account';\s*ui\.accountTab='assigned'/,
  'Data refresh must not force the user back to Profile > Assigned Items.');
assert.ok(html.includes("if(!ui.selectedParentId&&data.parents.length)ui.selectedParentId=data.parents[0].id;"),
  'Only an empty selection may take the first available parent during progressive bootstrap.');
assert.ok(html.includes("const restoredParentState=await reconcileSelectedWorkspaceParent();") &&
          html.includes("restoredParentState==='missing'"),
  'The saved parent is verified by exact ID after bootstrap; only a confirmed missing item may use the fallback.');
assert.doesNotMatch(html, /if\(!data\.parents\.some\(parent=>String\(parent\.id\)===String\(ui\.selectedParentId\)\)\)ui\.selectedParentId=data\.parents\[0\]\?\.id\|\|'';/,
  'No final hydration block may override an unresolved or successfully restored parent selection.');
assert.ok(html.includes("const selectedParentId=String(ui.selectedParentId||'');const parent=data.parents.find(p=>String(p.id)===selectedParentId);"),
  'Detail rendering must compare normalized parent IDs and must not silently select the first item for a non-empty saved ID.');
assert.match(html, /if\(!dataLoadState\.active&&data\.parents\.length&&!data\.parents\.some\(p=>p\.id===ui\.selectedParentId\)\)ui\.selectedParentId=data\.parents\[0\]\.id;/,
  'Built-in startup must not erase the restored selection when its parent cache is empty.');
assert.ok(html.includes("if(restoredParentState==='missing'||(!ui.selectedParentId&&data.parents.length))ui.selectedParentId=data.parents[0]?.id||'';"),
  'Fallback selection is applied only when the exact-ID resolver confirms the saved parent is absent, or when there was no selection.');
assert.ok(html.includes("else if(ui.accountTab==='pinned'&&!ui.accountPinnedLoaded)void loadAccountPinnedItems();"),
  'A restored Pinned Items page reloads its own data instead of switching tabs.');
assert.ok(html.includes('restoredWorkspaceScrollY>0') && html.includes('window.scrollTo({top:restoredWorkspaceScrollY'),
  'The current scroll position is restored after the data refresh.');

const createMemoryStorage = (initial = []) => {
  const map = new Map(initial);
  return {
    map,
    getItem: key => map.has(String(key)) ? map.get(String(key)) : null,
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: key => map.delete(String(key))
  };
};
function createUi(overrides = {}) {
  return {
    actingUserId: 'u2', page: 'account', sidebarCollapsed: true, sidebarMode: 'search',
    selectedParentId: '', selectedAssignedItemId: null, tab: 'overview',
    parentQuery: '', parentType: 'all', parentStatus: 'all', parentDateMode: 'updated',
    parentDateFrom: '', parentDateTo: '', childQuery: '', childType: 'all', childStatus: 'all',
    childPriority: 'all', childDateMode: 'updated', childDateFrom: '', childDateTo: '',
    childScope: 'all', childSearchExpanded: false, accountTab: 'assigned',
    accountAssignedQuery: '', accountAssignedType: 'all', accountAssignedStatus: 'all',
    accountAssignedPriority: 'all', accountAssignedDateMode: 'updated',
    accountAssignedDateFrom: '', accountAssignedDateTo: '', accountSearchQuery: '',
    accountSearchType: 'all', accountSearchStatus: 'all', accountSearchDateMode: 'updated',
    accountSearchDateFrom: '', accountSearchDateTo: '', accountSearchUser: 'all',
    expanded: new Set(), modal: { kind: 'edit' }, ...overrides
  };
}
function createViewContext(ui, tabStorage, sharedBrowserStorage, scrollY = 0) {
  const listeners = {};
  const context = {
    ui, sessionStorage: tabStorage, localStorage: sharedBrowserStorage,
    window: { scrollY, addEventListener: (name, callback) => { listeners[name] = callback; } },
    Set, Number, Math, JSON, String, encodeURIComponent, console
  };
  vm.runInNewContext(
    helperSource + '\nthis.persistWorkspaceViewState=persistWorkspaceViewState;this.clearView=window.__TEAM_FOLLOW_UP_CLEAR_VIEW_STATE;this.restoredWorkspaceScrollY=restoredWorkspaceScrollY;',
    context
  );
  return { ...context, listeners };
}
const sharedBrowserStorage = createMemoryStorage();
// This is the stale shared view written by older releases. It must never be a
// fallback when a newly opened tab has no sessionStorage snapshot of its own.
const staleSharedView = JSON.stringify({
  version: 1, page: 'workspace',
  values: { selectedParentId: 'old-shared-project', tab: 'activity', parentQuery: 'stale shared tab' },
  expanded: ['old-shared-task'], scrollY: 999
});
sharedBrowserStorage.setItem('team-follow-up-view-state-v1:u2', staleSharedView);
const tabAStorage = createMemoryStorage();
const tabAUi = createUi({
  page: 'workspace', sidebarCollapsed: false, selectedParentId: 'project-42',
  selectedAssignedItemId: 'task-9', tab: 'activity', parentQuery: 'network',
  parentType: 'project', parentStatus: 'in-progress', parentDateMode: 'updated',
  parentDateFrom: '2026-10-01', parentDateTo: '2026-11-03', childQuery: 'review',
  childType: 'task', childPriority: 'high', childDateMode: 'created',
  childSearchExpanded: true, accountTab: 'pinned',
  expanded: new Set(['task-9', 'task-10']), modal: null
});
const firstContext = createViewContext(tabAUi, tabAStorage, sharedBrowserStorage, 584);
firstContext.persistWorkspaceViewState();
const tabAKey = 'team-follow-up-tab-view-state-v2:u2';
assert.ok(tabAStorage.getItem(tabAKey), 'The active view is stored in this tab session. New tab view state uses the v2 namespace.');
assert.equal(sharedBrowserStorage.getItem(tabAKey), null, 'View state is never written to browser-wide localStorage.');
assert.equal(sharedBrowserStorage.getItem('team-follow-up-view-state-v1:u2'), staleSharedView,
  'Saving one tab does not overwrite or remove another tab’s legacy shared-storage data.');
assert.equal(typeof firstContext.listeners.pagehide, 'function', 'A pagehide save is registered for hard refresh/unload.');
assert.ok(helperSource.includes('sessionStorage.setItem') && helperSource.includes('sessionStorage.getItem'),
  'The tab view store uses sessionStorage for both save and restore.');
assert.doesNotMatch(helperSource, /localStorage\.(?:getItem|setItem|removeItem)/,
  'The view-state helper does not read, write, or clear browser-wide localStorage.');
assert.ok(html.includes("for(const eventName of ['click','change','input'])window.addEventListener(eventName,scheduleWorkspaceViewStateSave,true);"),
  'Normal navigation, filtering and search interactions schedule a view-state save before browser unload.');

// A second tab in the same browser profile has a separate sessionStorage area.
// Its missing snapshot must leave the default view intact instead of inheriting
// the old localStorage snapshot saved by another tab.
const tabBStorage = createMemoryStorage();
const tabBUi = createUi();
const tabBContext = createViewContext(tabBUi, tabBStorage, sharedBrowserStorage);
assert.equal(tabBUi.page, 'account', 'A new tab starts on its own default page.');
assert.equal(tabBUi.selectedParentId, '', 'A new tab does not inherit another tab’s selected item.');
assert.equal(tabBUi.parentQuery, '', 'A new tab does not inherit another tab’s filters.');
assert.equal(tabBUi.tab, 'overview');
tabBUi.page = 'workspace';
tabBUi.selectedParentId = 'project-88';
tabBUi.tab = 'overview';
tabBUi.parentQuery = 'firewall';
tabBUi.childPriority = 'urgent';
tabBUi.expanded = new Set(['task-88']);
tabBContext.persistWorkspaceViewState();
assert.ok(tabBStorage.getItem(tabAKey), 'Tab B saves its view to its own sessionStorage.');
assert.notEqual(tabAStorage.getItem(tabAKey), null, 'Tab A’s saved state remains intact after Tab B saves.');
assert.equal(sharedBrowserStorage.getItem(tabAKey), null, 'Tab B also avoids browser-wide view storage.');

// A hard refresh of Tab A restores Tab A’s complete view, despite Tab B having
// a different current view in the same browser profile.
const refreshedTabAUi = createUi();
const refreshedTabAContext = createViewContext(refreshedTabAUi, tabAStorage, sharedBrowserStorage);
assert.equal(refreshedTabAUi.page, 'workspace');
assert.equal(refreshedTabAUi.selectedParentId, 'project-42');
assert.equal(refreshedTabAUi.selectedAssignedItemId, 'task-9');
assert.equal(refreshedTabAUi.tab, 'activity');
assert.equal(refreshedTabAUi.parentQuery, 'network');
assert.equal(refreshedTabAUi.parentStatus, 'in-progress');
assert.equal(refreshedTabAUi.childPriority, 'high');
assert.equal(refreshedTabAUi.accountTab, 'pinned');
assert.deepEqual([...refreshedTabAUi.expanded], ['task-9', 'task-10']);
assert.equal(refreshedTabAUi.modal, null, 'A browser refresh does not reopen an unfinished modal.');
assert.equal(refreshedTabAContext.restoredWorkspaceScrollY, 584, 'The refreshed tab restores its own scroll position.');
assert.equal(refreshedTabAUi.parentQuery, 'network');
assert.notEqual(tabBStorage.getItem(tabAKey), null,
  'Tab B retains its separate snapshot while Tab A is refreshed.');

// A hard refresh of Tab B restores only its own independently saved view.
const refreshedTabBUi = createUi();
createViewContext(refreshedTabBUi, tabBStorage, sharedBrowserStorage);
assert.equal(refreshedTabBUi.page, 'workspace');
assert.equal(refreshedTabBUi.selectedParentId, 'project-88');
assert.equal(refreshedTabBUi.tab, 'overview');
assert.equal(refreshedTabBUi.parentQuery, 'firewall');
assert.equal(refreshedTabBUi.childPriority, 'urgent');
assert.deepEqual([...refreshedTabBUi.expanded], ['task-88']);

// Existing per-tab v1 snapshots remain usable, but old browser-wide snapshots
// are deliberately ignored. The next successful save migrates this tab only.
const legacyTabStorage = createMemoryStorage([[
  'team-follow-up-view-state-v1:u2',
  JSON.stringify({
    version: 1, page: 'workspace',
    values: { selectedParentId: 'legacy-tab-project', tab: 'activity', parentQuery: 'legacy tab only' },
    expanded: ['legacy-task'], scrollY: 246
  })
]]);
const legacyTabUi = createUi();
const legacyTabContext = createViewContext(legacyTabUi, legacyTabStorage, sharedBrowserStorage);
assert.equal(legacyTabUi.selectedParentId, 'legacy-tab-project');
assert.equal(legacyTabUi.parentQuery, 'legacy tab only');
legacyTabContext.persistWorkspaceViewState();
assert.ok(legacyTabStorage.getItem(tabAKey), 'A legacy tab snapshot is migrated to the new session-only key after saving.');
assert.equal(legacyTabStorage.getItem('team-follow-up-view-state-v1:u2'), null,
  'The migrated legacy snapshot is removed from this tab only.');

// A different team identity in this tab has a separate view key and must not
// restore the previous identity's filters or selection.
sharedBrowserStorage.setItem('team-follow-up-view-state-v1:u3', staleSharedView);
const otherUserUi = createUi({ actingUserId: 'u3' });
createViewContext(otherUserUi, createMemoryStorage(), sharedBrowserStorage);
assert.equal(otherUserUi.page, 'account');
assert.equal(otherUserUi.selectedParentId, '');

// Explicit sign-out clears only this tab’s view snapshot; another tab's state
// and browser-wide authentication/data storage are not modified.
refreshedTabAContext.clearView();
assert.equal(tabAStorage.getItem(tabAKey), null, 'Sign-out clears the current tab’s v2 view snapshot.');
assert.notEqual(tabBStorage.getItem(tabAKey), null, 'Sign-out in Tab A does not clear Tab B’s view snapshot.');
assert.equal(sharedBrowserStorage.getItem('team-follow-up-view-state-v1:u2'), staleSharedView,
  'Clearing a tab view does not mutate browser-wide localStorage.');

const localAuthStart = html.indexOf("const LOCAL_SESSION_KEY='team-follow-up-local-auth-v2';");
const localAuthEnd = html.indexOf('\n screen.hidden=false;screen.lang=root.lang;screen.dir=root.dir;', localAuthStart);
assert.ok(localAuthStart >= 0 && localAuthEnd > localAuthStart,
  'The demo session implementation is a single extractable helper block.');
const localAuthSource = html.slice(localAuthStart, localAuthEnd);
assert.doesNotMatch(localAuthSource, /team-follow-up-local-auth-v1|LEGACY_LOCAL_SESSION_KEY/,
  'The retired demo-session migration is not shipped.');
assert.doesNotMatch(html, /for\(const storage of \[sessionStorage,localStorage\]\)/,
  'Cognito initialization does not clear demo-session markers from tab-scoped storage.');
assert.doesNotMatch(localAuthSource, /sessionStorage|window\.name|history\.state|history\.replaceState|location\.href|__team_follow_up_tab/,
  'Demo authentication is browser-profile based and does not consult tab-scoped or URL/history state.');
assert.ok(localAuthSource.includes('localStorage.setItem(LOCAL_SESSION_KEY,userId)') &&
          localAuthSource.includes('localStorage.getItem(LOCAL_SESSION_KEY)===userId'),
  'A demo sign-in is persisted and read back from the shared browser-profile store.');
assert.ok(localAuthSource.includes("localStorage.getItem(LOCAL_SESSION_KEY)||''"),
  'Startup restores the browser-wide identity directly from localStorage.');
assert.ok(localAuthSource.includes('localStorage.removeItem(LOCAL_SESSION_KEY)'),
  'Explicit sign-out removes the shared browser-profile identity.');
assert.ok(html.includes("const saved=restoreLocalSessionUser();if(validIds.includes(saved)){finishVisualAuth(makeLocalContext(saved,localTeamUsers.find(u=>u.id===saved)?.aliases[0]||''));return;}"),
  'Local authentication restores the saved browser identity before showing the credential form.');
assert.ok(html.includes("window.addEventListener('storage',handleLocalSessionStorageEvent)"),
  'Already-open tabs listen for browser-wide identity changes.');
assert.ok(html.includes('finishVisualAuth(makeLocalContext(id,username))'),
  'A browser-wide session change updates an already-running application instance.');
assert.ok(html.includes("if(cfg.localAuth?.enabled===true&&!hasCognitoConfigurationAttempt()){initializeLocalAuth();return;}"),
  'The public demo selects local-session restoration before entering the Cognito flow.');

const browserStorage = createMemoryStorage();
const browserContextA = {
  validIds: ['u1','u2','u3','u4','u5','u6','root'],
  localStorage: browserStorage,
  console
};
vm.runInNewContext(localAuthSource +
  '\nthis.persist=persistLocalSessionUser;this.restore=restoreLocalSessionUser;this.clear=clearLocalSessionUser;',
  browserContextA);
assert.equal(browserContextA.persist('u2'), true);
assert.equal(browserStorage.getItem('team-follow-up-local-auth-v2'), 'u2');
assert.equal(browserContextA.restore(), 'u2');

const browserContextB = { ...browserContextA, localStorage: browserStorage };
vm.runInNewContext(localAuthSource + '\nthis.restore=restoreLocalSessionUser;', browserContextB);
assert.equal(browserContextB.restore(), 'u2',
  'A separate tab in the same browser profile restores exactly the same browser-wide user.');

// Signing in as a different demo user in any tab changes the one shared identity.
assert.equal(browserContextB.persist('u3'), true);
assert.equal(browserContextA.restore(), 'u3',
  'A sign-in from another tab changes the shared browser-profile identity for every tab.');

// A separate browser profile has its own website storage and identity.
const isolatedBrowserContext = {
  ...browserContextA,
  localStorage: createMemoryStorage()
};
vm.runInNewContext(localAuthSource +
  '\nthis.persist=persistLocalSessionUser;this.restore=restoreLocalSessionUser;',
  isolatedBrowserContext);
assert.equal(isolatedBrowserContext.restore(), '');
assert.equal(isolatedBrowserContext.persist('u4'), true);
assert.equal(browserContextA.restore(), 'u3',
  'Another browser profile is isolated because it has a different localStorage area.');

// Explicit sign-out clears the shared browser identity for all tabs.
browserContextA.clear();
assert.equal(browserStorage.getItem('team-follow-up-local-auth-v2'), null);
assert.equal(browserContextB.restore(), '',
  'A tab in the same browser profile sees the signed-out state on its next read.');

console.log('Session-refresh tests passed: persistent browser-profile identity, shared same-origin tabs, separate profile isolation, explicit sign-out, and no tab-scoped authentication.');
