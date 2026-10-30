import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const source = await readFile('index.html', 'utf8');
const outputDirectory = 'dist';
const runtimeConfig = {
  cognito: { userPoolId: '', userPoolClientId: '', teamUserAttribute: '', identityMap: {} },
  localAuth: { enabled: true },
  dataMode: 'builtin',
  apiBaseUrl: ''
};

const openTag = '<script id="team-follow-up-runtime-config">';
const closeTag = '</script>';
const start = source.indexOf(openTag);
const end = start < 0 ? -1 : source.indexOf(closeTag, start + openTag.length);
if (start < 0 || end < 0) {
  throw new Error('index.html is missing the Team Follow-Up runtime configuration block.');
}

const serialized = JSON.stringify(runtimeConfig, null, 2);
const replacement = [
  openTag,
  '/* This build intentionally uses the browser-local demo adapter. */',
  'window.TEAM_FOLLOW_UP_CONFIG = Object.freeze(' + serialized + ');',
  closeTag
].join(String.fromCharCode(10));
const output = source.slice(0, start) + replacement + source.slice(end + closeTag.length);

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputDirectory + '/index.html', output, 'utf8');
await writeFile(outputDirectory + '/.nojekyll', '', 'utf8');

for (const asset of ['logo.svg', 'favicon.svg', 'favicon.png', 'favicon.ico', 'network-icon.svg']) {
  await copyFile(asset, outputDirectory + '/' + asset);
}
console.log('Built the local Team Follow-Up demo to dist/ (browser-local data, demo sign-in enabled).');
