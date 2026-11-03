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

const SESSION_KEY = 'team-follow-up-local-auth-v2';
const LEGACY_SESSION_KEY = 'team-follow-up-local-auth-v1';
const PASSWORD_KEY = 'team-follow-up-local-password-hashes-v1';

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
    documentElement: root,
    body,
    getElementById(id) {
      if (id === 'application-bootstrap') return { id, textContent: '/* real app bootstrap hand-off */' };
      return element(id);
    },
    createElement(tagName) { return element('created-' + tagName + '-' + injectedScripts.length); }
  };
  const window = {
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
  return { window, document, elements, injectedScripts, sessionStorage, localStorage };
}

const session = memoryStorage();
const local = memoryStorage();

// First-load path: the gate shows sign-in because there is no saved identity.
const firstLoad = makeGateEnvironment({ session, local });
assert.equal(firstLoad.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT, null);
assert.equal(firstLoad.elements.get('signInScreen').hidden, false);
assert.equal(firstLoad.injectedScripts.length, 0);

// Sign in through the real pre-auth form handler. The gate must persist first,
// then publish the auth context and inject the application bootstrap script.
firstLoad.elements.get('signInUsername').value = 'Zyad';
firstLoad.elements.get('signInPassword').value = 'demo-password';
await firstLoad.elements.get('signInForm').dispatch('submit', { preventDefault() {} });
assert.equal(firstLoad.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT?.teamUserId, 'u2');
assert.equal(firstLoad.elements.get('signInScreen').hidden, true);
assert.equal(firstLoad.sessionStorage.getItem(SESSION_KEY), 'u2');
assert.equal(firstLoad.localStorage.getItem(SESSION_KEY), 'u2');
assert.equal(firstLoad.injectedScripts.length, 1);
assert.equal(firstLoad.injectedScripts[0].id, 'running-team-follow-up-app');
assert.equal(firstLoad.injectedScripts[0].textContent, '/* real app bootstrap hand-off */');

// Hard reload path: create a brand-new JS realm and DOM while retaining only
// the browser storage objects, exactly as a same-tab page refresh does.
const refreshed = makeGateEnvironment({ session, local });
assert.equal(refreshed.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT?.teamUserId, 'u2');
assert.equal(refreshed.elements.get('signInScreen').hidden, true);
assert.equal(refreshed.injectedScripts.length, 1);
assert.equal(refreshed.injectedScripts[0].id, 'running-team-follow-up-app');

// A reload that loses the tab-scoped store must still restore from the durable
// origin store (the behavior needed when a browser does not retain tab storage).
const recoveredWithoutTabStorage = makeGateEnvironment({
  session: memoryStorage(),
  local
});
assert.equal(recoveredWithoutTabStorage.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT?.teamUserId, 'u2');
assert.equal(recoveredWithoutTabStorage.elements.get('signInScreen').hidden, true);
assert.equal(recoveredWithoutTabStorage.injectedScripts.length, 1);

// A stale tab identity cannot start the app if the durable origin store is
// unavailable. This is distinct from a fresh sign-in and prevents an apparent
// successful refresh that cannot be persisted for the next load.
const seededTabOnlyStorage = memoryStorage([[SESSION_KEY, 'u2']]);
const unavailablePersistentStorage = {
  getItem() { throw new Error('persistent storage unavailable'); },
  setItem() { throw new Error('persistent storage unavailable'); },
  removeItem() {},
  key() { return null; },
  get length() { return 0; }
};
const tabOnlyRestore = makeGateEnvironment({
  session: seededTabOnlyStorage,
  local: unavailablePersistentStorage
});
assert.equal(tabOnlyRestore.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT, null);
assert.equal(tabOnlyRestore.elements.get('signInScreen').hidden, false);
assert.equal(tabOnlyRestore.injectedScripts.length, 0,
  'A tab-only identity is not accepted when durable storage is unavailable.');

// Explicit sign-out clears both the tab session and its recovery copy.
await refreshed.window.TeamFollowUpAuth.signOut();
assert.equal(refreshed.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT, null);
assert.equal(refreshed.sessionStorage.getItem(SESSION_KEY), null);
assert.equal(refreshed.localStorage.getItem(SESSION_KEY), null);
assert.equal(refreshed.elements.get('signInScreen').hidden, false);

// After sign-out, a fresh page load must not silently restore the old identity.
const afterSignOut = makeGateEnvironment({ session, local });
assert.equal(afterSignOut.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT, null);
assert.equal(afterSignOut.elements.get('signInScreen').hidden, false);
assert.equal(afterSignOut.injectedScripts.length, 0);

// Storage failure path: valid password verification still must not enter the app
// when neither storage can accept the session record.
const failingSessionStorage = {
  getItem() { return null; },
  setItem() { throw new Error('session storage blocked'); },
  removeItem() {},
  get length() { return 0; }
};
const failingLocalStorage = {
  getItem(key) { return key === SESSION_KEY ? null : local.getItem(key); },
  setItem(key, value) {
    if (key === SESSION_KEY) throw new Error('local storage blocked for session');
    local.setItem(key, value);
  },
  removeItem(key) { local.removeItem(key); },
  get length() { return local.length; },
  key(index) { return local.key(index); }
};
const storageFailure = makeGateEnvironment({
  session: failingSessionStorage,
  local: failingLocalStorage
});
storageFailure.elements.get('signInUsername').value = 'Zyad';
storageFailure.elements.get('signInPassword').value = 'demo-password';
await storageFailure.elements.get('signInForm').dispatch('submit', { preventDefault() {} });
assert.equal(storageFailure.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT, null);
assert.equal(storageFailure.elements.get('signInScreen').hidden, false);
assert.equal(storageFailure.injectedScripts.length, 0);
assert.match(storageFailure.elements.get('signInError').textContent, /could not save the sign-in session/i);

// sessionStorage alone is insufficient. The password record can be saved, but
// if the persistent session key cannot be written, the gate must not create a
// tab-only identity or start the application.
const tabOnlyStorage = memoryStorage();
const localStorageWithoutSessionWrites = {
  getItem(key) { return local.getItem(key); },
  setItem(key, value) {
    if (key === SESSION_KEY) throw new Error('persistent session writes blocked');
    local.setItem(key, value);
  },
  removeItem(key) { local.removeItem(key); },
  get length() { return local.length; },
  key(index) { return local.key(index); }
};
const tabOnlySignIn = makeGateEnvironment({
  session: tabOnlyStorage,
  local: localStorageWithoutSessionWrites
});
tabOnlySignIn.elements.get('signInUsername').value = 'Nadine';
tabOnlySignIn.elements.get('signInPassword').value = 'demo-password';
await tabOnlySignIn.elements.get('signInForm').dispatch('submit', { preventDefault() {} });
assert.equal(tabOnlySignIn.window.__TEAM_FOLLOW_UP_AUTH_CONTEXT, null);
assert.equal(tabOnlySignIn.elements.get('signInScreen').hidden, false);
assert.equal(tabOnlySignIn.injectedScripts.length, 0);
assert.equal(tabOnlyStorage.getItem(SESSION_KEY), null,
  'The gate does not leave behind a sessionStorage-only identity.');
assert.match(tabOnlySignIn.elements.get('signInError').textContent, /could not save the sign-in session/i);

// Verify the app bootstrap uses the context produced by the gate rather than
// independently inventing or resetting an identity during startup.
assert.ok(html.includes('const sessionUserIdAtLoad=window.__TEAM_FOLLOW_UP_AUTH_CONTEXT?.teamUserId||\'\';'));
assert.ok(html.includes('setSignInState(Boolean(sessionUserIdAtLoad));'));
console.log('Auth refresh E2E passed: sign-in, persistent storage verification, hard reload and tab-storage-loss restore, app bootstrap hand-off, explicit sign-out, and transient-storage refusal.');
