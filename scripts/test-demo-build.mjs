import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['scripts/build.mjs'], {
  encoding: 'utf8',
  env: { ...process.env, TEAM_FOLLOW_UP_DATA_MODE: '', TEAM_FOLLOW_UP_LOCAL_AUTH_ENABLED: '' }
});
assert.equal(result.status, 0, 'Local demo build should succeed without cloud variables. ' + result.stderr);

const html = await readFile('dist/index.html', 'utf8');
assert.ok(html.includes("$('#workspaceEyebrow').hidden=ui.page==='account';"), 'account page hides the duplicate MY ACCOUNT eyebrow while keeping the bold title');
assert.ok(html.includes("cpu:'CPU'"), 'CPU profile-icon label uses the standard uppercase spelling');
assert.ok(html.includes('const ICON_PALETTES = {'), 'profile icons use dedicated color palettes while retaining their source SVG paths');
for (const name of ['wrench','cpu','engineer','database','helmet','layers']) {
  assert.ok(html.includes(name+':{stroke:['), `color palette is defined for ${name}`);
}
assert.ok(html.includes("wrench:{stroke:['#536477','#DCE5EF','#77879B']"), 'Wrench uses a silver/chrome palette');
assert.ok(html.includes('compass:') && html.includes('circle cx="12" cy="12" r="10"') && html.includes('m16.2 7.8-2.7 5.7-5.7 2.7 2.7-5.7z') && !html.slice(html.indexOf('const ICON_PALETTES = {'),html.indexOf('let iconRenderSequence')).includes('compass:{') && !html.slice(html.indexOf('function icon(name,size=16){'),html.indexOf('\\nfunction ',html.indexOf('function icon(name,size=16){'))).includes("name==='compass'"), 'Compass is restored to its original unfilled currentColor outline');
assert.ok(html.includes("cpu:{stroke:['#64748B','#3B82F6','#22D3EE']") && html.includes("pins:['#64748B','#E2E8F0','#94A3B8']"), 'CPU palette uses graphite, electric-blue edges and metallic pins');
assert.ok(html.includes("engineer:{stroke:['#1E3A8A','#0F766E']") && html.includes("helmet:['#FFF4C2','#FACC15','#D97706']") && html.includes("clothes:['#1E40AF','#0F766E']") && html.includes("clothesHighlight:['#93C5FD','#2DD4BF']"), 'Engineer uses separate safety helmet, face and refined blue/teal uniform palettes');
assert.ok(html.includes("database:{stroke:['#3B82F6','#0F766E']") && html.includes("accent:['#A5F3FC','#22D3EE']"), 'Database uses a modern blue-indigo cylinder with aqua data rings');
const iconRendererStart=html.indexOf('function icon(name,size=16){');
const iconRendererEnd=html.indexOf('\\nfunction ',iconRendererStart);
const iconRenderer=html.slice(iconRendererStart,iconRendererEnd);
assert.ok(!iconRenderer.includes("name==='compass'"), 'Compass renders through the standard outline icon path without a color override');
assert.ok(iconRenderer.includes("if(name==='cpu')") &&
          iconRenderer.includes('width="15.5"') &&
          iconRenderer.includes('width="12.1"') &&
          iconRenderer.includes('width="7.9"') &&
          iconRenderer.includes("url(#'+id+'-metal)"),
  'CPU uses a beveled package, inset board, illuminated die, circuit corners, and metallic pins');
assert.ok(iconRenderer.includes("if(name==='engineer')") &&
          iconRenderer.includes('M2.15 22.2c.35-2.75') &&
          iconRenderer.includes('M7.1 9.4v2.9') &&
          iconRenderer.includes('M4.55 8.85V7.55') &&
          iconRenderer.includes('M3.1 8.55c0-.56') &&
          iconRenderer.includes("gradient('helmetBand'") && iconRenderer.includes("gradient('clothesHighlight'"),
  'Engineer is a layered portrait with a shaped helmet and brim, face details, jacket, collar and uniform highlights');
assert.ok(iconRenderer.includes('fill="none" stroke="#67E8F9"') &&
          iconRenderer.includes('middleRingPath=pathMatch[1].slice(middleStart)'),
  'Database cylinder and internal separator are styled as independent vector paths');
assert.ok(!html.slice(html.indexOf('const ICON_PALETTES = {'), html.indexOf('let iconRenderSequence')).includes('crown:{'), 'Crown is removed from the color palette and returns to its original currentColor outline');
assert.ok(!html.slice(html.indexOf('function icon(name,size=16)'), html.indexOf('\nfunction ', html.indexOf('function icon(name,size=16)'))).includes("name==='crown'") && html.includes("crown:'<path d=\"m3 7 5 5 4-8 4 8 5-5-2 12H5L3 7Z\"/><path d=\"M5 22h14\"/>"), 'Crown uses its untouched original shape without a special fill override');
assert.ok(html.includes("layers:{stroke:['#F0444C','#3295D9','#6658DA','#F28A19']"), 'Layers uses the former logo color palette');
assert.ok(html.includes("function icon(name,size=16)") && html.includes("stroke=\"url(#'+id+'-stroke)\""), 'the icon renderer applies SVG gradients to the existing vector paths');
assert.ok(html.includes('M14.7 6.3a5 5 0 0 0-6.4 6.4') &&
          html.includes('M5.6 8.1C6 5 8.1 3.2') &&
          html.includes('M3.8 13.2v-1.5a8.2 8.2'),
  'Wrench, Engineer, and Helmet silhouettes remain based on the original SVG geometry');
assert.ok(html.includes('networking:\'<image href="./network-icon.svg"'), 'Network profile icon renders the high-quality vector asset');
assert.ok(!html.includes("networking:'<circle cx=\"12\" cy=\"5\" r=\"2.5\""), 'old three-node network icon has been replaced');
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
for (const asset of ['logo.svg', 'favicon.svg', 'favicon.png', 'favicon.ico', 'network-icon.svg']) {
  assert.deepEqual(await readFile('dist/' + asset), await readFile(asset), `static artifact includes the deployed ${asset} asset`);
}
const deployedLogo = await readFile('dist/logo.svg', 'utf8');
assert.ok(deployedLogo.includes('fill="#5b62e8"'), 'logo uses the application purple accent');
assert.ok(!deployedLogo.includes('#102e50'), 'logo no longer uses the low-contrast navy');
const deployedFavicon = await readFile('dist/favicon.svg', 'utf8');
assert.ok(deployedFavicon.includes('fill="#5b62e8"'), 'favicon uses the same application purple accent');
assert.ok(!deployedFavicon.includes('#102e50'), 'favicon no longer uses the low-contrast navy');

assert.ok(html.includes('Local demo sign-in is enabled.'), 'demo login explains that authentication is not real');
assert.ok(!html.includes('REPLACE_WITH_COGNITO_USER_POOL_ID') && !html.includes('REPLACE_WITH_PUBLIC_APP_CLIENT_ID'), 'built demo contains no authentication placeholders');

console.log('Public demo build tests passed: local data mode, demo sign-in, no remote API settings, and GitHub Pages artifact structure.');
