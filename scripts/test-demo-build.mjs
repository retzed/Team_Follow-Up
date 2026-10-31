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
assert.ok(html.includes("user:'<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2\"/>',") && html.includes("'profile-user':'<path d=\"M12 11.65c-2.5 0-4.25-2.02") && html.includes("{value:'profile-user'}") && !html.includes("{value:'user'}") && html.includes("const profileName=name==='user'?'profile-user':name") && html.includes("raw.icon||roleIcons[raw.role]||'profile-user'") && html.includes("${icon('user',14)}"), 'The original User glyph is reserved for UI controls; the refined bust is a profile-only option with legacy user values mapped to it');
assert.ok(html.includes('const ICON_PALETTES = {'), 'profile icons use dedicated color palettes while retaining their source SVG paths');
for (const name of ['wrench','database','helmet','layers']) {
  assert.ok(html.includes(name+':{stroke:['), `color palette is defined for ${name}`);
}
assert.ok(html.includes("wrench:{stroke:['#536477','#DCE5EF','#77879B']"), 'Wrench uses a silver/chrome palette');
assert.ok(html.includes('compass:') && html.includes('circle cx="12" cy="12" r="10"') && html.includes('m16.2 7.8-2.7 5.7-5.7 2.7 2.7-5.7z') && !html.slice(html.indexOf('const ICON_PALETTES = {'),html.indexOf('let iconRenderSequence')).includes('compass:{') && !html.slice(html.indexOf('function icon(name,size=16){'),html.indexOf('\\nfunction ',html.indexOf('function icon(name,size=16){'))).includes("name==='compass'"), 'Compass is restored to its original unfilled currentColor outline');
assert.ok(html.includes("cpu:'<rect") && html.includes('width="14" height="14" rx="2"') && !html.slice(html.indexOf('const ICON_PALETTES = {'),html.indexOf('};',html.indexOf('const ICON_PALETTES = {'))).includes('cpu:{'), 'CPU is restored to its original uncolored outline path and uses currentColor');
assert.ok(!html.slice(html.indexOf('const ICON_PALETTES = {'),html.indexOf('let iconRenderSequence')).includes('engineer:{') && html.includes("engineer:'<path d=\"M5.6 8.1C6 5 8.1 3.2") && html.includes('stroke=\"var(--accent)\"'), 'Engineer keeps the latest monochrome hard-hat SVG and uses the same single application-accent color as Compass');
assert.ok(html.includes("database:{stroke:['#3B82F6','#0F766E']") && html.includes("accent:['#A5F3FC','#22D3EE']"), 'Database uses a modern blue-indigo cylinder with aqua data rings');
const iconRendererStart=html.indexOf('function icon(name,size=16){');
const iconRendererEnd=html.indexOf('\\nfunction ',iconRendererStart);
const iconRenderer=html.slice(iconRendererStart,iconRendererEnd);
assert.ok(!iconRenderer.includes("name==='compass'"), 'Compass renders through the standard outline icon path without a color override');
assert.ok(!iconRenderer.includes("name==='cpu'"), 'CPU renders the original outline through the standard currentColor icon renderer');
assert.ok(iconRenderer.includes("if(name==='engineer')return") &&
          iconRenderer.includes('stroke=\"var(--accent)\"') &&
          html.includes("engineer:'<path d=\"M5.6 8.1C6 5 8.1 3.2"),
  'Engineer uses the latest single-color hard-hat SVG with the application accent stroke and no multicolor palette');
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
assert.ok(html.includes('const NETWORKING_ICON_SVG =') &&
          html.includes("if(name==='networking')") &&
          html.includes('networking-icon-'),
  'Network profile icon embeds the gradient artwork with unique per-instance SVG IDs');
assert.ok(!html.includes('network-icon.svg'), 'Network artwork has no external file dependency');
assert.ok(!html.includes("networking:'<circle cx=\"12\" cy=\"5\" r=\"2.5\""), 'old three-node network icon has been replaced');
const authGateStart = html.indexOf('<script id="pre-auth-gate">');
assert.ok(authGateStart >= 0, 'page includes the pre-authentication sign-in gate');
const authGateEnd = html.indexOf('</script>', authGateStart);
assert.ok(authGateEnd > authGateStart, 'pre-authentication sign-in gate is a complete script');
const authGate = html.slice(authGateStart, authGateEnd);
assert.ok(authGate.includes('src="data:image/svg+xml;base64,'), 'sign-in logo is embedded and rendered without relying on the later app script');
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
const embeddedSvgImages = html.split('data:image/svg+xml;base64,').slice(1)
  .map(encoded => Buffer.from(encoded.slice(0, encoded.indexOf('"')), 'base64').toString('utf8'));
  .map(match => Buffer.from(match[1], 'base64').toString('utf8'));
const deployedLogo = embeddedSvgImages.find(svg => svg.includes('viewBox="0 0 512 420"'));
assert.ok(deployedLogo, 'static artifact embeds the application logo as SVG data');
assert.ok(deployedLogo.includes('fill="#5b62e8"'), 'embedded logo uses the application purple accent');
assert.ok(!deployedLogo.includes('#102e50'), 'embedded logo no longer uses the low-contrast navy');
const deployedFavicon = embeddedSvgImages.find(svg => svg.includes('viewBox="0 0 512 512"'));
assert.ok(deployedFavicon, 'static artifact embeds the SVG favicon as image data');
assert.ok(deployedFavicon.includes('fill="#5b62e8"'), 'embedded favicon uses the same application purple accent');
assert.ok(!deployedFavicon.includes('#102e50'), 'embedded favicon no longer uses the low-contrast navy');
assert.ok(html.includes('href="data:image/png;base64,') && html.includes('href="data:image/x-icon;base64,'), 'static artifact embeds PNG and ICO favicon variants');
assert.ok(!/(?:src|href)=["'][^"']+[.](?:svg|png|jpe?g|gif|webp|ico)(?:[?#][^"']*)?["']/i.test(html), 'static artifact has no external image-file dependencies');

assert.ok(html.includes('Local demo sign-in is enabled.'), 'demo login explains that authentication is not real');
assert.ok(!html.includes('REPLACE_WITH_COGNITO_USER_POOL_ID') && !html.includes('REPLACE_WITH_PUBLIC_APP_CLIENT_ID'), 'built demo contains no authentication placeholders');

console.log('Public demo build tests passed: local data mode, demo sign-in, no remote API settings, and GitHub Pages artifact structure.');
