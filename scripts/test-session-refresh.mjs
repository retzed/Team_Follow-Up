import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile('index.html', 'utf8');
const helperStart = html.indexOf("const WORKSPACE_VIEW_STATE_PREFIX='team-follow-up-view-state-v1:';");
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
assert.match(html, /if\(!ui\.selectedParentId&&data\.parents\.length\)[\s\S]*?meta\.done===true/,
  'Progressive bootstrap must preserve a selected parent until the complete parent set has been checked.');
assert.ok(html.includes("else if(ui.accountTab==='pinned'&&!ui.accountPinnedLoaded)void loadAccountPinnedItems();"),
  'A restored Pinned Items page reloads its own data instead of switching tabs.');
assert.ok(html.includes('restoredWorkspaceScrollY>0') && html.includes('window.scrollTo({top:restoredWorkspaceScrollY'),
  'The current scroll position is restored after the data refresh.');

const createMemoryStorage = () => {
  const map = new Map();
  return {
    map,
    getItem: key => map.has(String(key)) ? map.get(String(key)) : null,
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: key => map.delete(String(key))
  };
};
const initialUi = {
  actingUserId: 'u2', page: 'workspace', sidebarCollapsed: false, sidebarMode: 'search',
  selectedParentId: 'project-42', selectedAssignedItemId: 'task-9', tab: 'activity',
  parentQuery: 'network', parentType: 'project', parentStatus: 'in-progress',
  parentDateMode: 'updated', parentDateFrom: '2026-10-01', parentDateTo: '2026-11-03',
  childQuery: 'review', childType: 'task', childStatus: 'all', childPriority: 'high',
  childDateMode: 'created', childDateFrom: '', childDateTo: '', childScope: 'all',
  childSearchExpanded: true, accountTab: 'pinned', accountAssignedQuery: '',
  accountAssignedType: 'all', accountAssignedStatus: 'all', accountAssignedPriority: 'all',
  accountAssignedDateMode: 'updated', accountAssignedDateFrom: '', accountAssignedDateTo: '',
  accountSearchQuery: '', accountSearchType: 'all', accountSearchStatus: 'all',
  accountSearchDateMode: 'updated', accountSearchDateFrom: '', accountSearchDateTo: '',
  accountSearchUser: 'all', expanded: new Set(['task-9', 'task-10']), modal: null
};
const storage = createMemoryStorage();
const persistentStorage = createMemoryStorage();
const listeners = {};
const firstContext = {
  ui: initialUi,
  sessionStorage: storage,
  localStorage: persistentStorage,
  window: { scrollY: 584, addEventListener: (name, callback) => { listeners[name] = callback; } },
  Set, Number, Math, JSON, String
};
vm.runInNewContext(helperSource + '\nthis.persistWorkspaceViewState=persistWorkspaceViewState;', firstContext);
firstContext.persistWorkspaceViewState();
assert.ok(storage.getItem('team-follow-up-view-state-v1:u2'), 'The page state is stored in the current browser tab session.');
assert.ok(persistentStorage.getItem('team-follow-up-view-state-v1:u2'), 'A persistent per-user backup is stored as each view change is saved.');
assert.ok(html.includes("for(const eventName of ['click','change','input'])window.addEventListener(eventName,scheduleWorkspaceViewStateSave,true);"), 'Normal navigation, filtering and search interactions schedule a view-state save before browser unload.');
assert.equal(typeof listeners.pagehide, 'function', 'A pagehide save is registered for browser refresh/unload.');

const refreshedUi = {
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
  expanded: new Set(), modal: { kind: 'edit' }
};
const secondContext = {
  ui: refreshedUi,
  sessionStorage: storage,
  localStorage: persistentStorage,
  window: { scrollY: 0, addEventListener() {} },
  Set, Number, Math, JSON, String
};
vm.runInNewContext(helperSource + '\nthis.restoredWorkspaceScrollY=restoredWorkspaceScrollY;', secondContext);
assert.equal(refreshedUi.page, 'workspace');
assert.equal(refreshedUi.selectedParentId, 'project-42');
assert.equal(refreshedUi.selectedAssignedItemId, 'task-9');
assert.equal(refreshedUi.tab, 'activity');
assert.equal(refreshedUi.parentQuery, 'network');
assert.equal(refreshedUi.childPriority, 'high');
assert.equal(refreshedUi.accountTab, 'pinned');
assert.deepEqual([...refreshedUi.expanded], ['task-9', 'task-10']);
assert.equal(refreshedUi.modal, null, 'A browser refresh does not reopen an unfinished modal.');
assert.equal(secondContext.restoredWorkspaceScrollY, 584);
const fallbackSessionStorage = createMemoryStorage();
const fallbackUi = { ...refreshedUi, page: 'account', selectedParentId: '', selectedAssignedItemId: null, tab: 'overview', expanded: new Set() };
const fallbackContext = {
  ui: fallbackUi, sessionStorage: fallbackSessionStorage, localStorage: persistentStorage,
  window: { scrollY: 0, addEventListener() {} }, Set, Number, Math, JSON, String
};
vm.runInNewContext(helperSource + '\nthis.restoredWorkspaceScrollY=restoredWorkspaceScrollY;', fallbackContext);
assert.equal(fallbackUi.page, 'workspace', 'Persistent view state restores the last opened application page when tab-scoped state is unavailable.');
assert.equal(fallbackUi.selectedParentId, 'project-42', 'Persistent view state restores the selected parent.');
assert.equal(fallbackUi.tab, 'activity', 'Persistent view state restores the open detail tab.');
const otherUserUi = { ...refreshedUi, actingUserId: 'u3', page: 'account', selectedParentId: '' };
const thirdContext = {
  ui: otherUserUi, sessionStorage: storage, localStorage: persistentStorage,
  window: { scrollY: 0, addEventListener() {} }, Set, Number, Math, JSON, String
};
vm.runInNewContext(helperSource + '\nthis.restoredWorkspaceScrollY=restoredWorkspaceScrollY;', thirdContext);
assert.equal(otherUserUi.page, 'account', 'View state is isolated per signed-in team profile.');
assert.equal(otherUserUi.selectedParentId, '');

const clearContext = { ...secondContext, ui: refreshedUi };
vm.runInNewContext(helperSource + '\nthis.clearView=window.__TEAM_FOLLOW_UP_CLEAR_VIEW_STATE;', clearContext);
clearContext.clearView();
assert.equal(storage.getItem('team-follow-up-view-state-v1:u2'), null, 'Explicit sign-out clears the tab-scoped view state.');
assert.equal(persistentStorage.getItem('team-follow-up-view-state-v1:u2'), null, 'Explicit sign-out also clears the persistent view-state backup.');

if (html.includes('function initializeLocalAuth(){')) {
  assert.ok(html.includes('function localSessionTabStorageKey(){') && html.includes('function restoreLocalSessionUser(){') && html.includes('function persistLocalSessionUser(teamUserId)') && html.includes('function clearLocalSessionUser()'),
    'The demo identity uses a dedicated tab-scoped persistence helper.');
  assert.doesNotMatch(html, /localStorage\.(?:getItem|setItem|removeItem)\(LOCAL_SESSION_KEY\)/,
    'Demo tabs do not share one global localStorage identity key.');

  const localAuthStart = html.indexOf('function localSessionTabStorageKey(){');
  const localAuthEnd = html.indexOf('\n screen.hidden=false;screen.lang=root.lang', localAuthStart);
  assert.ok(localAuthStart >= 0 && localAuthEnd > localAuthStart, 'Tab-scoped demo session helpers must be extractable for isolated regression tests.');
  const localAuthSource = html.slice(localAuthStart, localAuthEnd);
  const sharedDemoStorage = createMemoryStorage();
  const tabOneSession = createMemoryStorage();
  const tabOneWindow = { name: '', crypto: { randomUUID: () => 'tab-one-identity' } };
  const tabOneContext = {
    validIds: ['u1','u2','u3','u4','u5','u6','root'],
    LOCAL_SESSION_KEY: 'team-follow-up-local-auth-v1',
    LOCAL_TAB_NAME_MARKER: '|__TEAM_FOLLOW_UP_LOCAL_TAB_V1__:',
    window: tabOneWindow, sessionStorage: tabOneSession, localStorage: sharedDemoStorage,
    String, Date, Math
  };
  vm.runInNewContext(localAuthSource + '\nthis.persist=persistLocalSessionUser;this.restore=restoreLocalSessionUser;this.clear=clearLocalSessionUser;this.key=localSessionTabStorageKey;', tabOneContext);
  tabOneContext.persist('u2');
  const tabOneKey = tabOneContext.key();
  assert.equal(tabOneSession.getItem('team-follow-up-local-auth-v1'), 'u2', 'The demo identity remains available in its browser tab session.');
  assert.equal(sharedDemoStorage.getItem(tabOneKey), 'u2', 'The demo identity has a persistent backup scoped to that tab.');

  const reloadedTabSession = createMemoryStorage();
  const reloadedTabWindow = { name: tabOneWindow.name, crypto: { randomUUID: () => 'unused-reload-id' } };
  const reloadedTabContext = {
    validIds: ['u1','u2','u3','u4','u5','u6','root'],
    LOCAL_SESSION_KEY: 'team-follow-up-local-auth-v1',
    LOCAL_TAB_NAME_MARKER: '|__TEAM_FOLLOW_UP_LOCAL_TAB_V1__:',
    window: reloadedTabWindow, sessionStorage: reloadedTabSession, localStorage: sharedDemoStorage,
    String, Date, Math
  };
  vm.runInNewContext(localAuthSource + '\nthis.restore=restoreLocalSessionUser;this.clear=clearLocalSessionUser;this.key=localSessionTabStorageKey;', reloadedTabContext);
  assert.equal(reloadedTabContext.restore(), 'u2', 'A page reload restores the same demo identity even when tab session storage must be reconstructed.');
  assert.equal(reloadedTabSession.getItem('team-follow-up-local-auth-v1'), 'u2', 'Restoration repopulates the new tab-session store.');

  const tabTwoSession = createMemoryStorage();
  const tabTwoWindow = { name: '', crypto: { randomUUID: () => 'tab-two-identity' } };
  const tabTwoContext = {
    validIds: ['u1','u2','u3','u4','u5','u6','root'],
    LOCAL_SESSION_KEY: 'team-follow-up-local-auth-v1',
    LOCAL_TAB_NAME_MARKER: '|__TEAM_FOLLOW_UP_LOCAL_TAB_V1__:',
    window: tabTwoWindow, sessionStorage: tabTwoSession, localStorage: sharedDemoStorage,
    String, Date, Math
  };
  vm.runInNewContext(localAuthSource + '\nthis.persist=persistLocalSessionUser;this.restore=restoreLocalSessionUser;this.key=localSessionTabStorageKey;', tabTwoContext);
  assert.equal(tabTwoContext.restore(), '', 'A new independent tab does not inherit another tab’s demo identity.');
  tabTwoContext.persist('u3');
  assert.notEqual(tabTwoContext.key(), tabOneKey, 'Each tab stores its demo identity under a different key.');
  assert.equal(reloadedTabContext.restore(), 'u2', 'Signing in as another demo user in a second tab does not overwrite the first tab identity.');
  reloadedTabContext.clear();
  assert.equal(sharedDemoStorage.getItem(tabOneKey), null, 'Explicit sign-out removes only the current tab identity backup.');
  assert.equal(sharedDemoStorage.getItem(tabTwoContext.key()), 'u3', 'Signing out in one tab leaves the other tab session intact.');
}
console.log('Session-refresh tests passed: persistent Cognito storage, transient auth recovery, user-specific page/tab/filter/scroll restoration, and no hydration route reset.');
