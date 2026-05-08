// ── HVAC Nexus — Project Plan ──
// Project-scoped checklist module. Multiple plans per project supported.
// Data: dbGetProjectPlans(projectNum) → array of plan objects
//
// Plan shape:
// {
//   id: 'pp_xxx',
//   name: 'Main works',
//   templateId: null,            // company template applied (PR2)
//   createdAt: '2026-05-09',
//   archived: false,
//   phases: [
//     { id, name, stages: [
//         { id, name, items: [
//             { id, description, status, assignedTo, dueDate, link, comment,
//               completedAt, completedBy }
//         ]}
//     ]}
//   ]
// }
//
// status: 'to_do' | 'in_progress' | 'done' | 'not_required' | 'blocked'

let PP_PLANS = [];          // all plans for this project
let PP_CURRENT_PLAN_ID = null;
let PP_CURRENT_PHASE_ID = null;
let PP_USERS = [];          // for assignment dropdown
let PP_PROJECT_NUM = null;
let PP_SEARCH = '';
let PP_FILTER_STATUS = 'all';
let PP_FILTER_ASSIGNEE = 'all';
let PP_SHOW_ARCHIVED = false;

const PP_DEFAULT_PHASES = [
  { name: 'Initiation & planning', stages: ['01 Initiation', '02 Dilapidation', '03 Planning'] },
  { name: 'Construction', stages: ['Setup', 'Isolation', 'Demolition', 'Rigging', 'Rough in'] },
  { name: 'Commissioning', stages: ['01 Commissioning documentation', '02 Pre-commissioning', '03 Commissioning'] },
  { name: 'Handover', stages: ['Asset register', 'O&M manuals', 'Training'] }
];

const STATUS_LABELS = {
  to_do:        { label: 'To do',        cls: 'pp-st-todo' },
  in_progress:  { label: 'In progress',  cls: 'pp-st-prog' },
  done:         { label: 'Done',         cls: 'pp-st-done' },
  not_required: { label: 'Not required', cls: 'pp-st-nr'   },
  blocked:      { label: 'Blocked',      cls: 'pp-st-blk'  }
};

// ─── Utilities ─────────────────────────────────────────────
function ppUid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function ppEsc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function ppToday() {
  return new Date().toISOString().slice(0, 10);
}
function ppCurrentPlan() {
  return PP_PLANS.find(p => p.id === PP_CURRENT_PLAN_ID) || null;
}
function ppCurrentPhase() {
  const plan = ppCurrentPlan();
  if (!plan) return null;
  return plan.phases.find(ph => ph.id === PP_CURRENT_PHASE_ID) || plan.phases[0] || null;
}
function ppFindItem(itemId) {
  const plan = ppCurrentPlan();
  if (!plan) return null;
  for (const ph of plan.phases) {
    for (const st of ph.stages) {
      const it = st.items.find(i => i.id === itemId);
      if (it) return { item: it, stage: st, phase: ph };
    }
  }
  return null;
}
function ppCurrentUserName() {
  try {
    const u = dbGetCurrentUser();
    if (u && u.name) return u.name;
    if (u && u.email) return u.email;
  } catch(e) {}
  try {
    const sess = JSON.parse(localStorage.getItem('hvacnexus_session') || '{}');
    return sess.user?.user_metadata?.name || sess.user?.email || 'Unknown';
  } catch(e) {}
  return 'Unknown';
}
function ppIsOverdue(item) {
  if (!item.dueDate) return false;
  if (item.status === 'done' || item.status === 'not_required') return false;
  return item.dueDate < ppToday();
}

// ─── Init ──────────────────────────────────────────────────
async function ppInit() {
  const proj = dbGetCurrentProject();
  if (!proj || !proj.num) {
    document.getElementById('pp-content').innerHTML = '<div class="pp-empty">No project selected. <a href="index.html">Choose a project</a> first.</div>';
    return;
  }
  PP_PROJECT_NUM = proj.num;

  document.getElementById('pp-proj-tag').textContent = 'Project · ' + proj.num + ' ' + (proj.name || '');

  // Load plans + users in parallel
  const [plans, users] = await Promise.all([
    dbGetProjectPlans(PP_PROJECT_NUM),
    dbGetUsers()
  ]);
  PP_PLANS = Array.isArray(plans) ? plans : [];
  PP_USERS = Array.isArray(users) ? users : [];

  // Pick first non-archived plan as current, or null if none
  const visible = PP_PLANS.filter(p => !p.archived);
  if (visible.length) {
    PP_CURRENT_PLAN_ID = visible[0].id;
    const plan = ppCurrentPlan();
    PP_CURRENT_PHASE_ID = plan && plan.phases.length ? plan.phases[0].id : null;
  }

  ppRender();
}

// ─── Render ────────────────────────────────────────────────
function ppRender() {
  const visiblePlans = PP_PLANS.filter(p => PP_SHOW_ARCHIVED || !p.archived);
  const plan = ppCurrentPlan();

  // Plan switcher dropdown
  let planOpts = visiblePlans.map(p =>
    '<option value="' + ppEsc(p.id) + '"' + (p.id === PP_CURRENT_PLAN_ID ? ' selected' : '') + '>' +
    ppEsc(p.name) + (p.archived ? ' (archived)' : '') + '</option>'
  ).join('');
  if (!visiblePlans.length) planOpts = '<option>— no plans yet —</option>';
  document.getElementById('pp-plan-switcher').innerHTML = planOpts;

  if (!plan) {
    document.getElementById('pp-content').innerHTML = `
      <div class="pp-empty">
        <div style="font-size:32px; margin-bottom:8px;">📅</div>
        <div style="font-size:16px; font-weight:500; margin-bottom:6px;">No plans yet for this project</div>
        <div style="color:var(--muted); margin-bottom:16px;">Create your first plan from scratch, or import an Excel template.</div>
        <button class="btn primary" onclick="ppNewPlan()">+ New plan</button>
        <button class="btn" onclick="ppImportExcel()">Import from Excel</button>
      </div>`;
    return;
  }

  // Stats
  const stats = ppPlanStats(plan);
  document.getElementById('pp-stat-total').textContent = stats.total;
  document.getElementById('pp-stat-done').textContent = stats.done;
  document.getElementById('pp-stat-prog').textContent = stats.inProgress;
  document.getElementById('pp-stat-overdue').textContent = stats.overdue;

  // Phase tabs
  const phaseTabs = plan.phases.map(ph => {
    const active = ph.id === PP_CURRENT_PHASE_ID;
    const phStats = ppPhaseStats(ph);
    return `<div class="pp-tab ${active ? 'active' : ''}" onclick="ppSelectPhase('${ph.id}')">
      <span>${ppEsc(ph.name)}</span>
      <span class="pp-tab-count">${phStats.done}/${phStats.total}</span>
    </div>`;
  }).join('');
  document.getElementById('pp-phase-tabs').innerHTML = phaseTabs;

  // Assignee filter options
  const assigneeOpts = ['<option value="all">All assignees</option>',
    '<option value="unassigned">— Unassigned —</option>'].concat(
    PP_USERS.map(u => '<option value="' + ppEsc(u.email || u.id) + '"' +
      (PP_FILTER_ASSIGNEE === (u.email || u.id) ? ' selected' : '') + '>' +
      ppEsc(u.name || u.email) + '</option>')
  ).join('');
  document.getElementById('pp-filter-assignee').innerHTML = assigneeOpts;

  // Current phase content
  const phase = ppCurrentPhase();
  if (!phase) {
    document.getElementById('pp-content').innerHTML = '<div class="pp-empty">No phase selected.</div>';
    return;
  }

  let html = '';
  for (const stage of phase.stages) {
    html += ppRenderStage(stage);
  }
  if (!phase.stages.length) {
    html = `<div class="pp-empty">No stages in this phase yet. <button class="btn primary" onclick="ppAddStage()">+ Add stage</button></div>`;
  } else {
    html += `<div style="margin-top:12px;"><button class="btn" onclick="ppAddStage()">+ Add stage</button></div>`;
  }
  document.getElementById('pp-content').innerHTML = html;
}

function ppRenderStage(stage) {
  const stats = ppStageStats(stage);
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  let itemsHtml = '';
  const filtered = stage.items.filter(it => ppItemMatchesFilters(it));
  for (const it of filtered) itemsHtml += ppRenderItem(it, stage.id);

  if (!stage.items.length) {
    itemsHtml = `<div class="pp-empty-stage">No items. <a onclick="ppAddItem('${stage.id}')">+ Add item</a></div>`;
  } else if (!filtered.length) {
    itemsHtml = `<div class="pp-empty-stage">No items match the current filters.</div>`;
  }

  return `
    <div class="pp-stage" data-stage="${stage.id}">
      <div class="pp-stage-hdr" onclick="ppToggleStage('${stage.id}')">
        <span class="pp-chev" id="chev-${stage.id}">▾</span>
        <span class="pp-stage-name">${ppEsc(stage.name)}</span>
        <span class="pp-stage-count">${stats.done} of ${stats.total} done</span>
        <div style="flex:1;"></div>
        <div class="pp-progbar"><div class="pp-progbar-fill" style="width:${pct}%;"></div></div>
        <span class="pp-stage-menu" onclick="event.stopPropagation(); ppStageMenu('${stage.id}', event)">⋯</span>
      </div>
      <div class="pp-stage-items" id="items-${stage.id}">
        ${itemsHtml}
        <div class="pp-add-item-row">
          <a onclick="ppAddItem('${stage.id}')">+ Add item</a>
        </div>
      </div>
    </div>`;
}

function ppRenderItem(item, stageId) {
  const isDone = item.status === 'done';
  const isNR = item.status === 'not_required';
  const overdue = ppIsOverdue(item);
  const stClass = STATUS_LABELS[item.status]?.cls || 'pp-st-todo';
  const stLabel = STATUS_LABELS[item.status]?.label || 'To do';

  const userName = ppLookupUserName(item.assignedTo);
  const meta = [];
  if (isDone && item.completedAt) meta.push('Completed ' + ppFmtDate(item.completedAt) + (item.completedBy ? ' · ' + ppEsc(item.completedBy) : ''));
  else if (overdue) meta.push('<span style="color:var(--danger)">Overdue · was due ' + ppFmtDate(item.dueDate) + '</span>');
  else if (item.dueDate) meta.push('Due ' + ppFmtDate(item.dueDate));
  if (item.comment) meta.push('💬');

  return `
    <div class="pp-item ${overdue ? 'pp-item-overdue' : ''}" data-item="${item.id}">
      <input type="checkbox" class="pp-check" ${isDone ? 'checked' : ''} onchange="ppToggleDone('${item.id}', this.checked)" />
      <div class="pp-item-main" onclick="ppOpenItem('${item.id}')">
        <div class="pp-item-desc ${isDone || isNR ? 'pp-item-strike' : ''}">${ppEsc(item.description)}</div>
        ${meta.length ? '<div class="pp-item-meta">' + meta.join(' · ') + '</div>' : ''}
      </div>
      <span class="pp-status ${stClass}" onclick="ppCycleStatus('${item.id}')">${stLabel}</span>
      <span class="pp-assignee">${ppEsc(userName)}</span>
      <span class="pp-link">${item.link ? '<a href="' + ppEsc(item.link) + '" target="_blank" onclick="event.stopPropagation()">🔗</a>' : ''}</span>
      <span class="pp-item-menu" onclick="event.stopPropagation(); ppItemMenu('${item.id}', event)">⋯</span>
    </div>`;
}

function ppLookupUserName(emailOrId) {
  if (!emailOrId) return '— Unassigned —';
  const u = PP_USERS.find(x => x.email === emailOrId || x.id === emailOrId);
  return u ? (u.name || u.email) : emailOrId;
}
function ppFmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
  } catch(e) { return iso; }
}

// ─── Stats ─────────────────────────────────────────────────
function ppPlanStats(plan) {
  let total = 0, done = 0, inProgress = 0, overdue = 0;
  for (const ph of plan.phases) {
    for (const st of ph.stages) {
      for (const it of st.items) {
        total++;
        if (it.status === 'done') done++;
        else if (it.status === 'in_progress') inProgress++;
        if (ppIsOverdue(it)) overdue++;
      }
    }
  }
  return { total, done, inProgress, overdue };
}
function ppPhaseStats(phase) {
  let total = 0, done = 0;
  for (const st of phase.stages) {
    for (const it of st.items) {
      total++;
      if (it.status === 'done') done++;
    }
  }
  return { total, done };
}
function ppStageStats(stage) {
  let total = stage.items.length, done = 0;
  for (const it of stage.items) if (it.status === 'done') done++;
  return { total, done };
}

// ─── Filters ───────────────────────────────────────────────
function ppItemMatchesFilters(item) {
  if (PP_SEARCH && !(item.description || '').toLowerCase().includes(PP_SEARCH)) return false;
  if (PP_FILTER_STATUS !== 'all') {
    if (PP_FILTER_STATUS === 'overdue') { if (!ppIsOverdue(item)) return false; }
    else if (item.status !== PP_FILTER_STATUS) return false;
  }
  if (PP_FILTER_ASSIGNEE !== 'all') {
    if (PP_FILTER_ASSIGNEE === 'unassigned') { if (item.assignedTo) return false; }
    else if (item.assignedTo !== PP_FILTER_ASSIGNEE) return false;
  }
  return true;
}
function ppOnSearch(v) {
  PP_SEARCH = (v || '').toLowerCase().trim();
  ppRender();
}
function ppOnFilterStatus(v) { PP_FILTER_STATUS = v; ppRender(); }
function ppOnFilterAssignee(v) { PP_FILTER_ASSIGNEE = v; ppRender(); }

// ─── Plan management ────────────────────────────────────────
function ppOnPlanChange(v) {
  PP_CURRENT_PLAN_ID = v;
  const plan = ppCurrentPlan();
  PP_CURRENT_PHASE_ID = plan && plan.phases.length ? plan.phases[0].id : null;
  ppRender();
}

function ppNewPlan() {
  const name = prompt('Plan name (e.g. "Main works", "Plant room", "L3 fitout"):');
  if (!name || !name.trim()) return;
  const plan = ppBlankPlan(name.trim());
  PP_PLANS.push(plan);
  PP_CURRENT_PLAN_ID = plan.id;
  PP_CURRENT_PHASE_ID = plan.phases[0].id;
  ppSave();
  ppRender();
}

function ppBlankPlan(name) {
  return {
    id: ppUid('pp'),
    name: name,
    templateId: null,
    createdAt: ppToday(),
    archived: false,
    phases: PP_DEFAULT_PHASES.map(p => ({
      id: ppUid('ph'),
      name: p.name,
      stages: p.stages.map(s => ({ id: ppUid('st'), name: s, items: [] }))
    }))
  };
}

function ppDuplicatePlan() {
  const plan = ppCurrentPlan();
  if (!plan) return;
  const newName = prompt('Name for the duplicated plan:', plan.name + ' (copy)');
  if (!newName || !newName.trim()) return;

  const copy = JSON.parse(JSON.stringify(plan));
  copy.id = ppUid('pp');
  copy.name = newName.trim();
  copy.createdAt = ppToday();
  copy.archived = false;
  // regenerate IDs so nothing collides
  copy.phases.forEach(ph => {
    ph.id = ppUid('ph');
    ph.stages.forEach(st => {
      st.id = ppUid('st');
      st.items.forEach(it => { it.id = ppUid('it'); });
    });
  });
  PP_PLANS.push(copy);
  PP_CURRENT_PLAN_ID = copy.id;
  PP_CURRENT_PHASE_ID = copy.phases[0]?.id || null;
  ppSave();
  ppRender();
}

function ppRenamePlan() {
  const plan = ppCurrentPlan();
  if (!plan) return;
  const n = prompt('Rename plan:', plan.name);
  if (!n || !n.trim()) return;
  plan.name = n.trim();
  ppSave();
  ppRender();
}

function ppArchivePlan() {
  const plan = ppCurrentPlan();
  if (!plan) return;
  if (!confirm(`Archive plan "${plan.name}"? You can restore it via the "Show archived" toggle.`)) return;
  plan.archived = true;
  // jump to next visible plan
  const next = PP_PLANS.find(p => !p.archived);
  PP_CURRENT_PLAN_ID = next ? next.id : null;
  PP_CURRENT_PHASE_ID = next && next.phases.length ? next.phases[0].id : null;
  ppSave();
  ppRender();
}

function ppRestorePlan() {
  const plan = ppCurrentPlan();
  if (!plan || !plan.archived) return;
  plan.archived = false;
  ppSave();
  ppRender();
}

function ppToggleArchived() {
  PP_SHOW_ARCHIVED = !PP_SHOW_ARCHIVED;
  document.getElementById('pp-show-archived-btn').textContent = PP_SHOW_ARCHIVED ? '✓ Showing archived' : 'Show archived';
  ppRender();
}

function ppSelectPhase(phaseId) {
  PP_CURRENT_PHASE_ID = phaseId;
  ppRender();
}

// ─── Stage / item editing ──────────────────────────────────
function ppToggleStage(stageId) {
  const items = document.getElementById('items-' + stageId);
  const chev = document.getElementById('chev-' + stageId);
  if (!items || !chev) return;
  const open = items.style.display !== 'none';
  items.style.display = open ? 'none' : 'block';
  chev.textContent = open ? '▸' : '▾';
}

function ppAddStage() {
  const phase = ppCurrentPhase();
  if (!phase) return;
  const name = prompt('Stage name:');
  if (!name || !name.trim()) return;
  phase.stages.push({ id: ppUid('st'), name: name.trim(), items: [] });
  ppSave();
  ppRender();
}

function ppStageMenu(stageId, ev) {
  ppCloseAnyMenu();
  const phase = ppCurrentPhase();
  if (!phase) return;
  const stage = phase.stages.find(s => s.id === stageId);
  if (!stage) return;

  const menu = document.createElement('div');
  menu.className = 'pp-popmenu';
  menu.innerHTML = `
    <div class="pp-popitem" onclick="ppRenameStage('${stageId}')">Rename stage</div>
    <div class="pp-popitem" onclick="ppMoveStageUp('${stageId}')">Move up</div>
    <div class="pp-popitem" onclick="ppMoveStageDown('${stageId}')">Move down</div>
    <div class="pp-popitem pp-popitem-danger" onclick="ppDeleteStage('${stageId}')">Delete stage</div>`;
  document.body.appendChild(menu);
  ppPositionMenu(menu, ev);
}

function ppRenameStage(stageId) {
  ppCloseAnyMenu();
  const phase = ppCurrentPhase();
  const stage = phase.stages.find(s => s.id === stageId);
  if (!stage) return;
  const n = prompt('Rename stage:', stage.name);
  if (!n || !n.trim()) return;
  stage.name = n.trim();
  ppSave(); ppRender();
}
function ppMoveStageUp(stageId) {
  ppCloseAnyMenu();
  const phase = ppCurrentPhase();
  const i = phase.stages.findIndex(s => s.id === stageId);
  if (i > 0) { [phase.stages[i-1], phase.stages[i]] = [phase.stages[i], phase.stages[i-1]]; ppSave(); ppRender(); }
}
function ppMoveStageDown(stageId) {
  ppCloseAnyMenu();
  const phase = ppCurrentPhase();
  const i = phase.stages.findIndex(s => s.id === stageId);
  if (i >= 0 && i < phase.stages.length - 1) { [phase.stages[i], phase.stages[i+1]] = [phase.stages[i+1], phase.stages[i]]; ppSave(); ppRender(); }
}
function ppDeleteStage(stageId) {
  ppCloseAnyMenu();
  const phase = ppCurrentPhase();
  const stage = phase.stages.find(s => s.id === stageId);
  if (!stage) return;
  if (stage.items.length && !confirm(`Delete stage "${stage.name}" and its ${stage.items.length} item(s)?`)) return;
  if (!stage.items.length && !confirm(`Delete stage "${stage.name}"?`)) return;
  phase.stages = phase.stages.filter(s => s.id !== stageId);
  ppSave(); ppRender();
}

function ppAddItem(stageId) {
  const phase = ppCurrentPhase();
  const stage = phase.stages.find(s => s.id === stageId);
  if (!stage) return;
  const desc = prompt('Item description:');
  if (!desc || !desc.trim()) return;
  stage.items.push({
    id: ppUid('it'),
    description: desc.trim(),
    status: 'to_do',
    assignedTo: null,
    dueDate: null,
    link: null,
    comment: null,
    completedAt: null,
    completedBy: null
  });
  ppSave(); ppRender();
}

function ppToggleDone(itemId, checked) {
  const r = ppFindItem(itemId);
  if (!r) return;
  if (checked) {
    r.item.status = 'done';
    r.item.completedAt = ppToday();
    r.item.completedBy = ppCurrentUserName();
  } else {
    r.item.status = 'to_do';
    r.item.completedAt = null;
    r.item.completedBy = null;
  }
  ppSave(); ppRender();
}

function ppCycleStatus(itemId) {
  const r = ppFindItem(itemId);
  if (!r) return;
  const order = ['to_do', 'in_progress', 'done', 'not_required', 'blocked'];
  const i = order.indexOf(r.item.status || 'to_do');
  const next = order[(i + 1) % order.length];
  r.item.status = next;
  if (next === 'done') {
    r.item.completedAt = ppToday();
    r.item.completedBy = ppCurrentUserName();
  } else if (r.item.status !== 'done') {
    r.item.completedAt = null;
    r.item.completedBy = null;
  }
  ppSave(); ppRender();
}

function ppItemMenu(itemId, ev) {
  ppCloseAnyMenu();
  const menu = document.createElement('div');
  menu.className = 'pp-popmenu';
  menu.innerHTML = `
    <div class="pp-popitem" onclick="ppOpenItem('${itemId}')">Edit details</div>
    <div class="pp-popitem" onclick="ppMoveItemUp('${itemId}')">Move up</div>
    <div class="pp-popitem" onclick="ppMoveItemDown('${itemId}')">Move down</div>
    <div class="pp-popitem pp-popitem-danger" onclick="ppDeleteItem('${itemId}')">Delete item</div>`;
  document.body.appendChild(menu);
  ppPositionMenu(menu, ev);
}

function ppMoveItemUp(itemId) {
  ppCloseAnyMenu();
  const r = ppFindItem(itemId);
  if (!r) return;
  const i = r.stage.items.findIndex(x => x.id === itemId);
  if (i > 0) { [r.stage.items[i-1], r.stage.items[i]] = [r.stage.items[i], r.stage.items[i-1]]; ppSave(); ppRender(); }
}
function ppMoveItemDown(itemId) {
  ppCloseAnyMenu();
  const r = ppFindItem(itemId);
  if (!r) return;
  const i = r.stage.items.findIndex(x => x.id === itemId);
  if (i >= 0 && i < r.stage.items.length - 1) { [r.stage.items[i], r.stage.items[i+1]] = [r.stage.items[i+1], r.stage.items[i]]; ppSave(); ppRender(); }
}
function ppDeleteItem(itemId) {
  ppCloseAnyMenu();
  const r = ppFindItem(itemId);
  if (!r) return;
  if (!confirm('Delete this item?')) return;
  r.stage.items = r.stage.items.filter(x => x.id !== itemId);
  ppSave(); ppRender();
}

function ppPositionMenu(menu, ev) {
  const x = ev.clientX, y = ev.clientY;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  setTimeout(() => {
    document.addEventListener('click', ppCloseAnyMenu, { once: true });
  }, 0);
}
function ppCloseAnyMenu() {
  document.querySelectorAll('.pp-popmenu').forEach(el => el.remove());
}

// ─── Item edit modal ───────────────────────────────────────
function ppOpenItem(itemId) {
  const r = ppFindItem(itemId);
  if (!r) return;
  const it = r.item;

  const userOpts = '<option value="">— Unassigned —</option>' +
    PP_USERS.map(u => '<option value="' + ppEsc(u.email || u.id) + '"' +
      ((it.assignedTo === u.email || it.assignedTo === u.id) ? ' selected' : '') + '>' +
      ppEsc(u.name || u.email) + '</option>').join('');

  const statusOpts = Object.keys(STATUS_LABELS).map(k =>
    '<option value="' + k + '"' + (it.status === k ? ' selected' : '') + '>' + STATUS_LABELS[k].label + '</option>'
  ).join('');

  document.getElementById('pp-modal-content').innerHTML = `
    <div class="pp-modal-hdr">
      <div style="font-size:11px; color:var(--muted);">${ppEsc(r.phase.name)} · ${ppEsc(r.stage.name)}</div>
      <div style="font-size:16px; font-weight:600; margin-top:4px;">Edit item</div>
    </div>
    <div class="pp-modal-body">
      <label class="pp-lbl">Description</label>
      <textarea id="pp-it-desc" class="pp-input" rows="2">${ppEsc(it.description)}</textarea>

      <div class="pp-row">
        <div style="flex:1;">
          <label class="pp-lbl">Status</label>
          <select id="pp-it-status" class="pp-input">${statusOpts}</select>
        </div>
        <div style="flex:1;">
          <label class="pp-lbl">Assigned to</label>
          <select id="pp-it-assignee" class="pp-input">${userOpts}</select>
        </div>
      </div>

      <div class="pp-row">
        <div style="flex:1;">
          <label class="pp-lbl">Due date</label>
          <input type="date" id="pp-it-due" class="pp-input" value="${ppEsc(it.dueDate || '')}" />
        </div>
        <div style="flex:1;">
          <label class="pp-lbl">Link (URL)</label>
          <input type="url" id="pp-it-link" class="pp-input" placeholder="https://..." value="${ppEsc(it.link || '')}" />
        </div>
      </div>

      <label class="pp-lbl">Comment / notes</label>
      <textarea id="pp-it-comment" class="pp-input" rows="3" placeholder="Optional notes, decisions, references...">${ppEsc(it.comment || '')}</textarea>

      ${it.completedAt ? `<div class="pp-meta-box">Completed ${ppFmtDate(it.completedAt)}${it.completedBy ? ' by ' + ppEsc(it.completedBy) : ''}</div>` : ''}
    </div>
    <div class="pp-modal-ftr">
      <button class="btn" onclick="ppCloseModal()">Cancel</button>
      <button class="btn primary" onclick="ppSaveItem('${itemId}')">Save</button>
    </div>`;
  document.getElementById('pp-modal').style.display = 'flex';
}

function ppSaveItem(itemId) {
  const r = ppFindItem(itemId);
  if (!r) return;
  const it = r.item;
  const newStatus = document.getElementById('pp-it-status').value;
  const wasDone = it.status === 'done';
  const isDone = newStatus === 'done';
  it.description = document.getElementById('pp-it-desc').value.trim();
  it.status = newStatus;
  it.assignedTo = document.getElementById('pp-it-assignee').value || null;
  it.dueDate = document.getElementById('pp-it-due').value || null;
  it.link = document.getElementById('pp-it-link').value.trim() || null;
  it.comment = document.getElementById('pp-it-comment').value.trim() || null;
  if (!wasDone && isDone) {
    it.completedAt = ppToday();
    it.completedBy = ppCurrentUserName();
  } else if (wasDone && !isDone) {
    it.completedAt = null;
    it.completedBy = null;
  }
  ppCloseModal();
  ppSave();
  ppRender();
}

function ppCloseModal() {
  document.getElementById('pp-modal').style.display = 'none';
}

// ─── Save ──────────────────────────────────────────────────
async function ppSave() {
  await dbSetProjectPlans(PP_PROJECT_NUM, PP_PLANS);
}

// ─── Excel export ──────────────────────────────────────────
function ppExportExcel() {
  const plan = ppCurrentPlan();
  if (!plan) return;
  if (typeof XLSX === 'undefined') { alert('XLSX library not loaded.'); return; }

  const wb = XLSX.utils.book_new();

  for (const phase of plan.phases) {
    const rows = [['Stage', 'Description', 'Status', 'Person responsible', 'Due date', 'Link', 'Comment']];
    for (const stage of phase.stages) {
      for (const item of stage.items) {
        rows.push([
          stage.name,
          item.description || '',
          STATUS_LABELS[item.status]?.label || 'To do',
          ppLookupUserName(item.assignedTo),
          item.dueDate || '',
          item.link || '',
          item.comment || ''
        ]);
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 22 }, { wch: 60 }, { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 30 }, { wch: 40 }];
    // sanitise sheet name (Excel: max 31 chars, no special chars)
    const sname = phase.name.replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sname);
  }

  const fname = (plan.name || 'project-plan').replace(/[^a-z0-9_-]+/gi, '_') + '_' + ppToday() + '.xlsx';
  XLSX.writeFile(wb, fname);
}

// ─── Excel import ──────────────────────────────────────────
function ppImportExcel() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.xlsm';
  input.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const planName = prompt('Plan name for imported file:', f.name.replace(/\.[^.]+$/, ''));
        if (!planName || !planName.trim()) return;
        const plan = ppPlanFromWorkbook(wb, planName.trim());
        PP_PLANS.push(plan);
        PP_CURRENT_PLAN_ID = plan.id;
        PP_CURRENT_PHASE_ID = plan.phases[0]?.id || null;
        ppSave();
        ppRender();
        alert(`Imported ${ppPlanStats(plan).total} items into "${plan.name}".`);
      } catch(err) {
        console.error(err);
        alert('Import failed: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(f);
  };
  input.click();
}

function ppPlanFromWorkbook(wb, planName) {
  const plan = {
    id: ppUid('pp'),
    name: planName,
    templateId: null,
    createdAt: ppToday(),
    archived: false,
    phases: []
  };

  // Status text → internal value
  const statusMap = {
    'done': 'done',
    'completed': 'done',
    'complete': 'done',
    'not required': 'not_required',
    'n/a': 'not_required',
    'na': 'not_required',
    'in progress': 'in_progress',
    'wip': 'in_progress',
    'blocked': 'blocked',
    'on hold': 'blocked',
    '': 'to_do',
    'to do': 'to_do',
    'todo': 'to_do',
    'pending': 'to_do'
  };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Find the header row (row containing "Stage" and "Description" or "Item")
    let hdrIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const lc = rows[i].map(c => String(c).toLowerCase().trim());
      if (lc.includes('stage') && (lc.includes('description') || lc.includes('item'))) {
        hdrIdx = i;
        break;
      }
    }
    if (hdrIdx < 0) continue;

    const hdr = rows[hdrIdx].map(c => String(c).toLowerCase().trim());
    const colStage  = hdr.indexOf('stage');
    const colDesc   = hdr.indexOf('description') >= 0 ? hdr.indexOf('description') : hdr.indexOf('item');
    const colStatus = hdr.indexOf('status');
    const colPerson = hdr.findIndex(c => c.includes('person') || c.includes('responsible') || c === 'assignee');
    const colLink   = hdr.findIndex(c => c.includes('link') || c.includes('url'));

    const phase = {
      id: ppUid('ph'),
      name: sheetName,
      stages: []
    };
    const stageMap = {};   // name → stage object

    for (let i = hdrIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const stName = colStage >= 0 ? String(r[colStage] || '').trim() : '';
      const desc = colDesc >= 0 ? String(r[colDesc] || '').trim() : '';
      if (!desc) continue;             // skip rows with no description
      const stKey = stName || '— Unstaged —';
      if (!stageMap[stKey]) {
        const s = { id: ppUid('st'), name: stKey, items: [] };
        stageMap[stKey] = s;
        phase.stages.push(s);
      }
      const stage = stageMap[stKey];

      const rawStatus = colStatus >= 0 ? String(r[colStatus] || '').toLowerCase().trim() : '';
      const status = statusMap[rawStatus] !== undefined ? statusMap[rawStatus] : 'to_do';
      const linkVal = colLink >= 0 ? String(r[colLink] || '').trim() : '';

      stage.items.push({
        id: ppUid('it'),
        description: desc,
        status: status,
        assignedTo: null,        // person column is a role string in Excel — leave unassigned, PM picks real user
        defaultRole: colPerson >= 0 ? String(r[colPerson] || '').trim() : '',
        dueDate: null,
        link: /^https?:\/\//i.test(linkVal) ? linkVal : null,
        comment: null,
        completedAt: status === 'done' ? ppToday() : null,
        completedBy: null
      });
    }

    if (phase.stages.length) plan.phases.push(phase);
  }

  if (!plan.phases.length) throw new Error('No recognisable Stage/Description rows found in this workbook.');
  return plan;
}

// ─── Plan menu (top-right ▾) ───────────────────────────────
function ppPlanMenu(ev) {
  ev.stopPropagation();
  ppCloseAnyMenu();
  const plan = ppCurrentPlan();
  const archived = plan && plan.archived;

  const menu = document.createElement('div');
  menu.className = 'pp-popmenu';
  menu.innerHTML = `
    <div class="pp-popitem" onclick="ppNewPlan()">+ New plan</div>
    <div class="pp-popitem" onclick="ppDuplicatePlan()" ${plan ? '' : 'style="opacity:.4;pointer-events:none"'}>Duplicate this plan</div>
    <div class="pp-popitem" onclick="ppRenamePlan()" ${plan ? '' : 'style="opacity:.4;pointer-events:none"'}>Rename plan</div>
    <div class="pp-popitem" onclick="ppToggleArchived()" id="pp-show-archived-btn">${PP_SHOW_ARCHIVED ? '✓ Showing archived' : 'Show archived'}</div>
    ${archived
      ? '<div class="pp-popitem" onclick="ppRestorePlan()">Restore from archive</div>'
      : '<div class="pp-popitem pp-popitem-danger" onclick="ppArchivePlan()" ' + (plan ? '' : 'style="opacity:.4;pointer-events:none"') + '>Archive plan</div>'
    }`;
  document.body.appendChild(menu);
  ppPositionMenu(menu, ev);
}

// ─── Boot ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Sidebar collapse listener (consistent with rest of app)
  ppInit();
});
