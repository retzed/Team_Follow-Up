import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['scripts/build.mjs'], {
  encoding: 'utf8',
  env: { ...process.env, TEAM_FOLLOW_UP_DATA_MODE: '', TEAM_FOLLOW_UP_LOCAL_AUTH_ENABLED: '' }
});
assert.equal(result.status, 0, 'Local demo build should succeed without cloud variables. ' + result.stderr);

const html = await readFile('dist/index.html', 'utf8');
const authGateStart = html.indexOf('<script id="pre-auth-gate">');
assert.ok(authGateStart >= 0, 'page includes the pre-authentication sign-in gate');
const authGateEnd = html.indexOf('</script>', authGateStart);
assert.ok(authGateEnd > authGateStart, 'pre-authentication sign-in gate is a complete script');
const authGate = html.slice(authGateStart, authGateEnd);
assert.ok(authGate.includes('src="./logo.svg?v=20261030-brandrefresh2"'), 'sign-in logo is rendered without relying on the later app script');
assert.ok(!authGate.includes('applicationLogoMarkup()'), 'pre-auth sign-in cannot call helpers from the later app bootstrap script');

const marker = 'window.TEAM_FOLLOW_UP_CONFIG = Object.freeze(';
const markerStart = html.indexOf(marker);
assert.ok(markerStart >= 0, 'built demo must include runtime configuration');
const jsonStart = markerStart + marker.length;
const jsonEnd = html.indexOf(');', jsonStart);
assert.ok(jsonEnd > jsonStart, 'built demo runtime configuration must be complete');
const config = JSON.parse(html.slice(jsonStart, jsonEnd));

assert.equal(config.dataMode, 'builtin', 'public demo always uses the built-in local data adapter');
assert.equal(config.localAuth.enabled, true, 'public demo enables local demo sign-in');
assert.equal(config.apiBaseUrl, '', 'public demo must not point to a remote API');
assert.equal(config.cognito.userPoolId, '', 'public demo must not contain a user-pool identifier');
assert.equal(config.cognito.userPoolClientId, '', 'public demo must not contain an app-client identifier');
assert.ok(html.includes('team-follow-up-local-auth-v1'), 'built demo includes the local demo session flow');
assert.equal(await readFile('dist/.nojekyll', 'utf8'), '', 'static artifact contains .nojekyll');
for (const asset of ['logo.svg', 'favicon.svg', 'favicon.png', 'favicon.ico']) {
  assert.deepEqual(await readFile('dist/' + asset), await readFile(asset), `static artifact includes the deployed ${asset} asset`);
}
assert.ok(html.includes('Local demo sign-in is enabled.'), 'demo login explains that authentication is not real');
assert.ok(!html.includes('REPLACE_WITH_COGNITO_USER_POOL_ID') && !html.includes('REPLACE_WITH_PUBLIC_APP_CLIENT_ID'), 'built demo contains no authentication placeholders');

console.log('Public demo build tests passed: local data mode, demo sign-in, no remote API settings, and GitHub Pages artifact structure.');
