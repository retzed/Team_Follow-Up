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

assert.ok(html.includes("new BroadcastChannel('team-follow-up-demo-realtime-v1')"),
  'same-origin demo tabs use BroadcastChannel for prompt update delivery.');
assert.ok(html.includes("event.key!==REALTIME_SIGNAL_KEY||!event.newValue"),
  'localStorage storage events provide a fallback for browsers without BroadcastChannel.');
assert.ok(html.includes("if(persisted&&pendingRealtimeChange){const change=pendingRealtimeChange;pendingRealtimeChange=null;publishBuiltinRealtimeChange(change);}"),
  'the demo broadcasts only after the changed tables have been persisted.');
assert.ok(html.includes('function subscribeRealtimeChanges(listener)'),
  'the in-app view layer subscribes to normalized change hints.');
assert.ok(html.includes("window.TeamFollowUpDataApi=Object.freeze({mode,tableNames:names,request,bootstrap,commitSnapshot,subscribeRealtimeChanges,"),
  'the built-in data adapter exports the change subscription without altering the API item/write contract.');
assert.ok(html.includes("window.__TEAM_FOLLOW_UP_DEMO_REALTIME_UNSUBSCRIBE=window.TeamFollowUpDataApi?.mode==='api'?null:window.TeamFollowUpDataApi?.subscribeRealtimeChanges?.(change=>{void handleDemoRealtimeChange(change);});"),
  'the demo workspace subscribes to cross-tab change hints only in built-in mode.');
assert.ok(html.includes('if(demoAssignedRefreshPending&&ui.page===\'account\'&&ui.accountTab===\'assigned\')'),
  'an event arriving during an Assigned Items request schedules a follow-up refresh.');

console.log('Demo real-time tests passed: compact assignee/root metadata, create/archive events, cross-tab transport, durable publication and targeted view subscriptions.');
