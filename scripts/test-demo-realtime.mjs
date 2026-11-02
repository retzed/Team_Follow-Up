import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile('index.html', 'utf8');
const helperStart = html.indexOf(' function builtinItemMap(tables){');
const helperEnd = html.indexOf(' function mergePendingBuiltinChange(change){', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'the local demo change metadata helper must exist');
const helpers = html.slice(helperStart, helperEnd);
const context = {};
vm.runInNewContext(helpers + '\nthis.createBuiltinRealtimeChange=createBuiltinRealtimeChange;', context);

{
  const before = {
    workItems: [{
      itemId: 'task-1', type: 'task', parentId: 'project-1', rootParentId: 'project-1',
      ownerId: 'u1', name: 'Private task title', description: 'Private task description'
    }],
    archiveItems: []
  };
  const after = {
    workItems: [{
      itemId: 'task-1', type: 'task', parentId: 'project-1', rootParentId: 'project-1',
      ownerId: 'u2', name: 'Private task title updated', description: 'Private task description updated'
    }],
    archiveItems: []
  };
  const change = context.createBuiltinRealtimeChange(before, after);
  assert.equal(change.type, 'items.changed');
  assert.equal(change.changeKind, 'updated');
  assert.deepEqual([...change.itemIds], ['task-1']);
  assert.deepEqual([...change.rootParentIds], ['project-1']);
  assert.deepEqual([...change.parentIds], ['project-1']);
  assert.deepEqual(new Set(change.assigneeIds), new Set(['u1','u2']), 'the signal targets both the previous and new assignee');
  const serialized = JSON.stringify(change);
  assert.ok(!serialized.includes('Private task title'));
  assert.ok(!serialized.includes('Private task description'));
  assert.ok(!serialized.includes('name'));
  assert.ok(!serialized.includes('description'));
}


{
  const before = {
    workItems: [
      { itemId: 'project-1', type: 'project', ownerId: 'u1', name: 'Old project' },
      { itemId: 'task-1', type: 'task', parentId: 'project-1', rootParentId: 'project-1', ownerId: 'u2', name: 'Task' },
      { itemId: 'followup-1', type: 'followup', parentId: 'task-1', rootParentId: 'project-1', ownerId: 'u3', name: 'Follow-up' }
    ],
    archiveItems: []
  };
  const after = {
    workItems: [
      { ...before.workItems[0], name: 'Renamed project' },
      ...before.workItems.slice(1)
    ],
    archiveItems: []
  };
  const change = context.createBuiltinRealtimeChange(before, after);
  assert.deepEqual([...change.itemIds], ['project-1'], 'only the changed parent item is included in the item delta');
  assert.deepEqual(new Set(change.assigneeIds), new Set(['u1', 'u2', 'u3']),
    'a parent metadata change targets the parent owner and every descendant assignee');
}


{
  const before = { workItems: [], archiveItems: [] };
  const after = {
    workItems: [{ itemId: 'project-1', type: 'project', ownerId: 'u1', name: 'Private project' }],
    archiveItems: []
  };
  const change = context.createBuiltinRealtimeChange(before, after);
  assert.equal(change.changeKind, 'created');
  assert.deepEqual([...change.topLevelIds], ['project-1']);
}

{
  const active = {
    workItems: [{ itemId: 'project-1', type: 'project', ownerId: 'u1', name: 'Private project' }],
    archiveItems: []
  };
  const archived = {
    workItems: [],
    archiveItems: [{ itemId: 'project-1', archiveId: 'project-1', type: 'project', ownerId: 'u1', name: 'Private project', archiveRootId: 'project-1' }]
  };
  const change = context.createBuiltinRealtimeChange(active, archived);
  assert.equal(change.changeKind, 'updated');
  assert.equal(change.deleted, true, 'archive/delete change indicates the item is no longer active');
  assert.deepEqual([...change.topLevelIds], ['project-1']);
}

const handlerStart = html.indexOf('async function handleDemoRealtimeChange(change){');
const handlerEnd = html.indexOf('async function togglePinnedItem(itemId){', handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'the demo real-time view handler must exist');
const handlerSource = html.slice(handlerStart, handlerEnd);

function createHandlerContext(userId, loading = false) {
  const calls = { assigned: 0 };
  const ui = {
    actingUserId: userId,
    page: 'account',
    accountTab: 'assigned',
    accountAssignedLoaded: true,
    accountAssignedLoading: loading,
    accountPinnedRows: [],
    modal: null,
    selectedParentId: ''
  };
  const handlerContext = {
    window: { TeamFollowUpDataApi: { mode: 'builtin', resolveItems: async () => ({ items: [] }) } },
    ui,
    data: { parents: [], children: [] },
    rawCurrentUser: () => ({ id: userId }),
    rootParent: () => null,
    loadAccountAssignedItems: () => { calls.assigned += 1; return Promise.resolve(); },
    loadAccountPinnedItems: () => Promise.resolve(),
    renderParentList: () => {},
    renderDetail: () => {},
    renderAccountPage: () => {},
    ensureRootChildrenLoaded: async () => {},
    refreshActivityFor: async () => {},
    refreshApplicationHistory: () => {},
    allItem: () => null,
    toAppItem: row => row,
    invalidateHierarchyIndex: () => {},
    console: { warn() {} },
    Promise, Set, Map, String, Array
  };
  vm.runInNewContext('let demoAssignedRefreshPending=false;' + String.fromCharCode(10) + handlerSource + String.fromCharCode(10) + 'this.handleDemoRealtimeChange=handleDemoRealtimeChange;this.hasPendingAssignedRefresh=()=>demoAssignedRefreshPending;', handlerContext);
  return { handlerContext, calls, ui };
}

{
  const change = { type: 'items.changed', changeId: 'assignment-u1-u2', itemId: 'task-1', itemIds: ['task-1'], assigneeIds: ['u1', 'u2'] };
  const oldAssignee = createHandlerContext('u1');
  const newAssignee = createHandlerContext('u2');
  const unrelatedUser = createHandlerContext('u3');

  await oldAssignee.handlerContext.handleDemoRealtimeChange(change);
  await newAssignee.handlerContext.handleDemoRealtimeChange(change);
  await unrelatedUser.handlerContext.handleDemoRealtimeChange(change);

  assert.equal(oldAssignee.ui.accountAssignedLoaded, false, 'the previous assignee invalidates its Assigned Items view');
  assert.equal(newAssignee.ui.accountAssignedLoaded, false, 'the new assignee invalidates its Assigned Items view');
  assert.equal(oldAssignee.calls.assigned, 1, 'the previous assignee refreshes an open Assigned Items tab');
  assert.equal(newAssignee.calls.assigned, 1, 'the new assignee refreshes an open Assigned Items tab');
  assert.equal(unrelatedUser.calls.assigned, 0, 'unrelated demo users do not reload Assigned Items');
}

{
  const pendingRefresh = createHandlerContext('u2', true);
  await pendingRefresh.handlerContext.handleDemoRealtimeChange({
    type: 'items.changed', changeId: 'assignment-while-loading', itemId: 'task-2',
    itemIds: ['task-2'], assigneeIds: ['u1', 'u2']
  });
  assert.equal(pendingRefresh.ui.accountAssignedLoaded, false, 'a change arriving during load invalidates the in-flight view');
  assert.equal(pendingRefresh.handlerContext.hasPendingAssignedRefresh(), true, 'a change arriving during load schedules one follow-up refresh');
  assert.equal(pendingRefresh.calls.assigned, 0, 'the in-flight request is not duplicated immediately');
}


{
  const flushStart = html.indexOf(' function flushTableStorageNow(){');
  const flushEnd = html.indexOf(' function scheduleTableStorageSave()', flushStart);
  assert.ok(flushStart >= 0 && flushEnd > flushStart, 'the built-in storage writer must exist');
  const flushSource = html.slice(flushStart, flushEnd);
  const persisted = new Map([['team-follow-up-builtin-dynamodb-tables-v4', JSON.stringify({
    workItems: [
      { itemId: 'task-a', type: 'task', name: 'A from another tab', version: 2 },
      { itemId: 'task-b', type: 'task', name: 'B old', version: 1 }
    ],
    archiveItems: [],
    userProfiles: [{ userId: 'u1', displayName: 'Updated elsewhere' }]
  })]]);
  const storage = {
    getItem: key => persisted.has(key) ? persisted.get(key) : null,
    setItem: (key, value) => persisted.set(key, String(value)),
    key: index => [...persisted.keys()][index] || null,
    get length() { return persisted.size; },
    removeItem: key => persisted.delete(key)
  };
  const writerMemory = {
    workItems: [
      { itemId: 'task-a', type: 'task', name: 'A stale in this tab', version: 1 },
      { itemId: 'task-b', type: 'task', name: 'B from this tab', version: 2 }
    ],
    archiveItems: [],
    userProfiles: [{ userId: 'u1', displayName: 'Stale profile' }],
    activityEvents: []
  };
  const flushContext = {
    localStorage: storage,
    TABLES_KEY: 'team-follow-up-builtin-dynamodb-tables-v4',
    memoryTables: writerMemory,
    pendingRealtimeChange: { changeId: 'change-b', itemIds: ['task-b'] },
    pendingBuiltinProfileIds: new Set(),
    tableStorageSaveTimer: 0,
    activityTableLoaded: false,
    activityTableDirty: false,
    clearTimeout() {},
    clone: value => JSON.parse(JSON.stringify(value ?? null)),
    publishBuiltinRealtimeChange: change => { flushContext.published = change; },
    console: { warn() {} }
  };
  vm.runInNewContext(flushSource + '\nthis.flushTableStorageNow=flushTableStorageNow;', flushContext);
  flushContext.flushTableStorageNow();
  const merged = JSON.parse(storage.getItem('team-follow-up-builtin-dynamodb-tables-v4'));
  const byId = new Map(merged.workItems.map(row => [row.itemId, row]));
  assert.equal(byId.get('task-a').name, 'A from another tab', 'a stale writer cannot overwrite a different item saved by another tab');
  assert.equal(byId.get('task-b').name, 'B from this tab', 'the current tab still persists its own changed item');
  assert.equal(merged.userProfiles[0].displayName, 'Updated elsewhere', 'an unrelated profile snapshot is not overwritten by a stale tab');
  assert.equal(flushContext.published.changeId, 'change-b', 'the compact notification is published after the merged snapshot is persisted');
}

{
  const uniqueStart = html.indexOf('  const normalizeItemName=value=>');
  const uniqueEnd = html.indexOf('  if(method===', uniqueStart);
  assert.ok(uniqueStart >= 0 && uniqueEnd > uniqueStart, 'global item-name validation must exist in the built-in adapter');
  const uniqueSource = html.slice(uniqueStart, uniqueEnd);
  const uniqueContext = {
    tables: {
      workItems: [{ itemId: 'project-1', type: 'project', name: 'Network Upgrade' }],
      archiveItems: [{ archiveId: 'followup-1', itemId: 'followup-1', type: 'followup', name: 'Prepare Release' }]
    },
    String, Error
  };
  vm.runInNewContext(uniqueSource + '\nthis.assertUniqueItemName=assertUniqueItemName;', uniqueContext);
  assert.throws(() => uniqueContext.assertUniqueItemName(' network   upgrade ', 'task-2'), /unique across Projects/);
  assert.throws(() => uniqueContext.assertUniqueItemName('PREPARE RELEASE', 'job-2'), /unique across Projects/);
  assert.doesNotThrow(() => uniqueContext.assertUniqueItemName('Network Upgrade', 'project-1'), 'an item may retain its own name while editing');
  assert.doesNotThrow(() => uniqueContext.assertUniqueItemName('A distinct name', 'task-2'));
}


{
  const reconcileStart = html.indexOf(' function reconcileBuiltinTablesFromDisk(){');
  const reconcileEnd = html.indexOf(' function publishBuiltinRealtimeChange(change){', reconcileStart);
  const mergeStart = html.indexOf(' function mergeBuiltinTablesFromDisk(change){');
  const mergeEnd = html.indexOf(' function receiveBuiltinRealtimeChange(change){', mergeStart);
  assert.ok(reconcileStart >= 0 && reconcileEnd > reconcileStart && mergeStart >= 0 && mergeEnd > mergeStart,
    'the demo must provide a durable cross-tab reconciliation path');
  const stored = {
    workItems: [
      { itemId: 'task-a', type: 'task', parentId: 'project-1', rootParentId: 'project-1', name: 'A latest', ownerId: 'u1', version: 2 },
      { itemId: 'task-b', type: 'task', parentId: 'project-1', rootParentId: 'project-1', name: 'B latest', ownerId: 'u2', version: 2 }
    ],
    archiveItems: [], userProfiles: []
  };
  const state = {
    memoryTables: {
      workItems: [
        { itemId: 'task-a', type: 'task', parentId: 'project-1', rootParentId: 'project-1', name: 'A stale', ownerId: 'u1', version: 1 },
        { itemId: 'task-b', type: 'task', parentId: 'project-1', rootParentId: 'project-1', name: 'B stale', ownerId: 'u2', version: 1 }
      ],
      archiveItems: [], userProfiles: []
    },
    localStorage: { getItem: () => JSON.stringify(stored) },
    TABLES_KEY: 'tables',
    pendingRealtimeChange: null,
    pendingBuiltinProfileIds: new Set(),
    tableStorageSaveTimer: 0,
    activityTableLoaded: false,
    realtimeListeners: new Set(),
    seenRealtimeChangeIds: new Set(),
    calls: [],
    builtinItemMap: context.builtinItemMap,
    builtinItemRoot: context.builtinItemRoot,
    createBuiltinRealtimeChange: context.createBuiltinRealtimeChange,
    clone: value => JSON.parse(JSON.stringify(value ?? null)),
    console: { warn() {} }
  };
  state.realtimeListeners.add(change => state.calls.push(change));
  vm.runInNewContext(
    helpers + '\n' + html.slice(mergeStart, mergeEnd) + '\n' +
    html.slice(reconcileStart, reconcileEnd) +
    '\nthis.reconcileBuiltinTablesFromDisk=reconcileBuiltinTablesFromDisk;',
    state
  );
  state.reconcileBuiltinTablesFromDisk();
  assert.deepEqual(state.memoryTables.workItems.map(row => row.name), ['A latest', 'B latest'],
    'reconciliation merges every missed item change, not only the most recent signal payload');
  assert.equal(state.calls.length, 1);
  assert.deepEqual([...state.calls[0].itemIds].sort(), ['task-a', 'task-b']);
}

assert.ok(html.includes("new BroadcastChannel('team-follow-up-demo-realtime-v1')"),
  'same-origin demo tabs use BroadcastChannel for prompt update delivery.');
assert.ok(html.includes("event.key!==REALTIME_SIGNAL_KEY||!event.newValue"),
  'localStorage storage events provide a fallback for browsers without BroadcastChannel.');
assert.ok(html.includes('setInterval(pollBuiltinRealtimeSignal,5000)') && html.includes('function reconcileBuiltinTablesFromDisk()'),
  'active demo tabs periodically reconcile the full persisted delta so missed or coalesced notifications cannot leave another tab stale.');
assert.ok(html.includes("if(persisted){") && html.includes("const changedIds=new Set(pendingRealtimeChange?.itemIds||[])"),
  'the demo merges only locally changed item IDs into the latest persisted snapshot before publishing.');
assert.ok(html.includes('function subscribeRealtimeChanges(listener)'),
  'the in-app view layer subscribes to normalized change hints.');
assert.ok(html.includes("window.TeamFollowUpDataApi=Object.freeze({mode,tableNames:names,request,bootstrap,commitSnapshot,subscribeRealtimeChanges,"),
  'the built-in data adapter exports the change subscription without altering the API item/write contract.');
assert.ok(html.includes("window.__TEAM_FOLLOW_UP_DEMO_REALTIME_UNSUBSCRIBE=window.TeamFollowUpDataApi?.mode==='api'?null:window.TeamFollowUpDataApi?.subscribeRealtimeChanges?.(change=>{void handleDemoRealtimeChange(change);});"),
  'the demo workspace subscribes to cross-tab change hints only in built-in mode.');
assert.ok(html.includes('if(demoAssignedRefreshPending&&ui.page===\'account\'&&ui.accountTab===\'assigned\')'),
  'an event arriving during an Assigned Items request schedules a follow-up refresh.');

console.log('Demo real-time tests passed: compact assignee/root metadata, create/archive events, cross-tab transport, durable publication and targeted view subscriptions.');
