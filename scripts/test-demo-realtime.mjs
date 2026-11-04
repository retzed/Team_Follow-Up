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
assert.ok(html.includes("if(dataLoadState.parentsReady&&topLevelIds.has(String(ui.selectedParentId||''))&&!data.parents.some(row=>String(row.id)===String(ui.selectedParentId))){"),
  'A real-time update arriving during bootstrap must not replace the selected parent while the parent list is still loading.');
const handlerSource = html.slice(handlerStart, handlerEnd);

function createHandlerContext(userId, loading = false, resolvedItems = [], activityEvents = []) {
  const calls = { assigned: 0, roots: 0, parentRenders: 0, detailRenders: 0, accountRenders: 0, resolved: [], activityReads: [], activityMerged: [], activityHistoryUpdates: [], activityRendered: [], activityRefreshes: [], applicationHistoryRefreshes: [] };
  const ui = {
    actingUserId: userId,
    page: 'account',
    accountTab: 'assigned',
    accountAssignedLoaded: true,
    accountAssignedLoading: loading,
    accountAssignedRows: userId === 'u1' ? [{ id: 'task-1', type: 'task', ownerId: 'u1' }] : [],
    accountPinnedLoaded: true,
    accountPinnedRows: [],
    modal: null,
    selectedParentId: 'project-1'
  };
  const data = {
    parents: [{ id: 'project-1', type: 'project', name: 'Project', ownerId: 'u1' }],
    children: [],
    activity: []
  };
  const api = {
    mode: 'builtin',
    resolveItems: async ids => {
      calls.resolved.push([...ids]);
      return { items: resolvedItems.filter(item => ids.includes(String(item.id))) };
    },
    queryActivityForItems: async ids => {
      calls.activityReads.push([...ids]);
      return { events: activityEvents };
    }
  };
  const handlerContext = {
    window: { TeamFollowUpDataApi: api },
    ui,
    data,
    lastApiSnapshot: { parents: data.parents.map(row => ({ ...row })), children: [], activity: [] },
    dataLoadState: { childrenLoaded: new Set(['project-1']), activityLoaded: new Set() },
    applicationHistoryCacheInvalidated: false,
    rawCurrentUser: () => ({ id: userId }),
    rootParent: row => row?.rootParentId ? data.parents.find(parent => parent.id === row.rootParentId) || { id: row.rootParentId } : null,
    loadAccountAssignedItems: () => { calls.assigned += 1; return Promise.resolve(); },
    loadAccountPinnedItems: () => Promise.resolve(),
    renderParentList: () => { calls.parentRenders += 1; },
    renderDetail: () => { calls.detailRenders += 1; },
    renderAccountPage: () => { calls.accountRenders += 1; },
    ensureRootChildrenLoaded: async () => { calls.roots += 1; },
    refreshActivityFor: async (id, scope) => { calls.activityRefreshes.push([id, scope]); },
    refreshApplicationHistory: silent => { calls.applicationHistoryRefreshes.push(silent); },
    normalizeActivityEventForUi: event => event,
    mergeActivityEventsIntoWorkspace: rows => { calls.activityMerged.push(rows); data.activity.push(...rows); return rows.length > 0; },
    mergeActivityRows: (existing, incoming) => ({ rows: [...existing, ...incoming] }),
    updateApplicationHistoryFromCommittedEvents: rows => { calls.activityHistoryUpdates.push(rows); },
    renderAfterActivityRefresh: (id, scope) => { calls.activityRendered.push([id, scope]); },
    historyRootIdFor: id => id === 'task-1' ? 'project-1' : id,
    allItem: id => [...data.parents, ...data.children].find(row => String(row.id) === String(id)) || null,
    toAppItem: row => row,
    invalidateHierarchyIndex: () => {},
    console: { warn() {} },
    Promise, Set, Map, String, Array
  };
  vm.runInNewContext(
    'let demoAssignedRefreshPending=false;' + String.fromCharCode(10) + handlerSource + String.fromCharCode(10) +
    'this.handleDemoRealtimeChange=handleDemoRealtimeChange;' +
    'this.queueDemoRealtimeChange=queueDemoRealtimeChange;' +
    'this.hasPendingAssignedRefresh=()=>demoAssignedRefreshPending;',
    handlerContext
  );
  return { handlerContext, calls, ui, data, api };
}

{
  const change = {
    type: 'items.changed', changeId: 'assignment-u1-u2', itemId: 'task-1',
    itemIds: ['task-1'], rootParentIds: ['project-1'], assigneeIds: ['u1', 'u2']
  };
  const updated = { id: 'task-1', type: 'task', name: 'Assigned task', rootParentId: 'project-1', parentId: 'project-1', ownerId: 'u2', version: 2 };
  const oldAssignee = createHandlerContext('u1', false, [updated]);
  const newAssignee = createHandlerContext('u2', false, [updated]);
  const unrelatedUser = createHandlerContext('u3', false, [updated]);

  await oldAssignee.handlerContext.handleDemoRealtimeChange(change);
  await newAssignee.handlerContext.handleDemoRealtimeChange(change);
  await unrelatedUser.handlerContext.handleDemoRealtimeChange(change);

  assert.equal(oldAssignee.ui.accountAssignedLoaded, true, 'an already-loaded previous-assignee view is updated without an extra fetch');
  assert.equal(newAssignee.ui.accountAssignedLoaded, true, 'an already-loaded new-assignee view stays authoritative');
  assert.equal(oldAssignee.ui.accountAssignedRows.length, 0, 'the previous assignee loses the reassigned item immediately');
  assert.equal(newAssignee.ui.accountAssignedRows.length, 1, 'the new assignee receives the exact updated item immediately');
  assert.equal(newAssignee.ui.accountAssignedRows[0].version, 2);
  assert.equal(oldAssignee.calls.assigned, 0, 'the previous assignee does not issue a stale secondary index reload');
  assert.equal(newAssignee.calls.assigned, 0, 'the new assignee does not issue a stale secondary index reload');
  assert.equal(unrelatedUser.calls.assigned, 0, 'unrelated demo users do not reload Assigned Items');
}

{
  const rootCreated = createHandlerContext('u2', false, [{
    id: 'project-created-remotely', type: 'project', name: 'Created in another session', ownerId: 'u2', version: 1
  }]);
  await rootCreated.handlerContext.handleDemoRealtimeChange({
    type: 'items.changed', changeId: 'parent-created-remotely',
    itemId: 'project-created-remotely', itemIds: ['project-created-remotely'],
    rootParentIds: ['project-created-remotely'], topLevelIds: ['project-created-remotely'],
    parentIds: [], assigneeIds: ['u2'], deleted: false
  });
  assert.ok(rootCreated.data.parents.some(row => row.id === 'project-created-remotely'),
    'a parent created in another active demo tab is inserted into this workspace');
  assert.ok(rootCreated.ui.accountAssignedRows.some(row => row.id === 'project-created-remotely'),
    'the new parent appears in the current assignee profile when assigned to that user');
  assert.ok(rootCreated.calls.parentRenders > 0, 'a new parent immediately refreshes the visible parent list');
}

{
  const pendingRefresh = createHandlerContext('u2', true, [
    { id: 'task-2', type: 'task', rootParentId: 'project-1', ownerId: 'u2', version: 1 }
  ]);
  await pendingRefresh.handlerContext.handleDemoRealtimeChange({
    type: 'items.changed', changeId: 'assignment-while-loading', itemId: 'task-2',
    itemIds: ['task-2'], rootParentIds: ['project-1'], assigneeIds: ['u1', 'u2']
  });
  assert.equal(pendingRefresh.ui.accountAssignedLoaded, false, 'a change arriving during load invalidates the in-flight view');
  assert.equal(pendingRefresh.handlerContext.hasPendingAssignedRefresh(), true, 'a change arriving during load schedules one follow-up refresh');
  assert.equal(pendingRefresh.calls.assigned, 0, 'the in-flight request is not duplicated immediately');
}

{
  const queued = createHandlerContext('u2');
  let releaseFirst;
  let startedFirst;
  const firstStarted = new Promise(resolve => { startedFirst = resolve; });
  let calls = 0;
  const firstResult = new Promise(resolve => { releaseFirst = resolve; });
  queued.api.resolveItems = async ids => {
    calls++;
    queued.calls.resolved.push([...ids]);
    if (calls === 1) { startedFirst(); return firstResult; }
    return { items: [{
      id: 'task-new', type: 'task', name: 'Edited after create',
      parentId: 'project-1', rootParentId: 'project-1', ownerId: 'u2', version: 2
    }] };
  };
  const createdChange = {
    type: 'items.changed', changeId: 'item-created',
    itemId: 'task-new', itemIds: ['task-new'], rootParentIds: ['project-1'],
    assigneeIds: ['u2'], deleted: false
  };
  const editedChange = {
    type: 'items.changed', changeId: 'item-edited',
    itemId: 'task-new', itemIds: ['task-new'], rootParentIds: ['project-1'],
    assigneeIds: ['u2'], deleted: false
  };
  const first = queued.handlerContext.queueDemoRealtimeChange(createdChange);
  const second = queued.handlerContext.queueDemoRealtimeChange(editedChange);
  await firstStarted;
  assert.equal(calls, 1, 'the edit notification waits until the create notification has been reconciled');
  releaseFirst({ items: [{
    id: 'task-new', type: 'task', name: 'Created item',
    parentId: 'project-1', rootParentId: 'project-1', ownerId: 'u2', version: 1
  }] });
  await first;
  await second;
  assert.equal(calls, 2);
  assert.equal(queued.data.children.length, 1, 'the item is retained as one record after create followed by edit');
  assert.equal(queued.data.children[0].name, 'Edited after create', 'the later edit cannot be overwritten by a slower create refresh');
  assert.equal(queued.data.children[0].version, 2);
  assert.equal(queued.ui.accountAssignedRows[0].version, 2, 'Assigned Items also retains the latest committed version');
  assert.equal(queued.calls.roots, 0, 'real-time item changes do not replace the subtree with a delayed query');
}


{
  const event = { id: 'evt-task-activity', itemId: 'task-1', rootParentId: 'project-1', at: '2026-11-03T10:00:00.000Z', action: 'Updated task' };
  const updated = { id: 'task-1', type: 'task', name: 'Updated task', rootParentId: 'project-1', parentId: 'project-1', ownerId: 'u2', version: 2 };
  const { handlerContext, calls, ui, data } = createHandlerContext('u2', false, [updated], [event]);
  ui.page = 'workspace';
  ui.tab = 'activity';
  handlerContext.dataLoadState.activityLoaded.add('project-1:all');
  await handlerContext.handleDemoRealtimeChange({
    type: 'items.changed', changeId: 'activity-realtime',
    itemId: 'task-1', itemIds: ['task-1'], rootParentIds: ['project-1'],
    assigneeIds: ['u2'], parentIds: ['project-1'], topLevelIds: [], deleted: false
  });
  assert.deepEqual(calls.activityReads, [['task-1']], 'the demo reads Activity only for the item IDs in the change signal');
  assert.equal(calls.activityMerged[0][0].id, 'evt-task-activity', 'the latest audit event is merged into the workspace');
  assert.equal(calls.activityHistoryUpdates[0][0].id, 'evt-task-activity', 'the application-wide history cache receives the new audit event');
  assert.deepEqual(calls.activityRendered, [['project-1', 'all']], 'the selected workspace Activity timeline refreshes in real time');
  assert.equal(data.activity[0].id, 'evt-task-activity');
}

{
  const event = { id: 'evt-global-history', itemId: 'task-1', rootParentId: 'project-1', at: '2026-11-03T10:00:00.000Z', action: 'Updated task' };
  const updated = { id: 'task-1', type: 'task', rootParentId: 'project-1', ownerId: 'u2', version: 2 };
  const { handlerContext, calls, ui } = createHandlerContext('u2', false, [updated], [event]);
  ui.modal = { kind: 'global-history' };
  handlerContext.applicationHistoryCacheInvalidated = true;
  await handlerContext.handleDemoRealtimeChange({
    type: 'items.changed', changeId: 'global-activity-realtime',
    itemId: 'task-1', itemIds: ['task-1'], rootParentIds: ['project-1'],
    assigneeIds: ['u2'], deleted: false
  });
  assert.deepEqual(calls.applicationHistoryRefreshes, [false], 'an open global Activity history view reloads visibly after its cache becomes stale');
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
  const flushStart = html.indexOf(' function flushTableStorageNow(){');
  const flushEnd = html.indexOf(' function scheduleTableStorageSave()', flushStart);
  assert.ok(flushStart >= 0 && flushEnd > flushStart, 'the demo storage flush helper must exist');
  const flushSource = html.slice(flushStart, flushEnd);
  const activityIds = Array.from({ length: 5000 }, (_, index) => 'evt-' + index);
  const pending = new Set(['evt-4999']);
  const attempted = [];
  const storage = new Map([['team-follow-up-builtin-dynamodb-tables-v4', JSON.stringify({
    workItems: [], archiveItems: [], userProfiles: []
  })]]);
  const context = {
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      key: index => [...storage.keys()][index] || null,
      get length() { return storage.size; },
      removeItem: key => storage.delete(key)
    },
    TABLES_KEY: 'team-follow-up-builtin-dynamodb-tables-v4',
    memoryTables: {
      workItems: [], archiveItems: [], userProfiles: [],
      activityEvents: activityIds.map(eventId => ({ eventId, itemId: 'task-1' }))
    },
    pendingRealtimeChange: null,
    pendingBuiltinProfileIds: new Set(),
    pendingActivityEventIds: pending,
    tableStorageSaveTimer: 0,
    activityTableLoaded: true,
    activityTableDirty: true,
    persistActivityEvent: event => {
      attempted.push(event.eventId);
      pending.delete(String(event.eventId));
      return event;
    },
    clearTimeout() {},
    clone: value => JSON.parse(JSON.stringify(value ?? null)),
    publishBuiltinRealtimeChange() {},
    console: { warn() {} }
  };
  vm.runInNewContext(flushSource + '\nthis.flushTableStorageNow=flushTableStorageNow;', context);
  context.flushTableStorageNow();
  assert.deepEqual(attempted, ['evt-4999'],
    'an item save must retry only Activity events whose individual localStorage write previously failed, not rewrite all 5,000 history rows');
  assert.equal(context.activityTableDirty, false, 'successful pending-event retries clear the Activity dirty flag');
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

{
  const writeStart = html.indexOf(' function writeTables(t){');
  const writeEnd = html.indexOf(' function ensureIndexFields(', writeStart);
  assert.ok(writeStart >= 0 && writeEnd > writeStart, 'the built-in table writer must exist');
  const writeSource = html.slice(writeStart, writeEnd);
  assert.ok(!writeSource.includes('else if(activityTableLoaded)activityTableDirty=true'),
    'ordinary item or profile table writes must not mark the entire Activity cache dirty');
  const storeStart = html.indexOf('function storeActivityEvent(tables,raw){');
  const storeEnd = html.indexOf('function toAppItem(record){', storeStart);
  assert.ok(storeStart >= 0 && storeEnd > storeStart, 'the Activity event writer must exist');
  const storeSource = html.slice(storeStart, storeEnd);
  assert.ok(!storeSource.includes('activityTableDirty=true'),
    'successful append-only Activity writes are already persisted individually and must not queue a full-history rewrite');
  assert.ok(html.includes('pendingActivityEventIds.add(String(event.eventId))'),
    'only failed individual event writes are queued for retry');
  assert.ok(html.includes('for(const eventId of [...pendingActivityEventIds])'),
    'the table flush retries only failed event IDs, not the complete history');
}

assert.ok(handlerSource.includes('api.queryActivityForItems') && handlerSource.includes('mergeActivityEventsIntoWorkspace(activityEvents)'),
  'the demo reconciles Activity events by changed item IDs rather than waiting for a parent index update');
assert.ok(handlerSource.includes("renderAfterActivityRefresh(rootId,'all')"),
  'the selected workspace Activity timeline is refreshed when an affected root changes');
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
assert.ok(html.includes("window.TeamFollowUpDataApi=Object.freeze({mode,tableNames:names,request,bootstrap,commitSnapshot,commitItemMutation,subscribeRealtimeChanges,"),
  'the built-in data adapter exports the change subscription and incremental item writer.');
assert.ok(html.includes("window.__TEAM_FOLLOW_UP_DEMO_REALTIME_UNSUBSCRIBE=window.TeamFollowUpDataApi?.mode==='api'?null:window.TeamFollowUpDataApi?.subscribeRealtimeChanges?.(change=>{void queueDemoRealtimeChange(change);});"),
  'the demo workspace subscribes to cross-tab change hints only in built-in mode.');
assert.ok(html.includes('if(demoAssignedRefreshPending&&ui.page===\'account\'&&ui.accountTab===\'assigned\')'),
  'an event arriving during an Assigned Items request schedules a follow-up refresh.');

console.log('Demo real-time tests passed: compact assignee/root metadata, create/archive events, cross-tab transport, durable publication and targeted view subscriptions.');
