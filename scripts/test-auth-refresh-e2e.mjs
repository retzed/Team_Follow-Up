import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const html = await readFile('index.html', 'utf8');
const gateOpen = html.indexOf('<script id="pre-auth-gate">');
assert.ok(gateOpen >= 0, 'The page must contain its pre-authentication gate.');
const gateStart = html.indexOf('>', gateOpen) + 1;
const gateEnd = html.indexOf('</script>', gateStart);
assert.ok(gateEnd > gateStart, 'The pre-authentication gate must be a complete script.');
const gateSource = html.slice(gateStart, gateEnd);

assert.ok(!html.includes('team-follow-up-local-auth-v1'),
  'The retired local demo session key and migration path are not shipped.');

const SESSION_KEY = 'team-follow-up-local-auth-v2';

function memoryStorage(initial = []) {
  const values = new Map(initial);
  return {
    values,
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    key(index) { return [...values.keys()][index] ?? null; },
    get length() { return values.size; }
  };
}

function makeClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    remove(...names) { names.forEach(name => values.delete(name)); },
    contains(name) { return values.has(name); },
    toggle(name, force) {
      if (force === undefined) force = !values.has(name);
      if (force) values.add(name); else values.delete(name);
      return force;
    }
  };
}

function makeGateEnvironment({ session, local, config = null } = {}) {
  const sessionStorage = session || memoryStorage();
  const localStorage = local || memoryStorage();
  const windowListeners = Object.create(null);
  const documentListeners = Object.create(null);
  let domParsed = false;
  const elements = new Map();
  const injectedScripts = [];
  const element = id => {
    if (!elements.has(id)) {
      const value = {
        id, hidden: false, disabled: false, required: false, value: '',
        textContent: '', innerHTML: '', placeholder: '', type: '',
        autocomplete: '', inputMode: '', attributes: {}, listeners: Object.create(null),
        addEventListener(name, callback) {
          (this.listeners[name] ||= []).push(callback);
        },
        async dispatch(name, event = {}) {
          let result;
          for (const callback of this.listeners[name] || []) result = await callback(event);
          return result;
        },
        closest() { return this.parentLabel ||= { hidden: false }; },
        focus() { this.focused = true; },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        removeAttribute(name) { delete this.attributes[name]; }
      };
      elements.set(id, value);
    }
    return elements.get(id);
  };

  const root = { lang: 'en', dir: 'ltr', classList: makeClassList() };
  const body = {
    classList: makeClassList(),
    appendChild(node) { injectedScripts.push(node); return node; }
  };
  const document = {
    title: 'Team Follow-Up',
    readyState: 'loading',
    documentElement: root,
    body,
    addEventListener(name, callback) {
      (documentListeners[name] ||= []).push(callback);
    },
    finishParsing() {
      domParsed = true;
      this.readyState = 'interactive';
      for (const callback of documentListeners.DOMContentLoaded || []) callback({ type: 'DOMContentLoaded' });
      this.readyState = 'complete';
    },
    getElementById(id) {
      if (id === 'application-bootstrap') {
        return domParsed ? { id, textContent: '/* real app bootstrap hand-off */' } : null;
      }
      return element(id);
    },
    createElement(tagName) { return element('created-' + tagName + '-' + injectedScripts.length); }
  };
  const window = {
    localStorage,
    addEventListener(name, callback) { (windowListeners[name] ||= []).push(callback); },
    dispatchStorage(event) { for (const callback of windowListeners.storage || []) callback(event); },
    TEAM_FOLLOW_UP_CONFIG: config || {
      cognito: { userPoolId: '', userPoolClientId: '', teamUserAttribute: '', identityMap: {} },
      localAuth: { enabled: true },
      dataMode: 'builtin',
      apiBaseUrl: ''
    },
    __TEAM_FOLLOW_UP_AUTH_CONTEXT: null
  };

  const sandbox = {
    window, document, sessionStorage, localStorage,
    crypto: webcrypto,
    TextEncoder,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    console
  };
  vm.runInNewContext(gateSource, sandbox, { timeout: 10000 });
  return {
    window, document, elements, injectedScripts, sessionStorage, localStorage,
    finishParsing() { document.finishParsing(); }
  };
}

const blockedTabStorage = new Proxy({}, {
  get() { throw new Error('Demo authentication must not access sessionStorage.'); }
});
const local = memoryStorage();

// First-load path: the gate shows sign-in because there is no saved identity.
// Tab-scoped storage deliberately throws on every access.
const firstLoad = makeGateEnvironment({ session: blockedTabStorage, local });
assert.equal(firstLoad.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT, null);
assert.equal(firstLoad.elements.get('signInScreen').hidden, false);
assert.equal(firstLoad.injectedScripts.length, 0);
firstLoad.finishParsing();

// Sign in through the real pre-auth form handler. The gate must persist first,
// then publish the auth context and inject the application bootstrap script.
firstLoad.elements.get('signInUsername').value = 'Zyad';
firstLoad.elements.get('signInPassword').value = 'demo-password';
await firstLoad.elements.get('signInForm').dispatch('submit', { preventDefault() {} });
assert.equal(firstLoad.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT?.teamUserId, 'u2');
assert.equal(firstLoad.elements.get('signInScreen').hidden, true);
assert.equal(firstLoad.localStorage.getItem(SESSION_KEY), 'u2',
  'The single auth identity is stored in browser-profile localStorage.');
assert.equal(firstLoad.injectedScripts.length, 1);
assert.equal(firstLoad.injectedScripts[0].id, 'running-team-follow-up-app');
assert.equal(firstLoad.injectedScripts[0].textContent, '/* real app bootstrap hand-off */');

// Hard reload reconstructs JavaScript and the DOM while retaining only
// the browser profile's localStorage. sessionStorage throws if it is touched.
const refreshed = makeGateEnvironment({ session: blockedTabStorage, local });
// Reproduce the actual parser order: the pre-auth gate has executed, but
// application-bootstrap has not entered the DOM yet.
assert.equal(refreshed.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT, null);
assert.equal(refreshed.elements.get('signInScreen').hidden, false);
assert.equal(refreshed.injectedScripts.length, 0,
  'Session restoration must wait instead of failing while the later bootstrap node is not parsed.');
refreshed.finishParsing();
assert.equal(refreshed.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT?.teamUserId, 'u2');
assert.equal(refreshed.elements.get('signInScreen').hidden, true);
assert.equal(refreshed.injectedScripts.length, 1);

// A second tab in the same browser profile restores the same single identity.
const secondTab = makeGateEnvironment({ session: blockedTabStorage, local });
secondTab.finishParsing();
assert.equal(secondTab.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT?.teamUserId, 'u2');
assert.equal(secondTab.elements.get('signInScreen').hidden, true);

// sessionStorage cannot create a separate authenticated identity.
const seededTabOnlyStorage = memoryStorage([[SESSION_KEY, 'u4']]);
const tabOnlyRestore = makeGateEnvironment({
  session: seededTabOnlyStorage,
  local: memoryStorage()
});
tabOnlyRestore.finishParsing();
assert.equal(tabOnlyRestore.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT, null);
assert.equal(tabOnlyRestore.elements.get('signInScreen').hidden, false);
assert.equal(tabOnlyRestore.injectedScripts.length, 0);

// A sign-out in one tab removes the browser-wide identity and updates the other.
await secondTab.window.TeamFollowUpAuth.signOut();
assert.equal(secondTab.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT, null);
assert.equal(local.getItem(SESSION_KEY), null);
firstLoad.window.dispatchStorage({
  key: SESSION_KEY, oldValue: 'u2', newValue: null, storageArea: local
});
assert.equal(firstLoad.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT, null);
assert.equal(firstLoad.elements.get('signInScreen').hidden, false);

// Signing in as a different team member in the second tab updates the first tab.
secondTab.elements.get('signInUsername').value = 'Nadine';
secondTab.elements.get('signInPassword').value = 'demo-password';
await secondTab.elements.get('signInForm').dispatch('submit', { preventDefault() {} });
assert.equal(secondTab.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT?.teamUserId, 'u3');
assert.equal(local.getItem(SESSION_KEY), 'u3');
firstLoad.window.__TEAM_FOLLOW_UP_APP_AUTH_CHANGED = context => {
  firstLoad.lastBrowserIdentity = context.teamUserId;
};
firstLoad.window.dispatchStorage({
  key: SESSION_KEY, oldValue: null, newValue: 'u3', storageArea: local
});
assert.equal(firstLoad.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT?.teamUserId, 'u3');
assert.equal(firstLoad.lastBrowserIdentity, 'u3');
assert.equal(firstLoad.elements.get('signInScreen').hidden, true);

// A separate browser profile has independent localStorage and therefore no session.
const separateBrowserProfile = makeGateEnvironment({
  session: blockedTabStorage,
  local: memoryStorage()
});
separateBrowserProfile.finishParsing();
assert.equal(separateBrowserProfile.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT, null);
assert.equal(separateBrowserProfile.elements.get('signInScreen').hidden, false);

// Explicit sign-out in one of the tabs clears the single shared browser session.
await secondTab.window.TeamFollowUpAuth.signOut();
assert.equal(local.getItem(SESSION_KEY), null);
firstLoad.window.dispatchStorage({
  key: SESSION_KEY, oldValue: 'u3', newValue: null, storageArea: local
});
assert.equal(firstLoad.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT, null);
assert.equal(firstLoad.elements.get('signInScreen').hidden, false);

// Verify the app bootstrap uses the context produced by the gate rather than
// independently inventing or resetting an identity during startup.
assert.ok(html.includes('const sessionUserIdAtLoad=window.__TEAM_FOLLOW_UP_AUTH_CONTEXT?.teamUserId||\'\';'));
assert.ok(html.includes('setSignInState(Boolean(sessionUserIdAtLoad));'));
console.log('Auth refresh E2E passed: browser-wide sign-in, hard reload, same-profile multi-tab identity changes, cross-tab sign-out, separate profile isolation, app bootstrap hand-off, and absence of tab-scoped auth storage.');
