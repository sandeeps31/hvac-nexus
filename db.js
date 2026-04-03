// ═══════════════════════════════════════════════════
// HVAC NEXUS — Supabase Data Layer (db.js)
// Replaces all localStorage read/write operations
// Drop this file into the repo root and reference it
// from every module via <script src="db.js"></script>
// ═══════════════════════════════════════════════════

const SUPABASE_URL = 'https://qbsjrccrgkbevncvxbio.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFic2pyY2NyZ2tiZXZuY3Z4YmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMjU5MjIsImV4cCI6MjA5MDYwMTkyMn0.Y8CYH3QXjEVsYIyXEiUM_imjNpDokRE1h9iNmRh_JoA';

// ── Core fetch wrapper ──
async function sbFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation',
    ...options.headers
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error ${res.status}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Generic get/set for single-row tables (company-level) ──
// These tables have one row storing the entire dataset as JSONB

async function dbGet(table) {
  try {
    const rows = await sbFetch(`${table}?select=data&limit=1`);
    return (rows && rows.length) ? rows[0].data : null;
  } catch(e) {
    console.warn(`dbGet(${table}) failed:`, e.message);
    return null;
  }
}

async function dbSet(table, data) {
  try {
    // Upsert — if row exists update it, otherwise insert
    const rows = await sbFetch(`${table}?select=id&limit=1`);
    if (rows && rows.length) {
      await sbFetch(`${table}?id=eq.${rows[0].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ data, updated_at: new Date().toISOString() })
      });
    } else {
      await sbFetch(table, {
        method: 'POST',
        body: JSON.stringify({ data })
      });
    }
    return true;
  } catch(e) {
    console.warn(`dbSet(${table}) failed:`, e.message);
    return false;
  }
}

// ── Generic get/set for project-scoped tables ──
// These tables have one row per project_num

async function dbGetProject(table, projectNum) {
  try {
    const rows = await sbFetch(`${table}?select=data&project_num=eq.${encodeURIComponent(projectNum)}&limit=1`);
    return (rows && rows.length) ? rows[0].data : null;
  } catch(e) {
    console.warn(`dbGetProject(${table}, ${projectNum}) failed:`, e.message);
    return null;
  }
}

async function dbSetProject(table, projectNum, data) {
  try {
    const rows = await sbFetch(`${table}?select=id&project_num=eq.${encodeURIComponent(projectNum)}&limit=1`);
    if (rows && rows.length) {
      await sbFetch(`${table}?id=eq.${rows[0].id}`, {
        method: 'PATCH',
        body: JSON.stringify({ data, updated_at: new Date().toISOString() })
      });
    } else {
      await sbFetch(table, {
        method: 'POST',
        body: JSON.stringify({ project_num: projectNum, data })
      });
    }
    return true;
  } catch(e) {
    console.warn(`dbSetProject(${table}, ${projectNum}) failed:`, e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════
// MODULE-SPECIFIC HELPERS
// Each function maps 1:1 to a former localStorage key
// ═══════════════════════════════════════════════════

// ── Projects ──
async function dbGetProjects() {
  return await dbGet('projects') || [];
}
async function dbSetProjects(data) {
  return await dbSet('projects', data);
}

// ── Current project (still localStorage — it's a session value) ──
function dbGetCurrentProject() {
  try { return JSON.parse(localStorage.getItem('hvacnexus_current_project') || '{}'); } catch(e) { return {}; }
}
function dbSetCurrentProject(data) {
  localStorage.setItem('hvacnexus_current_project', JSON.stringify(data));
}

// ── Current user (still localStorage — session value) ──
function dbGetCurrentUser() {
  try { return JSON.parse(localStorage.getItem('hvacnexus_current_user') || 'null'); } catch(e) { return null; }
}
function dbSetCurrentUser(data) {
  localStorage.setItem('hvacnexus_current_user', JSON.stringify(data));
}

// ── Users ──
async function dbGetUsers() {
  return await dbGet('users') || [];
}
async function dbSetUsers(data) {
  return await dbSet('users', data);
}

// ── Company Settings ──
async function dbGetCompanySettings() {
  return await dbGet('company_settings') || {};
}
async function dbSetCompanySettings(data) {
  return await dbSet('company_settings', data);
}

// ── ITP Templates (company library) ──
async function dbGetItpTemplates() {
  return await dbGet('itp_templates') || [];
}
async function dbSetItpTemplates(data) {
  return await dbSet('itp_templates', data);
}

// ── ITP Project Templates ──
async function dbGetItpProjectTemplates(projectNum) {
  return await dbGetProject('itp_project_templates', projectNum) || [];
}
async function dbSetItpProjectTemplates(projectNum, data) {
  return await dbSetProject('itp_project_templates', projectNum, data);
}

// ── ITP Structure ──
async function dbGetItpStructure(projectNum) {
  return await dbGetProject('itp_structure', projectNum) || { buildings: [] };
}
async function dbSetItpStructure(projectNum, data) {
  return await dbSetProject('itp_structure', projectNum, data);
}

// ── ITP Responses ──
async function dbGetItpResponses(projectNum) {
  return await dbGetProject('itp_responses', projectNum) || {};
}
async function dbSetItpResponses(projectNum, data) {
  return await dbSetProject('itp_responses', projectNum, data);
}

// ── Drawings ──
async function dbGetDrawings(projectNum) {
  return await dbGetProject('drawings', projectNum) || [];
}
async function dbSetDrawings(projectNum, data) {
  return await dbSetProject('drawings', projectNum, data);
}

// ── Budget ──
async function dbGetBudget(projectNum) {
  return await dbGetProject('budget', projectNum) || {};
}
async function dbSetBudget(projectNum, data) {
  return await dbSetProject('budget', projectNum, data);
}

// ── Progress Claims ──
async function dbGetProgressClaims(projectNum) {
  return await dbGetProject('progress_claims', projectNum) || {};
}
async function dbSetProgressClaims(projectNum, data) {
  return await dbSetProject('progress_claims', projectNum, data);
}

// ── Variations ──
async function dbGetVariations(projectNum) {
  return await dbGetProject('variations', projectNum) || [];
}
async function dbSetVariations(projectNum, data) {
  return await dbSetProject('variations', projectNum, data);
}

// ── Sub Variations ──
async function dbGetSubVariations(projectNum) {
  return await dbGetProject('sub_variations', projectNum) || {};
}
async function dbSetSubVariations(projectNum, data) {
  return await dbSetProject('sub_variations', projectNum, data);
}

// ── Equipment ──
async function dbGetEquipment(projectNum) {
  return await dbGetProject('equipment', projectNum) || {};
}
async function dbSetEquipment(projectNum, data) {
  return await dbSetProject('equipment', projectNum, data);
}

// ── Equipment Revisions ──
async function dbGetEquipmentRevisions(projectNum) {
  return await dbGetProject('equipment_revisions', projectNum) || {};
}
async function dbSetEquipmentRevisions(projectNum, data) {
  return await dbSetProject('equipment_revisions', projectNum, data);
}

// ── Procurement ──
async function dbGetProcurement(projectNum) {
  return await dbGetProject('procurement', projectNum) || {};
}
async function dbSetProcurement(projectNum, data) {
  return await dbSetProject('procurement', projectNum, data);
}

// ── Purchase Orders ──
async function dbGetPurchaseOrders(projectNum) {
  return await dbGetProject('purchase_orders', projectNum) || [];
}
async function dbSetPurchaseOrders(projectNum, data) {
  return await dbSetProject('purchase_orders', projectNum, data);
}

// ── Commissioning ──
async function dbGetCommissioning(projectNum) {
  return await dbGetProject('commissioning', projectNum) || [];
}
async function dbSetCommissioning(projectNum, data) {
  return await dbSetProject('commissioning', projectNum, data);
}

// ── Tech Submissions ──
async function dbGetTechSubmissions(projectNum) {
  return await dbGetProject('tech_submissions', projectNum) || [];
}
async function dbSetTechSubmissions(projectNum, data) {
  return await dbSetProject('tech_submissions', projectNum, data);
}

// ── Pre-Cx Template ──
async function dbGetPrecxTemplate() {
  return await dbGet('precx_template') || {};
}
async function dbSetPrecxTemplate(data) {
  return await dbSet('precx_template', data);
}

// ═══════════════════════════════════════════════════
// MIGRATION HELPER
// Run once to copy all localStorage data to Supabase
// Call: await migrateLocalStorageToSupabase()
// ═══════════════════════════════════════════════════

async function migrateLocalStorageToSupabase() {
  const proj = dbGetCurrentProject();
  const pNum = proj.num || proj.number || 'GCT001';
  const results = [];

  async function migrate(label, fn) {
    try {
      await fn();
      results.push({ label, status: 'ok' });
      console.log(`✅ ${label}`);
    } catch(e) {
      results.push({ label, status: 'error', error: e.message });
      console.error(`❌ ${label}:`, e.message);
    }
  }

  console.log('Starting migration to Supabase...');

  // Company-level
  const lsProjects = JSON.parse(localStorage.getItem('hvacnexus_projects') || '[]');
  if (lsProjects.length) await migrate('projects', () => dbSetProjects(lsProjects));

  const lsUsers = JSON.parse(localStorage.getItem('hvacnexus_users') || '[]');
  if (lsUsers.length) await migrate('users', () => dbSetUsers(lsUsers));

  const lsCS = JSON.parse(localStorage.getItem('hvacnexus_company_settings') || '{}');
  if (Object.keys(lsCS).length) await migrate('company_settings', () => dbSetCompanySettings(lsCS));

  const lsItpT = JSON.parse(localStorage.getItem('hvacnexus_itp_templates') || '[]');
  if (lsItpT.length) await migrate('itp_templates', () => dbSetItpTemplates(lsItpT));

  const lsPrecx = JSON.parse(localStorage.getItem('hvacnexus_precx_template') || '{}');
  if (Object.keys(lsPrecx).length) await migrate('precx_template', () => dbSetPrecxTemplate(lsPrecx));

  // Project-level
  const lsItpPT = JSON.parse(localStorage.getItem(`hvacnexus_itp_templates_${pNum}`) || '[]');
  if (lsItpPT.length) await migrate('itp_project_templates', () => dbSetItpProjectTemplates(pNum, lsItpPT));

  const lsItpS = JSON.parse(localStorage.getItem(`hvacnexus_itp_structure_${pNum}`) || '{"buildings":[]}');
  await migrate('itp_structure', () => dbSetItpStructure(pNum, lsItpS));

  const lsItpR = JSON.parse(localStorage.getItem(`hvacnexus_itp_responses_${pNum}`) || '{}');
  await migrate('itp_responses', () => dbSetItpResponses(pNum, lsItpR));

  const lsDrw = JSON.parse(localStorage.getItem(`hvacnexus_drawings_${pNum}`) || '[]');
  if (lsDrw.length) await migrate('drawings', () => dbSetDrawings(pNum, lsDrw));

  const lsBudget = JSON.parse(localStorage.getItem(`hvacnexus_budget_${pNum}`) || '{}');
  if (Object.keys(lsBudget).length) await migrate('budget', () => dbSetBudget(pNum, lsBudget));

  const lsClaims = JSON.parse(localStorage.getItem(`hvacnexus_progress_claims_${pNum}`) || '{}');
  if (Object.keys(lsClaims).length) await migrate('progress_claims', () => dbSetProgressClaims(pNum, lsClaims));

  const lsVars = JSON.parse(localStorage.getItem(`hvacnexus_variations_${pNum}`) || '[]');
  if (lsVars.length) await migrate('variations', () => dbSetVariations(pNum, lsVars));

  const lsSubVars = JSON.parse(localStorage.getItem(`hvacnexus_subvars_${pNum}`) || '{}');
  if (Object.keys(lsSubVars).length) await migrate('sub_variations', () => dbSetSubVariations(pNum, lsSubVars));

  const lsEquip = JSON.parse(localStorage.getItem(`hvacnexus_equip_${pNum}`) || '{}');
  if (Object.keys(lsEquip).length) await migrate('equipment', () => dbSetEquipment(pNum, lsEquip));

  const lsEquipRev = JSON.parse(localStorage.getItem(`hvacnexus_equip_revisions_${pNum}`) || '{}');
  if (Object.keys(lsEquipRev).length) await migrate('equipment_revisions', () => dbSetEquipmentRevisions(pNum, lsEquipRev));

  console.log('Migration complete:', results.filter(r => r.status === 'ok').length, 'succeeded,', results.filter(r => r.status === 'error').length, 'failed');
  console.table(results);
  return results;
}
