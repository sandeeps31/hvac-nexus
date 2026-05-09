// ── HVAC Nexus — Project Plan (shared by live plans + template editor) ──
//
// MODE flag:
//   PP_MODE = 'project'  → live project plans (default — used by project-plan.html)
//   PP_MODE = 'template' → company template editor (used by project-plan-templates.html)

let PP_MODE = (typeof window !== 'undefined' && window.PP_MODE) || 'project';

// Live-mode state
let PP_PLANS = [];
let PP_CURRENT_PLAN_ID = null;
let PP_PROJECT_NUM = null;

// Template-mode state
let PP_TEMPLATES = [];
let PP_CURRENT_TEMPLATE_ID = null;

// Common state
let PP_CURRENT_PHASE_ID = null;
let PP_USERS = [];
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

const PP_ROLES = ['PM', 'SM', 'Project coordinator', 'Estimator', 'Safety',
                  'Sub contractors', 'Commissioner', 'Technician', 'Builder', 'Other'];

// ─── Utilities ─────────────────────────────────────────────
function ppIsTpl() { return PP_MODE === 'template'; }
function ppUid(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function ppEsc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function ppToday() { return new Date().toISOString().slice(0, 10); }

function ppCurrentDoc() {
  if (ppIsTpl()) return PP_TEMPLATES.find(t => t.id === PP_CURRENT_TEMPLATE_ID) || null;
  return PP_PLANS.find(p => p.id === PP_CURRENT_PLAN_ID) || null;
}
function ppCurrentPhase() {
  const doc = ppCurrentDoc();
  if (!doc) return null;
  return doc.phases.find(ph => ph.id === PP_CURRENT_PHASE_ID) || doc.phases[0] || null;
}
function ppFindItem(itemId) {
  const doc = ppCurrentDoc();
  if (!doc) return null;
  for (const ph of doc.phases) {
    for (const st of ph.stages) {
      const it = st.items.find(i => i.id === itemId);
      if (it) return { item: it, stage: st, phase: ph };
    }
  }
  return null;
}
function ppFindSubItem(itemId, subId) {
  const r = ppFindItem(itemId);
  if (!r || !r.item.subs) return null;
  const sub = r.item.subs.find(s => s.id === subId);
  return sub ? Object.assign({}, r, { sub }) : null;
}
function ppCurrentUserName() {
  try {
    const u = dbGetCurrentUser();
    if (u && u.name) return u.name;
    if (u && u.email) return u.email;
  } catch(e) {}
  try {
    const sess = JSON.parse(localStorage.getItem('hvacnexus_session') || '{}');
    return sess.user && (sess.user.user_metadata && sess.user.user_metadata.name || sess.user.email) || 'Unknown';
  } catch(e) {}
  return 'Unknown';
}
function ppIsOverdue(item) {
  if (ppIsTpl()) return false;
  if (!item.dueDate) return false;
  if (item.status === 'done' || item.status === 'not_required') return false;
  return item.dueDate < ppToday();
}

// ─── Init ──────────────────────────────────────────────────
async function ppInit() {
  if (ppIsTpl()) {
    const tpls = await dbGetProjectPlanTemplates();
    PP_TEMPLATES = Array.isArray(tpls) ? tpls : [];
    ppRenderTemplateRegister();
    return;
  }

  const proj = dbGetCurrentProject();
  if (!proj || !proj.num) {
    document.getElementById('pp-content').innerHTML = '<div class="pp-empty">No project selected. <a href="index.html">Choose a project</a> first.</div>';
    return;
  }
  PP_PROJECT_NUM = proj.num;

  const tagEl = document.getElementById('pp-proj-tag');
  if (tagEl) tagEl.textContent = 'Project · ' + proj.num + ' ' + (proj.name || '');

  const [plans, users, tpls] = await Promise.all([
    dbGetProjectPlans(PP_PROJECT_NUM),
    dbGetUsers(),
    dbGetProjectPlanTemplates()
  ]);
  PP_PLANS = Array.isArray(plans) ? plans : [];
  PP_USERS = Array.isArray(users) ? users : [];
  PP_TEMPLATES = Array.isArray(tpls) ? tpls : [];

  const visible = PP_PLANS.filter(p => !p.archived);
  if (visible.length) {
    PP_CURRENT_PLAN_ID = visible[0].id;
    const plan = ppCurrentDoc();
    PP_CURRENT_PHASE_ID = plan && plan.phases.length ? plan.phases[0].id : null;
  }

  ppRender();
}

// ─── Template register (template mode only) ────────────────
function ppRenderTemplateRegister() {
  PP_CURRENT_TEMPLATE_ID = null;
  ['pp-stats','pp-phase-tabs','pp-filters'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const hdrLeft = document.getElementById('pp-header-left');
  if (hdrLeft) hdrLeft.innerHTML = `
    <div class="pp-proj-tag">Company settings · Templates</div>
    <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;margin-top:2px">Project Plan Templates</div>`;
  const hdrRight = document.getElementById('pp-header-right');
  if (hdrRight) hdrRight.innerHTML = `
    <button class="btn" onclick="ppImportExcel()">Import .xlsx</button>
    <button class="btn primary" onclick="ppNewTemplate()">+ New template</button>`;

  const filtered = PP_TEMPLATES.filter(t =>
    !PP_SEARCH || (t.name || '').toLowerCase().includes(PP_SEARCH.toLowerCase()));

  let html = `
    <div class="pp-tpl-toolbar">
      <input id="pp-tpl-search" type="text" placeholder="Search templates..." value="${ppEsc(PP_SEARCH)}" oninput="PP_SEARCH=this.value;ppRenderTemplateRegister()" />
      <span class="pp-tpl-count">${PP_TEMPLATES.length} template${PP_TEMPLATES.length===1?'':'s'}</span>
    </div>`;

  if (!PP_TEMPLATES.length) {
    html += `
      <div class="pp-empty">
        <div class="pp-empty-icon">📋</div>
        <div class="pp-empty-title">No templates yet</div>
        <div class="pp-empty-sub">Create your first template, or import one from Excel.</div>
        <button class="btn primary" onclick="ppNewTemplate()">+ New template</button>
        <button class="btn" onclick="ppImportExcel()">Import .xlsx</button>
      </div>`;
  } else if (!filtered.length) {
    html += `<div class="pp-empty"><div class="pp-empty-sub">No templates match "${ppEsc(PP_SEARCH)}".</div></div>`;
  } else {
    html += '<div class="pp-tpl-grid">';
    for (const t of filtered) {
      const stats = ppPlanStats(t);
      html += `
        <div class="pp-tpl-card">
          <div class="pp-tpl-card-hdr">
            <div class="pp-tpl-name">${ppEsc(t.name)}</div>
            <div class="pp-tpl-menu" onclick="event.stopPropagation();ppTemplateCardMenu('${t.id}',event)">⋯</div>
          </div>
          <div class="pp-tpl-stats">
            <span><b>${t.phases.length}</b> phases</span>
            <span><b>${t.phases.reduce((a,p)=>a+p.stages.length,0)}</b> stages</span>
            <span><b>${stats.total}</b> items</span>
          </div>
          ${t.updatedAt ? `<div class="pp-tpl-meta">Updated ${ppFmtDate(t.updatedAt)}</div>` : ''}
          <div class="pp-tpl-actions">
            <button class="btn" onclick="ppOpenTemplate('${t.id}')">Open</button>
            <button class="btn" onclick="ppDuplicateTemplate('${t.id}')">Duplicate</button>
          </div>
        </div>`;
    }
    html += '</div>';
  }
  document.getElementById('pp-content').innerHTML = html;
}

function ppNewTemplate() {
  const name = prompt('Template name (e.g. "Standard Commercial HVAC", "D&C Project"):');
  if (!name || !name.trim()) return;
  const tpl = ppBlankTemplate(name.trim());
  PP_TEMPLATES.push(tpl);
  ppSave();
  ppOpenTemplate(tpl.id);
}

function ppBlankTemplate(name) {
  return {
    id: ppUid('tpl'),
    name: name,
    createdAt: ppToday(),
    updatedAt: ppToday(),
    phases: PP_DEFAULT_PHASES.map(p => ({
      id: ppUid('ph'),
      name: p.name,
      stages: p.stages.map(s => ({ id: ppUid('st'), name: s, items: [] }))
    }))
  };
}

function ppOpenTemplate(tplId) {
  PP_CURRENT_TEMPLATE_ID = tplId;
  const tpl = ppCurrentDoc();
  if (!tpl) { ppRenderTemplateRegister(); return; }
  PP_CURRENT_PHASE_ID = tpl.phases.length ? tpl.phases[0].id : null;
  ['pp-phase-tabs','pp-filters'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
  const hdrLeft = document.getElementById('pp-header-left');
  if (hdrLeft) hdrLeft.innerHTML = `
    <div class="pp-proj-tag" style="cursor:pointer" onclick="ppRenderTemplateRegister()">← Templates</div>
    <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;margin-top:2px" id="pp-tpl-name-disp">${ppEsc(tpl.name)}</div>`;
  const hdrRight = document.getElementById('pp-header-right');
  if (hdrRight) hdrRight.innerHTML = `
    <button class="btn" onclick="ppRenameCurrentTemplate()">Rename</button>
    <button class="btn" onclick="ppExportExcel()">Export .xlsx</button>
    <button class="btn danger" onclick="ppDeleteCurrentTemplate()">Delete</button>`;
  ppRender();
}

function ppRenameCurrentTemplate() {
  const tpl = ppCurrentDoc();
  if (!tpl) return;
  const n = prompt('Rename template:', tpl.name);
  if (!n || !n.trim()) return;
  tpl.name = n.trim();
  tpl.updatedAt = ppToday();
  ppSave();
  const disp = document.getElementById('pp-tpl-name-disp');
  if (disp) disp.textContent = tpl.name;
}

function ppDeleteCurrentTemplate() {
  const tpl = ppCurrentDoc();
  if (!tpl) return;
  if (!confirm(`Delete template "${tpl.name}"? This cannot be undone.\n\nProjects already using this template are unaffected — they have their own copy.`)) return;
  PP_TEMPLATES = PP_TEMPLATES.filter(t => t.id !== tpl.id);
  ppSave();
  ppRenderTemplateRegister();
}

function ppDuplicateTemplate(tplId) {
  const src = PP_TEMPLATES.find(t => t.id === tplId);
  if (!src) return;
  const name = prompt('Name for the duplicated template:', src.name + ' (copy)');
  if (!name || !name.trim()) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = ppUid('tpl');
  copy.name = name.trim();
  copy.createdAt = ppToday();
  copy.updatedAt = ppToday();
  copy.phases.forEach(ph => {
    ph.id = ppUid('ph');
    ph.stages.forEach(st => {
      st.id = ppUid('st');
      st.items.forEach(it => {
        it.id = ppUid('it');
        if (it.subs) it.subs.forEach(s => s.id = ppUid('sub'));
      });
    });
  });
  PP_TEMPLATES.push(copy);
  ppSave();
  ppRenderTemplateRegister();
}

function ppTemplateCardMenu(tplId, ev) {
  ppCloseAnyMenu();
  const menu = document.createElement('div');
  menu.className = 'pp-popmenu';
  menu.innerHTML = `
    <div class="pp-popitem" onclick="ppOpenTemplate('${tplId}')">Open</div>
    <div class="pp-popitem" onclick="ppDuplicateTemplate('${tplId}')">Duplicate</div>
    <div class="pp-popitem" onclick="ppRenameTemplate('${tplId}')">Rename</div>
    <div class="pp-popitem pp-popitem-danger" onclick="ppDeleteTemplate('${tplId}')">Delete</div>`;
  document.body.appendChild(menu);
  ppPositionMenu(menu, ev);
}
function ppRenameTemplate(tplId) {
  ppCloseAnyMenu();
  const t = PP_TEMPLATES.find(x => x.id === tplId);
  if (!t) return;
  const n = prompt('Rename template:', t.name);
  if (!n || !n.trim()) return;
  t.name = n.trim();
  t.updatedAt = ppToday();
  ppSave();
  ppRenderTemplateRegister();
}
function ppDeleteTemplate(tplId) {
  ppCloseAnyMenu();
  const t = PP_TEMPLATES.find(x => x.id === tplId);
  if (!t) return;
  if (!confirm(`Delete template "${t.name}"?`)) return;
  PP_TEMPLATES = PP_TEMPLATES.filter(x => x.id !== tplId);
  ppSave();
  ppRenderTemplateRegister();
}

// ─── Render ────────────────────────────────────────────────
function ppRender() {
  const doc = ppCurrentDoc();

  if (!ppIsTpl()) {
    const visiblePlans = PP_PLANS.filter(p => PP_SHOW_ARCHIVED || !p.archived);
    let planOpts = visiblePlans.map(p =>
      '<option value="' + ppEsc(p.id) + '"' + (p.id === PP_CURRENT_PLAN_ID ? ' selected' : '') + '>' +
      ppEsc(p.name) + (p.archived ? ' (archived)' : '') + '</option>'
    ).join('');
    if (!visiblePlans.length) planOpts = '<option>— no plans yet —</option>';
    const switcher = document.getElementById('pp-plan-switcher');
    if (switcher) switcher.innerHTML = planOpts;
  }

  if (!doc) {
    if (ppIsTpl()) return;
    document.getElementById('pp-content').innerHTML = `
      <div class="pp-empty">
        <div class="pp-empty-icon">📅</div>
        <div class="pp-empty-title">No plans yet for this project</div>
        <div class="pp-empty-sub">Create from scratch, apply a company template, or import Excel.</div>
        <button class="btn primary" onclick="ppNewPlan()">+ New plan</button>
        ${PP_TEMPLATES.length ? '<button class="btn" onclick="ppApplyTemplatePicker(event)">Apply template</button>' : ''}
        <button class="btn" onclick="ppImportExcel()">Import .xlsx</button>
      </div>`;
    return;
  }

  if (!ppIsTpl()) {
    const stats = ppPlanStats(doc);
    const setEl = (id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
    setEl('pp-stat-total', stats.total);
    setEl('pp-stat-done', stats.done);
    setEl('pp-stat-prog', stats.inProgress);
    setEl('pp-stat-overdue', stats.overdue);
  }

  const phaseTabs = doc.phases.map(ph => {
    const active = ph.id === PP_CURRENT_PHASE_ID;
    const phStats = ppPhaseStats(ph);
    return `<div class="pp-tab ${active ? 'active' : ''}" onclick="ppSelectPhase('${ph.id}')">
      <span>${ppEsc(ph.name)}</span>
      ${ppIsTpl() ? '' : `<span class="pp-tab-count">${phStats.done}/${phStats.total}</span>`}
    </div>`;
  }).join('');
  const tabsEl = document.getElementById('pp-phase-tabs');
  if (tabsEl) tabsEl.innerHTML = phaseTabs;

  if (!ppIsTpl()) {
    const assigneeOpts = ['<option value="all">All assignees</option>',
      '<option value="unassigned">— Unassigned —</option>'].concat(
      PP_USERS.map(u => '<option value="' + ppEsc(u.email || u.id) + '"' +
        (PP_FILTER_ASSIGNEE === (u.email || u.id) ? ' selected' : '') + '>' +
        ppEsc(u.name || u.email) + '</option>')
    ).join('');
    const fa = document.getElementById('pp-filter-assignee');
    if (fa) fa.innerHTML = assigneeOpts;
  }

  const phase = ppCurrentPhase();
  if (!phase) {
    document.getElementById('pp-content').innerHTML = '<div class="pp-empty">No phase selected.</div>';
    return;
  }

  let html = '';
  for (const stage of phase.stages) html += ppRenderStage(stage);
  if (!phase.stages.length) {
    html = `<div class="pp-empty"><div class="pp-empty-sub">No stages in this phase yet.</div><button class="btn primary" onclick="ppAddStage()">+ Add stage</button></div>`;
  } else {
    html += `<div style="margin-top:14px;"><button class="btn" onclick="ppAddStage()">+ Add stage</button></div>`;
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
        ${ppIsTpl()
          ? `<span class="pp-stage-count">${stats.total} item${stats.total===1?'':'s'}</span>`
          : `<span class="pp-stage-count">${stats.done} of ${stats.total} done</span>`}
        <div style="flex:1;"></div>
        ${ppIsTpl() ? '' : `<div class="pp-progbar"><div class="pp-progbar-fill" style="width:${pct}%;"></div></div>`}
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
  if (ppIsTpl()) return ppRenderTemplateItem(item);

  const isDone = item.status === 'done';
  const isNR = item.status === 'not_required';
  const overdue = ppIsOverdue(item);
  const stClass = (STATUS_LABELS[item.status] && STATUS_LABELS[item.status].cls) || 'pp-st-todo';
  const stLabel = (STATUS_LABELS[item.status] && STATUS_LABELS[item.status].label) || 'To do';

  const userName = ppLookupUserName(item.assignedTo);
  const meta = [];
  if (isDone && item.completedAt) meta.push('Completed ' + ppFmtDate(item.completedAt) + (item.completedBy ? ' · ' + ppEsc(item.completedBy) : ''));
  else if (overdue) meta.push('<span style="color:var(--danger)">Overdue · was due ' + ppFmtDate(item.dueDate) + '</span>');
  else if (item.dueDate) meta.push('Due ' + ppFmtDate(item.dueDate));
  if (item.comment) meta.push('💬');
  if (item.subs && item.subs.length) meta.push(item.subs.length + ' sub-item' + (item.subs.length===1?'':'s'));

  let html = `
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

  if (item.subs && item.subs.length) {
    for (const sub of item.subs) html += ppRenderSubItem(sub, item.id);
  }
  return html;
}

function ppRenderTemplateItem(item) {
  const role = item.defaultRole ? ppEsc(item.defaultRole) : '<span style="color:var(--muted)">—</span>';
  const meta = [];
  if (item.subs && item.subs.length) meta.push(item.subs.length + ' sub-item' + (item.subs.length===1?'':'s'));

  let html = `
    <div class="pp-item pp-item-tpl" data-item="${item.id}">
      <div class="pp-item-main" onclick="ppOpenItem('${item.id}')">
        <div class="pp-item-desc">${ppEsc(item.description)}</div>
        ${meta.length ? '<div class="pp-item-meta">' + meta.join(' · ') + '</div>' : ''}
      </div>
      <span class="pp-tpl-role">${role}</span>
      <span class="pp-link">${item.link ? '<a href="' + ppEsc(item.link) + '" target="_blank" onclick="event.stopPropagation()">🔗</a>' : ''}</span>
      <span class="pp-item-menu" onclick="event.stopPropagation(); ppItemMenu('${item.id}', event)">⋯</span>
    </div>`;

  if (item.subs && item.subs.length) {
    for (const sub of item.subs) html += ppRenderSubItem(sub, item.id);
  }
  return html;
}

function ppRenderSubItem(sub, parentId) {
  if (ppIsTpl()) {
    return `
      <div class="pp-subitem pp-subitem-tpl">
        <span class="pp-sub-bullet">↳</span>
        <div class="pp-sub-desc" onclick="ppOpenSubItem('${parentId}','${sub.id}')">${ppEsc(sub.description)}</div>
        <span class="pp-sub-menu" onclick="event.stopPropagation();ppSubItemMenu('${parentId}','${sub.id}',event)">⋯</span>
      </div>`;
  }
  const isDone = sub.status === 'done';
  return `
    <div class="pp-subitem">
      <input type="checkbox" class="pp-check pp-subcheck" ${isDone ? 'checked' : ''} onchange="ppToggleSubDone('${parentId}','${sub.id}',this.checked)" />
      <span class="pp-sub-bullet">↳</span>
      <div class="pp-sub-desc ${isDone?'pp-item-strike':''}" onclick="ppOpenSubItem('${parentId}','${sub.id}')">${ppEsc(sub.description)}</div>
      <span class="pp-sub-menu" onclick="event.stopPropagation();ppSubItemMenu('${parentId}','${sub.id}',event)">⋯</span>
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
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch(e) { return iso; }
}

// ─── Stats ─────────────────────────────────────────────────
function ppPlanStats(doc) {
  let total = 0, done = 0, inProgress = 0, overdue = 0;
  for (const ph of doc.phases) {
    for (const st of ph.stages) {
      for (const it of st.items) {
        total++;
        if (it.status === 'done') done++;
        else if (it.status === 'in_progress') inProgress++;
        if (ppIsOverdue(it)) overdue++;
        if (it.subs) for (const s of it.subs) {
          total++;
          if (s.status === 'done') done++;
        }
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
      if (it.subs) for (const s of it.subs) {
        total++;
        if (s.status === 'done') done++;
      }
    }
  }
  return { total, done };
}
function ppStageStats(stage) {
  let total = 0, done = 0;
  for (const it of stage.items) {
    total++;
    if (it.status === 'done') done++;
    if (it.subs) for (const s of it.subs) {
      total++;
      if (s.status === 'done') done++;
    }
  }
  return { total, done };
}

// ─── Filters ───────────────────────────────────────────────
function ppItemMatchesFilters(item) {
  if (PP_SEARCH) {
    const matchSelf = (item.description || '').toLowerCase().includes(PP_SEARCH);
    const matchSub = item.subs && item.subs.some(s => (s.description||'').toLowerCase().includes(PP_SEARCH));
    if (!matchSelf && !matchSub) return false;
  }
  if (ppIsTpl()) return true;
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
function ppOnSearch(v) { PP_SEARCH = (v || '').toLowerCase().trim(); ppRender(); }
function ppOnFilterStatus(v) { PP_FILTER_STATUS = v; ppRender(); }
function ppOnFilterAssignee(v) { PP_FILTER_ASSIGNEE = v; ppRender(); }

// ─── Plan management ───────────────────────────────────────
function ppOnPlanChange(v) {
  PP_CURRENT_PLAN_ID = v;
  const plan = ppCurrentDoc();
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

// ─── Apply template ────────────────────────────────────────
function ppApplyTemplatePicker(ev) {
  if (ev) ev.stopPropagation();
  ppCloseAnyMenu();
  if (!PP_TEMPLATES.length) {
    alert('No company templates exist yet.\n\nCreate one in: Company settings → Templates → Project Plan.');
    return;
  }
  const menu = document.createElement('div');
  menu.className = 'pp-popmenu';
  menu.style.maxHeight = '320px';
  menu.style.overflowY = 'auto';
  menu.style.minWidth = '260px';
  let html = '<div class="pp-popitem" style="font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);cursor:default;pointer-events:none">Apply template</div>';
  for (const t of PP_TEMPLATES) {
    const stats = ppPlanStats(t);
    html += `<div class="pp-popitem" onclick="ppApplyTemplate('${t.id}')">
      <div>${ppEsc(t.name)}</div>
      <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--muted);margin-top:2px">${stats.total} items · ${t.phases.reduce((a,p)=>a+p.stages.length,0)} stages</div>
    </div>`;
  }
  menu.innerHTML = html;
  document.body.appendChild(menu);
  if (ev && ev.clientX) {
    ppPositionMenu(menu, ev);
  } else {
    menu.style.left = '50%';
    menu.style.top = '120px';
    menu.style.transform = 'translateX(-50%)';
    setTimeout(() => document.addEventListener('click', ppCloseAnyMenu, { once: true }), 0);
  }
}

function ppApplyTemplate(tplId) {
  ppCloseAnyMenu();
  const tpl = PP_TEMPLATES.find(t => t.id === tplId);
  if (!tpl) return;

  const plan = JSON.parse(JSON.stringify(tpl));
  plan.id = ppUid('pp');
  plan.name = tpl.name;
  plan.templateId = tpl.id;
  plan.createdAt = ppToday();
  plan.archived = false;
  delete plan.updatedAt;

  plan.phases.forEach(ph => {
    ph.id = ppUid('ph');
    ph.stages.forEach(st => {
      st.id = ppUid('st');
      st.items.forEach(it => {
        it.id = ppUid('it');
        it.status = 'to_do';
        it.assignedTo = null;
        it.dueDate = null;
        it.completedAt = null;
        it.completedBy = null;
        it.comment = null;
        if (it.subs) it.subs.forEach(s => {
          s.id = ppUid('sub');
          s.status = 'to_do';
          s.assignedTo = null;
          s.completedAt = null;
        });
      });
    });
  });

  PP_PLANS.push(plan);
  PP_CURRENT_PLAN_ID = plan.id;
  PP_CURRENT_PHASE_ID = plan.phases[0] ? plan.phases[0].id : null;
  ppSave();
  ppRender();
}

function ppDuplicatePlan() {
  const plan = ppCurrentDoc();
  if (!plan) return;
  const newName = prompt('Name for the duplicated plan:', plan.name + ' (copy)');
  if (!newName || !newName.trim()) return;
  const copy = JSON.parse(JSON.stringify(plan));
  copy.id = ppUid('pp');
  copy.name = newName.trim();
  copy.createdAt = ppToday();
  copy.archived = false;
  copy.phases.forEach(ph => {
    ph.id = ppUid('ph');
    ph.stages.forEach(st => {
      st.id = ppUid('st');
      st.items.forEach(it => {
        it.id = ppUid('it');
        if (it.subs) it.subs.forEach(s => s.id = ppUid('sub'));
      });
    });
  });
  PP_PLANS.push(copy);
  PP_CURRENT_PLAN_ID = copy.id;
  PP_CURRENT_PHASE_ID = copy.phases[0] ? copy.phases[0].id : null;
  ppSave();
  ppRender();
}

function ppRenamePlan() {
  const plan = ppCurrentDoc();
  if (!plan) return;
  const n = prompt('Rename plan:', plan.name);
  if (!n || !n.trim()) return;
  plan.name = n.trim();
  ppSave();
  ppRender();
}

function ppArchivePlan() {
  const plan = ppCurrentDoc();
  if (!plan) return;
  if (!confirm(`Archive plan "${plan.name}"? You can restore it via the "Show archived" toggle.`)) return;
  plan.archived = true;
  const next = PP_PLANS.find(p => !p.archived);
  PP_CURRENT_PLAN_ID = next ? next.id : null;
  PP_CURRENT_PHASE_ID = next && next.phases.length ? next.phases[0].id : null;
  ppSave();
  ppRender();
}
function ppRestorePlan() {
  const plan = ppCurrentDoc();
  if (!plan || !plan.archived) return;
  plan.archived = false;
  ppSave();
  ppRender();
}
function ppToggleArchived() {
  PP_SHOW_ARCHIVED = !PP_SHOW_ARCHIVED;
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
  ppSave(); ppRender();
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
  const msg = stage.items.length
    ? `Delete stage "${stage.name}" and its ${stage.items.length} item(s)?`
    : `Delete stage "${stage.name}"?`;
  if (!confirm(msg)) return;
  phase.stages = phase.stages.filter(s => s.id !== stageId);
  ppSave(); ppRender();
}

function ppAddItem(stageId) {
  const phase = ppCurrentPhase();
  const stage = phase.stages.find(s => s.id === stageId);
  if (!stage) return;
  const desc = prompt('Item description:');
  if (!desc || !desc.trim()) return;
  const item = {
    id: ppUid('it'),
    description: desc.trim(),
    link: null,
    subs: []
  };
  if (ppIsTpl()) {
    item.defaultRole = '';
  } else {
    item.status = 'to_do';
    item.assignedTo = null;
    item.dueDate = null;
    item.comment = null;
    item.completedAt = null;
    item.completedBy = null;
  }
  stage.items.push(item);
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
  } else {
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
    <div class="pp-popitem" onclick="ppAddSubItem('${itemId}')">+ Add sub-item</div>
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
  const subWarn = r.item.subs && r.item.subs.length ? ` and its ${r.item.subs.length} sub-item(s)` : '';
  if (!confirm(`Delete this item${subWarn}?`)) return;
  r.stage.items = r.stage.items.filter(x => x.id !== itemId);
  ppSave(); ppRender();
}

// ─── Sub-items ─────────────────────────────────────────────
function ppAddSubItem(parentId) {
  ppCloseAnyMenu();
  const r = ppFindItem(parentId);
  if (!r) return;
  const desc = prompt('Sub-item description:');
  if (!desc || !desc.trim()) return;
  if (!r.item.subs) r.item.subs = [];
  const sub = { id: ppUid('sub'), description: desc.trim() };
  if (!ppIsTpl()) {
    sub.status = 'to_do';
    sub.assignedTo = null;
    sub.completedAt = null;
  }
  r.item.subs.push(sub);
  ppSave(); ppRender();
}

function ppToggleSubDone(parentId, subId, checked) {
  const r = ppFindSubItem(parentId, subId);
  if (!r) return;
  if (checked) {
    r.sub.status = 'done';
    r.sub.completedAt = ppToday();
  } else {
    r.sub.status = 'to_do';
    r.sub.completedAt = null;
  }
  ppSave(); ppRender();
}

function ppOpenSubItem(parentId, subId) {
  const r = ppFindSubItem(parentId, subId);
  if (!r) return;
  const sub = r.sub;
  const userOpts = ppIsTpl() ? '' : '<option value="">— Unassigned —</option>' +
    PP_USERS.map(u => '<option value="' + ppEsc(u.email || u.id) + '"' +
      ((sub.assignedTo === u.email || sub.assignedTo === u.id) ? ' selected' : '') + '>' +
      ppEsc(u.name || u.email) + '</option>').join('');

  document.getElementById('pp-modal-content').innerHTML = `
    <div class="pp-modal-hdr">
      <div style="font-size:11px;color:var(--muted)">Sub-item</div>
      <div style="font-size:16px;font-weight:600;margin-top:4px">Edit sub-item</div>
    </div>
    <div class="pp-modal-body">
      <label class="pp-lbl">Description</label>
      <textarea id="pp-sub-desc" class="pp-input" rows="2">${ppEsc(sub.description)}</textarea>
      ${ppIsTpl() ? '' : `
      <label class="pp-lbl">Assigned to</label>
      <select id="pp-sub-assignee" class="pp-input">${userOpts}</select>`}
    </div>
    <div class="pp-modal-ftr">
      <button class="btn" onclick="ppCloseModal()">Cancel</button>
      <button class="btn primary" onclick="ppSaveSubItem('${parentId}','${subId}')">Save</button>
    </div>`;
  document.getElementById('pp-modal').style.display = 'flex';
}

function ppSaveSubItem(parentId, subId) {
  const r = ppFindSubItem(parentId, subId);
  if (!r) return;
  r.sub.description = document.getElementById('pp-sub-desc').value.trim();
  if (!ppIsTpl()) {
    const a = document.getElementById('pp-sub-assignee');
    if (a) r.sub.assignedTo = a.value || null;
  }
  ppCloseModal();
  ppSave(); ppRender();
}

function ppSubItemMenu(parentId, subId, ev) {
  ppCloseAnyMenu();
  const menu = document.createElement('div');
  menu.className = 'pp-popmenu';
  menu.innerHTML = `
    <div class="pp-popitem" onclick="ppOpenSubItem('${parentId}','${subId}')">Edit</div>
    <div class="pp-popitem pp-popitem-danger" onclick="ppDeleteSubItem('${parentId}','${subId}')">Delete</div>`;
  document.body.appendChild(menu);
  ppPositionMenu(menu, ev);
}

function ppDeleteSubItem(parentId, subId) {
  ppCloseAnyMenu();
  const r = ppFindItem(parentId);
  if (!r) return;
  if (!confirm('Delete this sub-item?')) return;
  r.item.subs = (r.item.subs || []).filter(s => s.id !== subId);
  ppSave(); ppRender();
}

// ─── Pop menu utils ────────────────────────────────────────
function ppPositionMenu(menu, ev) {
  const x = ev.clientX, y = ev.clientY;
  const w = 220, mh = 320;
  menu.style.left = Math.min(x, window.innerWidth - w - 10) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - mh) + 'px';
  setTimeout(() => document.addEventListener('click', ppCloseAnyMenu, { once: true }), 0);
}
function ppCloseAnyMenu() {
  document.querySelectorAll('.pp-popmenu').forEach(el => el.remove());
}

// ─── Item edit modal ───────────────────────────────────────
function ppOpenItem(itemId) {
  const r = ppFindItem(itemId);
  if (!r) return;
  const it = r.item;

  const userOpts = ppIsTpl() ? '' : ('<option value="">— Unassigned —</option>' +
    PP_USERS.map(u => '<option value="' + ppEsc(u.email || u.id) + '"' +
      ((it.assignedTo === u.email || it.assignedTo === u.id) ? ' selected' : '') + '>' +
      ppEsc(u.name || u.email) + '</option>').join(''));

  const statusOpts = Object.keys(STATUS_LABELS).map(k =>
    '<option value="' + k + '"' + (it.status === k ? ' selected' : '') + '>' + STATUS_LABELS[k].label + '</option>'
  ).join('');

  const roleOpts = '<option value="">— No default role —</option>' + PP_ROLES.map(rr =>
    '<option value="' + ppEsc(rr) + '"' + (it.defaultRole === rr ? ' selected' : '') + '>' + ppEsc(rr) + '</option>'
  ).join('');

  let subsHtml = '';
  if (it.subs && it.subs.length) {
    subsHtml = '<label class="pp-lbl">Sub-items</label><div class="pp-modal-subs">';
    for (const s of it.subs) {
      subsHtml += `<div class="pp-modal-sub">↳ ${ppEsc(s.description)}<span class="pp-modal-sub-x" onclick="ppDeleteSubFromModal('${itemId}','${s.id}')">×</span></div>`;
    }
    subsHtml += '</div>';
  }

  document.getElementById('pp-modal-content').innerHTML = `
    <div class="pp-modal-hdr">
      <div style="font-size:11px;color:var(--muted)">${ppEsc(r.phase.name)} · ${ppEsc(r.stage.name)}</div>
      <div style="font-size:16px;font-weight:600;margin-top:4px">Edit ${ppIsTpl()?'template item':'item'}</div>
    </div>
    <div class="pp-modal-body">
      <label class="pp-lbl">Description</label>
      <textarea id="pp-it-desc" class="pp-input" rows="2">${ppEsc(it.description)}</textarea>

      ${ppIsTpl() ? `
        <label class="pp-lbl">Default role</label>
        <select id="pp-it-role" class="pp-input">${roleOpts}</select>
        <label class="pp-lbl">Link (URL)</label>
        <input type="url" id="pp-it-link" class="pp-input" placeholder="https://..." value="${ppEsc(it.link || '')}" />
      ` : `
        <div class="pp-row">
          <div><label class="pp-lbl">Status</label><select id="pp-it-status" class="pp-input">${statusOpts}</select></div>
          <div><label class="pp-lbl">Assigned to</label><select id="pp-it-assignee" class="pp-input">${userOpts}</select></div>
        </div>
        <div class="pp-row">
          <div><label class="pp-lbl">Due date</label><input type="date" id="pp-it-due" class="pp-input" value="${ppEsc(it.dueDate || '')}" /></div>
          <div><label class="pp-lbl">Link (URL)</label><input type="url" id="pp-it-link2" class="pp-input" placeholder="https://..." value="${ppEsc(it.link || '')}" /></div>
        </div>
        <label class="pp-lbl">Comment / notes</label>
        <textarea id="pp-it-comment" class="pp-input" rows="3" placeholder="Optional notes...">${ppEsc(it.comment || '')}</textarea>
      `}

      ${subsHtml}
      <div style="margin-top:10px">
        <button class="btn" onclick="ppAddSubFromModal('${itemId}')">+ Add sub-item</button>
      </div>

      ${(!ppIsTpl() && it.completedAt) ? `<div class="pp-meta-box">Completed ${ppFmtDate(it.completedAt)}${it.completedBy ? ' by ' + ppEsc(it.completedBy) : ''}</div>` : ''}
    </div>
    <div class="pp-modal-ftr">
      <button class="btn" onclick="ppCloseModal()">Cancel</button>
      <button class="btn primary" onclick="ppSaveItem('${itemId}')">Save</button>
    </div>`;
  document.getElementById('pp-modal').style.display = 'flex';
}

function ppAddSubFromModal(itemId) {
  const desc = prompt('Sub-item description:');
  if (!desc || !desc.trim()) return;
  const r = ppFindItem(itemId);
  if (!r) return;
  if (!r.item.subs) r.item.subs = [];
  const sub = { id: ppUid('sub'), description: desc.trim() };
  if (!ppIsTpl()) { sub.status = 'to_do'; sub.assignedTo = null; sub.completedAt = null; }
  r.item.subs.push(sub);
  ppOpenItem(itemId);
}

function ppDeleteSubFromModal(itemId, subId) {
  if (!confirm('Delete this sub-item?')) return;
  const r = ppFindItem(itemId);
  if (!r) return;
  r.item.subs = (r.item.subs || []).filter(s => s.id !== subId);
  ppOpenItem(itemId);
}

function ppSaveItem(itemId) {
  const r = ppFindItem(itemId);
  if (!r) return;
  const it = r.item;
  it.description = document.getElementById('pp-it-desc').value.trim();

  if (ppIsTpl()) {
    it.defaultRole = document.getElementById('pp-it-role').value || '';
    it.link = document.getElementById('pp-it-link').value.trim() || null;
  } else {
    const newStatus = document.getElementById('pp-it-status').value;
    const wasDone = it.status === 'done';
    const isDone = newStatus === 'done';
    it.status = newStatus;
    it.assignedTo = document.getElementById('pp-it-assignee').value || null;
    it.dueDate = document.getElementById('pp-it-due').value || null;
    it.link = document.getElementById('pp-it-link2').value.trim() || null;
    it.comment = document.getElementById('pp-it-comment').value.trim() || null;
    if (!wasDone && isDone) {
      it.completedAt = ppToday();
      it.completedBy = ppCurrentUserName();
    } else if (wasDone && !isDone) {
      it.completedAt = null;
      it.completedBy = null;
    }
  }
  ppCloseModal();
  ppSave(); ppRender();
}

function ppCloseModal() {
  document.getElementById('pp-modal').style.display = 'none';
}

// ─── Save ──────────────────────────────────────────────────
async function ppSave() {
  if (ppIsTpl()) {
    const t = ppCurrentDoc();
    if (t) t.updatedAt = ppToday();
    await dbSetProjectPlanTemplates(PP_TEMPLATES);
  } else {
    await dbSetProjectPlans(PP_PROJECT_NUM, PP_PLANS);
  }
}

// ─── Excel export ──────────────────────────────────────────
function ppExportExcel() {
  const doc = ppCurrentDoc();
  if (!doc) return;
  if (typeof XLSX === 'undefined') { alert('XLSX library not loaded.'); return; }

  const wb = XLSX.utils.book_new();

  for (const phase of doc.phases) {
    const headers = ppIsTpl()
      ? ['Stage', 'Description', 'Default role', 'Link', 'Sub-items']
      : ['Stage', 'Description', 'Status', 'Person responsible', 'Due date', 'Link', 'Comment', 'Sub-items'];
    const rows = [headers];
    for (const stage of phase.stages) {
      for (const item of stage.items) {
        const subList = (item.subs || []).map(s => '↳ ' + s.description).join('\n');
        if (ppIsTpl()) {
          rows.push([stage.name, item.description || '', item.defaultRole || '', item.link || '', subList]);
        } else {
          rows.push([
            stage.name, item.description || '',
            (STATUS_LABELS[item.status] && STATUS_LABELS[item.status].label) || 'To do',
            ppLookupUserName(item.assignedTo),
            item.dueDate || '', item.link || '', item.comment || '', subList
          ]);
        }
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = ppIsTpl()
      ? [{wch:22},{wch:60},{wch:18},{wch:30},{wch:40}]
      : [{wch:22},{wch:60},{wch:14},{wch:22},{wch:12},{wch:30},{wch:40},{wch:40}];
    const sname = phase.name.replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sname);
  }

  const fname = (doc.name || (ppIsTpl()?'template':'project-plan')).replace(/[^a-z0-9_-]+/gi, '_') + '_' + ppToday() + '.xlsx';
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
        const defaultName = f.name.replace(/\.[^.]+$/, '');
        const name = prompt(ppIsTpl() ? 'Template name:' : 'Plan name:', defaultName);
        if (!name || !name.trim()) return;
        const doc = ppDocFromWorkbook(wb, name.trim());
        if (ppIsTpl()) {
          PP_TEMPLATES.push(doc);
          ppSave();
          ppOpenTemplate(doc.id);
        } else {
          PP_PLANS.push(doc);
          PP_CURRENT_PLAN_ID = doc.id;
          PP_CURRENT_PHASE_ID = doc.phases[0] ? doc.phases[0].id : null;
          ppSave();
          ppRender();
        }
        alert(`Imported ${ppPlanStats(doc).total} items into "${doc.name}".`);
      } catch(err) {
        console.error(err);
        alert('Import failed: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(f);
  };
  input.click();
}

function ppDocFromWorkbook(wb, name) {
  const doc = ppIsTpl()
    ? { id: ppUid('tpl'), name: name, createdAt: ppToday(), updatedAt: ppToday(), phases: [] }
    : { id: ppUid('pp'), name: name, templateId: null, createdAt: ppToday(), archived: false, phases: [] };

  const statusMap = {
    'done':'done','completed':'done','complete':'done',
    'not required':'not_required','n/a':'not_required','na':'not_required',
    'in progress':'in_progress','wip':'in_progress',
    'blocked':'blocked','on hold':'blocked',
    '':'to_do','to do':'to_do','todo':'to_do','pending':'to_do'
  };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    let hdrIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const lc = rows[i].map(c => String(c).toLowerCase().trim());
      if (lc.includes('stage') && (lc.includes('description') || lc.includes('item'))) { hdrIdx = i; break; }
    }
    if (hdrIdx < 0) continue;

    const hdr = rows[hdrIdx].map(c => String(c).toLowerCase().trim());
    const colStage  = hdr.indexOf('stage');
    const colDesc   = hdr.indexOf('description') >= 0 ? hdr.indexOf('description') : hdr.indexOf('item');
    const colStatus = hdr.indexOf('status');
    const colPerson = hdr.findIndex(c => c.includes('person') || c.includes('responsible') || c.includes('default role') || c === 'role' || c === 'assignee');
    const colLink   = hdr.findIndex(c => c.includes('link') || c.includes('url'));

    const phase = { id: ppUid('ph'), name: sheetName, stages: [] };
    const stageMap = {};

    for (let i = hdrIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const stName = colStage >= 0 ? String(r[colStage] || '').trim() : '';
      const desc = colDesc >= 0 ? String(r[colDesc] || '').trim() : '';
      if (!desc) continue;
      const stKey = stName || '— Unstaged —';
      if (!stageMap[stKey]) {
        const s = { id: ppUid('st'), name: stKey, items: [] };
        stageMap[stKey] = s;
        phase.stages.push(s);
      }
      const stage = stageMap[stKey];

      const linkVal = colLink >= 0 ? String(r[colLink] || '').trim() : '';
      const personVal = colPerson >= 0 ? String(r[colPerson] || '').trim() : '';
      const item = {
        id: ppUid('it'),
        description: desc,
        link: /^https?:\/\//i.test(linkVal) ? linkVal : null,
        subs: []
      };
      if (ppIsTpl()) {
        item.defaultRole = personVal;
      } else {
        const rawStatus = colStatus >= 0 ? String(r[colStatus] || '').toLowerCase().trim() : '';
        item.status = statusMap[rawStatus] !== undefined ? statusMap[rawStatus] : 'to_do';
        item.assignedTo = null;
        item.defaultRole = personVal;
        item.dueDate = null;
        item.comment = null;
        item.completedAt = item.status === 'done' ? ppToday() : null;
        item.completedBy = null;
      }
      stage.items.push(item);
    }
    if (phase.stages.length) doc.phases.push(phase);
  }

  if (!doc.phases.length) throw new Error('No recognisable Stage/Description rows found in this workbook.');
  return doc;
}

// ─── Plan menu (project mode top-right ▾) ──────────────────
function ppPlanMenu(ev) {
  ev.stopPropagation();
  ppCloseAnyMenu();
  const plan = ppCurrentDoc();
  const archived = plan && plan.archived;

  const menu = document.createElement('div');
  menu.className = 'pp-popmenu';
  let html = '<div class="pp-popitem" onclick="ppNewPlan()">+ New plan</div>';
  if (PP_TEMPLATES.length) html += '<div class="pp-popitem" onclick="ppApplyTemplatePicker(event)">Apply template ▸</div>';
  html += `
    <div class="pp-popitem" ${plan ? '' : 'style="opacity:.4;pointer-events:none"'} onclick="ppDuplicatePlan()">Duplicate this plan</div>
    <div class="pp-popitem" ${plan ? '' : 'style="opacity:.4;pointer-events:none"'} onclick="ppRenamePlan()">Rename plan</div>
    <div class="pp-popitem" onclick="ppToggleArchived()">${PP_SHOW_ARCHIVED ? '✓ Showing archived' : 'Show archived'}</div>`;
  if (archived) {
    html += '<div class="pp-popitem" onclick="ppRestorePlan()">Restore from archive</div>';
  } else {
    html += `<div class="pp-popitem pp-popitem-danger" ${plan ? '' : 'style="opacity:.4;pointer-events:none"'} onclick="ppArchivePlan()">Archive plan</div>`;
  }
  menu.innerHTML = html;
  document.body.appendChild(menu);
  ppPositionMenu(menu, ev);
}

// ─── Boot ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => { ppInit(); });
