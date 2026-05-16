// ═══════════════════════════════════════════════════
// HVAC NEXUS — Supabase Data Layer (db.js)
// Replaces all localStorage read/write operations
// Drop this file into the repo root and reference it
// from every module via <script src="db.js"></script>
// ═══════════════════════════════════════════════════

const SUPABASE_URL = 'https://qbsjrccrgkbevncvxbio.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFic2pyY2NyZ2tiZXZuY3Z4YmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMjU5MjIsImV4cCI6MjA5MDYwMTkyMn0.Y8CYH3QXjEVsYIyXEiUM_imjNpDokRE1h9iNmRh_JoA';

// ── Auth state ──
let _authSession = null;
let _authCompanyId = null;
let _authUser = null;

// ── Auth functions ──
async function authSignUp(email, password, companyName) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Signup failed');
  _authSession = data.session;
  _authUser = data.user;
  // Create company + link user as admin
  if (_authSession && companyName) {
    await authCreateCompany(companyName);
  }
  return data;
}

async function authSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Login failed');
  _authSession = data;
  _authUser = data.user;
  localStorage.setItem('hvacnexus_session', JSON.stringify(data));
  await authLoadCompany();
  return data;
}

async function authSignOut() {
  if (_authSession) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${_authSession.access_token}` }
    });
  }
  _authSession = null;
  _authUser = null;
  _authCompanyId = null;
  localStorage.removeItem('hvacnexus_session');
  window.location.href = 'login.html';
}

async function authRefreshSession() {
  const stored = localStorage.getItem('hvacnexus_session');
  if (!stored) return false;
  try {
    const sess = JSON.parse(stored);
    // Check if token is still valid (expires_at is in seconds)
    const expiresAt = sess.expires_at || 0;
    if (Date.now() / 1000 < expiresAt - 60) {
      _authSession = sess;
      _authUser = sess.user;
      await authLoadCompany();
      return true;
    }
    // Try to refresh
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: sess.refresh_token })
    });
    if (!res.ok) { localStorage.removeItem('hvacnexus_session'); return false; }
    const data = await res.json();
    _authSession = data;
    _authUser = data.user;
    localStorage.setItem('hvacnexus_session', JSON.stringify(data));
    await authLoadCompany();
    return true;
  } catch(e) { return false; }
}

async function authCreateCompany(name) {
  // Insert company
  const comp = await sbFetch('companies', {
    method: 'POST',
    body: JSON.stringify({ name }),
    prefer: 'return=representation'
  });
  const companyId = comp[0].id;
  _authCompanyId = companyId;
  // Link user as admin
  await sbFetch('company_members', {
    method: 'POST',
    body: JSON.stringify({ company_id: companyId, user_id: _authUser.id, role: 'admin' }),
    prefer: 'return=representation'
  });
  localStorage.setItem('hvacnexus_company_id', companyId);
  return companyId;
}

async function authLoadCompany() {
  if (!_authUser) return;
  try {
    const members = await sbFetch(`company_members?user_id=eq.${_authUser.id}&select=company_id,role&limit=1`);
    if (members && members.length) {
      _authCompanyId = members[0].company_id;
      localStorage.setItem('hvacnexus_company_id', _authCompanyId);
    }
  } catch(e) { console.warn('authLoadCompany failed:', e); }
}

function authGetCompanyId() { return _authCompanyId || localStorage.getItem('hvacnexus_company_id'); }
function authGetUser() { return _authUser; }
function authIsLoggedIn() { return !!_authSession; }

// ── Session ready promise — await dbReady before loading data ──
let _dbReadyResolve;
const dbReady = new Promise(function(resolve){ _dbReadyResolve = resolve; });

(async function(){
  const stored = localStorage.getItem('hvacnexus_session');
  if(!stored){ _dbReadyResolve(false); return; }
  try{
    const sess = JSON.parse(stored);
    const expiresAt = sess.expires_at || 0;
    if(Date.now()/1000 < expiresAt - 60){
      _authSession = sess;
      _authUser = sess.user;
      _authCompanyId = localStorage.getItem('hvacnexus_company_id');
      _dbReadyResolve(true);
      return;
    }
    // Refresh token
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{
      method:'POST',
      headers:{'apikey':SUPABASE_ANON_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:sess.refresh_token})
    });
    if(res.ok){
      const data = await res.json();
      _authSession = data;
      _authUser = data.user;
      _authCompanyId = localStorage.getItem('hvacnexus_company_id');
      localStorage.setItem('hvacnexus_session', JSON.stringify(data));
      _dbReadyResolve(true);
    } else {
      _dbReadyResolve(false);
    }
  }catch(e){
    console.warn('Session auto-load failed:', e);
    _dbReadyResolve(false);
  }
})();

// Auth guard — call on every protected page
async function authGuard() {
  const ok = await authRefreshSession();
  if (!ok) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// ── Core fetch wrapper ──
// Auto-refreshes expired JWTs on 401 and retries once. This catches the race
// condition where a page-level auth guard hasn't finished refreshing when
// the first data calls fire — and any other case where the token went stale.
async function sbFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  let res = await _sbFetchOnce(url, options);
  if (res.status === 401 && options._retried !== true) {
    // Try to refresh the JWT once, then retry the original request
    const refreshed = await sbTryRefreshSession();
    if (refreshed) {
      res = await _sbFetchOnce(url, { ...options, _retried: true });
    }
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error ${res.status}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function _sbFetchOnce(url, options) {
  const token = sbGetAuthToken();
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation',
    ...options.headers
  };
  // Strip our internal _retried flag from the fetch options
  const { _retried, prefer, headers: _h, ...rest } = options;
  return await fetch(url, { ...rest, headers });
}

// ── JWT refresh ──
// Attempts to refresh the session using the stored refresh_token.
// Returns true if refresh succeeded (new session is now in localStorage and _authSession).
// Returns false if there's no refresh token, OR forces a logout + redirect to login if refresh fails.
// Multiple concurrent calls share the same in-flight promise.
let _sbRefreshInFlight = null;
let _sbForcedLogout = false;
async function sbTryRefreshSession() {
  if (_sbRefreshInFlight) return _sbRefreshInFlight;
  _sbRefreshInFlight = (async () => {
    try {
      const stored = localStorage.getItem('hvacnexus_session');
      if (!stored) {
        // No session at all — force logout
        sbForceLogout('No session found');
        return false;
      }
      const sess = JSON.parse(stored);
      if (!sess.refresh_token) {
        sbForceLogout('Session has no refresh token');
        return false;
      }
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: sess.refresh_token })
      });
      if (!r.ok) {
        // Refresh token rejected (expired, revoked, invalid) — force logout
        sbForceLogout('Refresh token rejected (' + r.status + ')');
        return false;
      }
      const d = await r.json();
      localStorage.setItem('hvacnexus_session', JSON.stringify(d));
      _authSession = d;
      return true;
    } catch(e) {
      console.warn('sbTryRefreshSession failed:', e);
      sbForceLogout('Refresh threw: ' + e.message);
      return false;
    } finally {
      // Clear the in-flight promise after a tick so subsequent calls re-evaluate
      setTimeout(() => { _sbRefreshInFlight = null; }, 0);
    }
  })();
  return _sbRefreshInFlight;
}

// ── Force logout ──
// Clears local session and redirects to login. De-duplicated so concurrent
// failed requests don't pile up redirects.
function sbForceLogout(reason) {
  if (_sbForcedLogout) return;
  _sbForcedLogout = true;
  console.warn('Forcing logout:', reason);
  try {
    localStorage.removeItem('hvacnexus_session');
    localStorage.removeItem('hvacnexus_company_id');
  } catch(e) {}
  _authSession = null;
  // Show a brief toast before redirect so the user knows what happened
  try {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#0e1520;border:1px solid #ff4d6d;color:#ff4d6d;font-family:DM Mono,monospace;font-size:12px;padding:10px 20px;border-radius:8px;z-index:99999;white-space:nowrap;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.4)';
    t.textContent = '⚠ Session expired — redirecting to sign-in…';
    document.body.appendChild(t);
  } catch(e) {}
  // Short delay so toast is visible, then redirect
  setTimeout(() => {
    window.location.href = 'login.html';
  }, 1200);
}

// ── Auth token resolver ──
// Returns the current user's JWT if available, falling back to the anon key.
// Single source of truth — every module should use this instead of fishing
// the token out of localStorage themselves.
function sbGetAuthToken() {
  if (_authSession && _authSession.access_token) return _authSession.access_token;
  try {
    const ss = JSON.parse(localStorage.getItem('hvacnexus_session') || '{}');
    if (ss.access_token) return ss.access_token;
  } catch(e) {}
  return SUPABASE_ANON_KEY;
}

// ── Storage upload ──
// Uploads a File/Blob to a Supabase Storage bucket and returns the public URL.
// bucket: bucket name (e.g. 'documents', 'hvacnex-photos')
// path:   object path within the bucket (e.g. 'specifications/GCT001/abc.pdf')
// file:   File or Blob
// opts:   { contentType?, upsert? }
async function sbUploadFile(bucket, path, file, opts) {
  opts = opts || {};
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${sbGetAuthToken()}`,
    'Content-Type': opts.contentType || file.type || 'application/octet-stream'
  };
  if (opts.upsert) headers['x-upsert'] = 'true';
  const res = await fetch(url, { method: 'POST', headers, body: file });
  if (!res.ok) throw new Error(`Storage upload failed (${res.status}): ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

// ── Storage download (authenticated) ──
// Fetches a file from Supabase Storage as a Uint8Array, sending the user's JWT.
// Use this for private buckets where the public URL alone isn't enough.
async function sbDownloadFile(url) {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${sbGetAuthToken()}`
  };
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Storage download failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

// ── Edge Function caller ──
// Invokes a Supabase Edge Function. fnName is the function path (e.g. 'hyper-endpoint').
// Returns the parsed JSON response.
async function sbCallEdgeFunction(fnName, body) {
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${sbGetAuthToken()}`,
    'apikey': SUPABASE_ANON_KEY
  };
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error(`Edge function "${fnName}" failed (${res.status}): ${await res.text()}`);
  return await res.json();
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
      // INSERT — include company_id so RLS allows it on company-scoped tables
      const body = { data };
      let cid = null;
      try {
        if (typeof authGetCompanyId === 'function') cid = authGetCompanyId();
        if (!cid) cid = localStorage.getItem('hvacnexus_company_id');
      } catch(e) {}
      if (cid) body.company_id = cid;
      await sbFetch(table, {
        method: 'POST',
        body: JSON.stringify(body)
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
      // Get company_id from auth helper or localStorage
      let companyId = null;
      try {
        if (typeof authGetCompanyId === 'function') companyId = authGetCompanyId();
        if (!companyId) companyId = localStorage.getItem('hvacnexus_company_id');
      } catch(e) {}
      await sbFetch(table, {
        method: 'POST',
        body: JSON.stringify({ project_num: projectNum, data, company_id: companyId })
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

// ═══════════════════════════════════════════════════
// WITNESS TESTING HELPERS
// 3-tier mirror of the ITP pattern:
//   witness_templates          → company master library (multi-row)
//   project_witness_templates  → duplicated into project (multi-row)
//   witness_runsheets          → instance per equipment event (multi-row)
//
// Templates are read whole, so `data` JSONB holds everything (incl.
// equipment_type, tests[], source_template_id, source_template_version).
// Runsheets need fast filtering, so normalised columns (equipment_id,
// status, attempt_number, parent_runsheet_id, scheduled_date, signed_at)
// are hoisted from the runsheet object on save; the rest lives in `data`
// (template_snapshot, cx_completion_check, tests[], witnesses[], comments,
// photos[], defects_raised[], pdf_report_url, runsheet_number,
// overall_outcome, completed_at, completed_by).
//
// Status values (per design doc):
//   'draft'                  → created, not started
//   'in_progress'            → testing under way
//   'signed_off'             → all witnesses signed, overall pass, locked
//   'failed_pending_rework'  → all witnesses signed, ≥1 test failed, locked
//   'cancelled'              → session abandoned
// ═══════════════════════════════════════════════════

// ── Internal: hoist normalised columns out of a runsheet object ──
// Returns { col1, col2, ..., data } ready to send to Postgres.

// ── Internal: is `s` a valid UUID? ──
// Witness tables use Postgres UUID columns with DEFAULT gen_random_uuid().
// Client-generated ids (e.g. 'wt' + Date.now()) are NOT valid UUIDs and must
// never be sent as the row id — the DB rejects with 22P02. Helpers use this
// to decide whether to PATCH (real UUID = existing row) or POST (anything else
// = new row, let the DB assign the UUID). Self-healing: stale client ids are
// silently treated as inserts rather than crashing the save.
function _isUUID(s) {
  if (typeof s !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
function _witnessRunsheetToRow(runsheet) {
  var r = runsheet || {};
  // Pull normalised fields out; everything else goes in `data`.
  // Input aliases: equipment_id is canonical, but equipment_tag/equipmentTag
  // are accepted as legacy aliases (pre-rename callers) so transitional code
  // doesn't silently drop the field.
  var equipment_id       = r.equipment_id || r.equipmentId || r.equipment_tag || r.equipmentTag || null;
  var template_id        = r.template_id || r.templateId || null;
  var status             = r.status || 'draft';
  var attempt_number     = (typeof r.attempt_number === 'number') ? r.attempt_number
                         : (typeof r.attemptNumber === 'number')  ? r.attemptNumber
                         : 1;
  var parent_runsheet_id = r.parent_runsheet_id || r.parentRunsheetId || null;
  var scheduled_date     = r.scheduled_date || r.scheduledDate || null;
  var signed_at          = r.signed_at || r.signedAt || null;
  // Feature B: system test runsheets aren't tied to a Cx tracker row.
  // Default to 'equipment' so existing callers see no behavioural change.
  var runsheet_type      = r.runsheet_type || r.runsheetType || 'equipment';
  // Build a copy of the full object for `data`, but strip the columns we hoisted
  // (and id/timestamps which the DB owns) so we don't double-store them.
  var data = {};
  Object.keys(r).forEach(function(k){
    if (['id','company_id','project_num','equipment_id','equipmentId','equipment_tag','equipmentTag',
         'template_id','templateId','status','attempt_number','attemptNumber',
         'parent_runsheet_id','parentRunsheetId','scheduled_date','scheduledDate',
         'signed_at','signedAt','runsheet_type','runsheetType',
         'created_at','updated_at'].indexOf(k) === -1) {
      data[k] = r[k];
    }
  });
  return {
    equipment_id: equipment_id,
    template_id: template_id,
    status: status,
    attempt_number: attempt_number,
    parent_runsheet_id: parent_runsheet_id,
    scheduled_date: scheduled_date,
    signed_at: signed_at,
    runsheet_type: runsheet_type,
    data: data
  };
}

// ── Internal: flatten a DB row back into a runsheet object ──
// Merges normalised columns back into the object alongside `data`.
function _witnessRowToRunsheet(row) {
  if (!row) return null;
  var out = Object.assign({}, row.data || {});
  out.id                 = row.id;
  out.company_id         = row.company_id;
  out.project_num        = row.project_num;
  out.equipment_id       = row.equipment_id;
  out.template_id        = row.template_id;
  out.status             = row.status;
  out.attempt_number     = row.attempt_number;
  out.parent_runsheet_id = row.parent_runsheet_id;
  out.scheduled_date     = row.scheduled_date;
  out.signed_at          = row.signed_at;
  out.runsheet_type      = row.runsheet_type || 'equipment';  // null-safe for pre-migration rows
  out.created_at         = row.created_at;
  out.updated_at         = row.updated_at;
  return out;
}

// ── Witness Templates (company-level master library) ──
async function dbGetWitnessTemplates() {
  try {
    var rows = await sbFetch('witness_templates?select=id,data,created_at,updated_at&order=created_at.asc');
    return (rows || []).map(function(r){
      var t = Object.assign({}, r.data || {});
      t.id = r.id;
      t.created_at = r.created_at;
      t.updated_at = r.updated_at;
      return t;
    });
  } catch(e) {
    console.warn('dbGetWitnessTemplates failed:', e.message);
    return [];
  }
}

async function dbGetWitnessTemplate(id) {
  if (!id) return null;
  if (!_isUUID(id)) return null;
  try {
    var rows = await sbFetch('witness_templates?id=eq.'+encodeURIComponent(id)+'&select=id,data,created_at,updated_at&limit=1');
    if (!rows || !rows.length) return null;
    var r = rows[0];
    var t = Object.assign({}, r.data || {});
    t.id = r.id; t.created_at = r.created_at; t.updated_at = r.updated_at;
    return t;
  } catch(e) {
    console.warn('dbGetWitnessTemplate('+id+') failed:', e.message);
    return null;
  }
}

async function dbSaveWitnessTemplate(template) {
  try {
    var t = template || {};
    var id = t.id || null;
    // Build data blob without DB-owned fields
    var data = {};
    Object.keys(t).forEach(function(k){
      if (['id','company_id','created_at','updated_at'].indexOf(k) === -1) data[k] = t[k];
    });
    if (_isUUID(id)) {
      // Update existing (only when we have a real DB-assigned UUID)
      var updated = await sbFetch('witness_templates?id=eq.'+encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify({ data: data, updated_at: new Date().toISOString() })
      });
      return (updated && updated[0]) ? updated[0].id : id;
    } else {
      // Insert new — DB assigns the UUID via DEFAULT gen_random_uuid()
      var companyId = null;
      try {
        if (typeof authGetCompanyId === 'function') companyId = authGetCompanyId();
        if (!companyId) companyId = localStorage.getItem('hvacnexus_company_id');
      } catch(e) {}
      var inserted = await sbFetch('witness_templates', {
        method: 'POST',
        body: JSON.stringify({ company_id: companyId, data: data })
      });
      return (inserted && inserted[0]) ? inserted[0].id : null;
    }
  } catch(e) {
    console.warn('dbSaveWitnessTemplate failed:', e.message);
    return null;
  }
}

async function dbDeleteWitnessTemplate(id) {
  if (!id) return false;
  if (!_isUUID(id)) {
    console.warn('dbDeleteWitnessTemplate refused: id is not a valid UUID:', id);
    return false;
  }
  try {
    await sbFetch('witness_templates?id=eq.'+encodeURIComponent(id), { method: 'DELETE' });
    return true;
  } catch(e) {
    console.warn('dbDeleteWitnessTemplate('+id+') failed:', e.message);
    return false;
  }
}

// ── Project Witness Templates (duplicated from company at import) ──
async function dbGetProjectWitnessTemplates(projectNum) {
  if (!projectNum) return [];
  try {
    var rows = await sbFetch('project_witness_templates?project_num=eq.'+encodeURIComponent(projectNum)+'&select=id,data,created_at,updated_at&order=created_at.asc');
    return (rows || []).map(function(r){
      var t = Object.assign({}, r.data || {});
      t.id = r.id; t.created_at = r.created_at; t.updated_at = r.updated_at;
      return t;
    });
  } catch(e) {
    console.warn('dbGetProjectWitnessTemplates('+projectNum+') failed:', e.message);
    return [];
  }
}

async function dbGetProjectWitnessTemplate(id) {
  if (!id) return null;
  if (!_isUUID(id)) return null;
  try {
    var rows = await sbFetch('project_witness_templates?id=eq.'+encodeURIComponent(id)+'&select=id,data,project_num,created_at,updated_at&limit=1');
    if (!rows || !rows.length) return null;
    var r = rows[0];
    var t = Object.assign({}, r.data || {});
    t.id = r.id; t.project_num = r.project_num; t.created_at = r.created_at; t.updated_at = r.updated_at;
    return t;
  } catch(e) {
    console.warn('dbGetProjectWitnessTemplate('+id+') failed:', e.message);
    return null;
  }
}

async function dbSaveProjectWitnessTemplate(projectNum, template) {
  if (!projectNum) return null;
  try {
    var t = template || {};
    var id = t.id || null;
    var data = {};
    Object.keys(t).forEach(function(k){
      if (['id','company_id','project_num','created_at','updated_at'].indexOf(k) === -1) data[k] = t[k];
    });
    if (_isUUID(id)) {
      var updated = await sbFetch('project_witness_templates?id=eq.'+encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify({ data: data, updated_at: new Date().toISOString() })
      });
      return (updated && updated[0]) ? updated[0].id : id;
    } else {
      var companyId = null;
      try {
        if (typeof authGetCompanyId === 'function') companyId = authGetCompanyId();
        if (!companyId) companyId = localStorage.getItem('hvacnexus_company_id');
      } catch(e) {}
      var inserted = await sbFetch('project_witness_templates', {
        method: 'POST',
        body: JSON.stringify({ company_id: companyId, project_num: projectNum, data: data })
      });
      return (inserted && inserted[0]) ? inserted[0].id : null;
    }
  } catch(e) {
    console.warn('dbSaveProjectWitnessTemplate('+projectNum+') failed:', e.message);
    return null;
  }
}

async function dbDeleteProjectWitnessTemplate(id) {
  if (!id) return false;
  if (!_isUUID(id)) {
    console.warn('dbDeleteProjectWitnessTemplate refused: id is not a valid UUID:', id);
    return false;
  }
  try {
    await sbFetch('project_witness_templates?id=eq.'+encodeURIComponent(id), { method: 'DELETE' });
    return true;
  } catch(e) {
    console.warn('dbDeleteProjectWitnessTemplate('+id+') failed:', e.message);
    return false;
  }
}

// ── Witness Runsheets (instance per equipment witness event) ──
async function dbGetWitnessRunsheets(projectNum) {
  if (!projectNum) return [];
  try {
    var rows = await sbFetch('witness_runsheets?project_num=eq.'+encodeURIComponent(projectNum)+'&select=*&order=created_at.desc');
    return (rows || []).map(_witnessRowToRunsheet);
  } catch(e) {
    console.warn('dbGetWitnessRunsheets('+projectNum+') failed:', e.message);
    return [];
  }
}

async function dbGetWitnessRunsheet(id) {
  if (!id) return null;
  if (!_isUUID(id)) return null;
  try {
    var rows = await sbFetch('witness_runsheets?id=eq.'+encodeURIComponent(id)+'&select=*&limit=1');
    if (!rows || !rows.length) return null;
    return _witnessRowToRunsheet(rows[0]);
  } catch(e) {
    console.warn('dbGetWitnessRunsheet('+id+') failed:', e.message);
    return null;
  }
}

// Fetch all runsheets for a given equipment ID — useful for the re-witness
// chain display and for the drawings/equipment cross-links.
async function dbGetWitnessRunsheetsByEquipment(projectNum, equipmentId) {
  if (!projectNum || !equipmentId) return [];
  try {
    var rows = await sbFetch(
      'witness_runsheets?project_num=eq.'+encodeURIComponent(projectNum)+
      '&equipment_id=eq.'+encodeURIComponent(equipmentId)+
      '&select=*&order=attempt_number.asc'
    );
    return (rows || []).map(_witnessRowToRunsheet);
  } catch(e) {
    console.warn('dbGetWitnessRunsheetsByEquipment('+projectNum+','+equipmentId+') failed:', e.message);
    return [];
  }
}

async function dbCreateWitnessRunsheet(projectNum, runsheet) {
  if (!projectNum) return null;
  try {
    var companyId = null;
    try {
      if (typeof authGetCompanyId === 'function') companyId = authGetCompanyId();
      if (!companyId) companyId = localStorage.getItem('hvacnexus_company_id');
    } catch(e) {}
    var row = _witnessRunsheetToRow(runsheet);
    // UUID columns reject non-UUID values — coerce non-UUIDs to null.
    var body = {
      company_id: companyId,
      project_num: projectNum,
      equipment_id: row.equipment_id,
      template_id: _isUUID(row.template_id) ? row.template_id : null,
      status: row.status,
      attempt_number: row.attempt_number,
      parent_runsheet_id: _isUUID(row.parent_runsheet_id) ? row.parent_runsheet_id : null,
      scheduled_date: row.scheduled_date,
      signed_at: row.signed_at,
      runsheet_type: row.runsheet_type || 'equipment',
      data: row.data
    };
    var inserted = await sbFetch('witness_runsheets', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    if (!inserted || !inserted[0]) return null;
    return _witnessRowToRunsheet(inserted[0]);
  } catch(e) {
    console.warn('dbCreateWitnessRunsheet('+projectNum+') failed:', e.message);
    return null;
  }
}

// Patch a runsheet. Accepts either:
//   - a partial object with only the fields to change, OR
//   - a full runsheet object (we'll hoist normalised columns and put the rest in data)
// If `patch` contains a `data` key already, we trust the caller has built the full data blob.
async function dbSaveWitnessRunsheet(id, patch) {
  if (!id) return null;
  if (!_isUUID(id)) {
    // Caller passed a client-generated id — this would 400 against Postgres UUID column.
    // Refuse rather than crash; the caller should have used dbCreateWitnessRunsheet for new rows.
    console.warn('dbSaveWitnessRunsheet refused: id is not a valid UUID:', id);
    return null;
  }
  try {
    var body;
    if (patch && typeof patch === 'object' && 'data' in patch && Object.keys(patch).length <= 8) {
      // Caller passed a structured PATCH — pass through, just add updated_at
      body = Object.assign({}, patch, { updated_at: new Date().toISOString() });
    } else {
      // Caller passed a full runsheet object — split it
      var row = _witnessRunsheetToRow(patch);
      body = {
        equipment_id: row.equipment_id,
        template_id: row.template_id,
        status: row.status,
        attempt_number: row.attempt_number,
        parent_runsheet_id: row.parent_runsheet_id,
        scheduled_date: row.scheduled_date,
        signed_at: row.signed_at,
        runsheet_type: row.runsheet_type || 'equipment',
        data: row.data,
        updated_at: new Date().toISOString()
      };
    }
    var updated = await sbFetch('witness_runsheets?id=eq.'+encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    if (!updated || !updated[0]) return null;
    return _witnessRowToRunsheet(updated[0]);
  } catch(e) {
    console.warn('dbSaveWitnessRunsheet('+id+') failed:', e.message);
    return null;
  }
}

async function dbDeleteWitnessRunsheet(id) {
  if (!id) return false;
  if (!_isUUID(id)) {
    console.warn('dbDeleteWitnessRunsheet refused: id is not a valid UUID:', id);
    return false;
  }
  try {
    await sbFetch('witness_runsheets?id=eq.'+encodeURIComponent(id), { method: 'DELETE' });
    return true;
  } catch(e) {
    console.warn('dbDeleteWitnessRunsheet('+id+') failed:', e.message);
    return false;
  }
}

// Re-witness flow: clones a runsheet, carries forward only failed tests,
// increments attempt_number, links via parent_runsheet_id.
// Returns the newly-created runsheet object, or null on failure.
async function dbCreateRewitnessRunsheet(originalId) {
  if (!originalId) return null;
  try {
    var original = await dbGetWitnessRunsheet(originalId);
    if (!original) {
      console.warn('dbCreateRewitnessRunsheet: original runsheet not found:', originalId);
      return null;
    }
    var originalAttempt = original.attempt_number || 1;
    // Carry forward ALL tests:
    //   - Failed tests → reset to pending (must be re-witnessed)
    //   - Passing tests → keep result + carried_from_attempt flag (audit trail)
    //   - Pending tests → reset (shouldn't exist on a submitted runsheet anyway)
    var originalTests = (original.tests || []);
    if (!originalTests.length) {
      console.warn('dbCreateRewitnessRunsheet: no tests on original to carry forward');
      return null;
    }
    var carriedTests = originalTests.map(function(t){
      var fresh = Object.assign({}, t);
      if (t && t.result === 'pass') {
        // Inherit pass — keep result, comment, photos, tested_at, but flag as carried
        // so the PDF can show "Pass (from attempt 1)" rather than pretending re-tested.
        fresh.carried_from_attempt = originalAttempt;
        // Strip any deprecated synonyms quietly
        delete fresh.actual_value;
        delete fresh.actualValue;
        delete fresh.tested_by;
        delete fresh.testedBy;
      } else {
        // Failed or pending → reset to pending
        delete fresh.result;
        delete fresh.actual_value;
        delete fresh.actualValue;
        delete fresh.comment;
        delete fresh.comments;
        delete fresh.photos;
        delete fresh.tested_at;
        delete fresh.testedAt;
        delete fresh.tested_by;
        delete fresh.testedBy;
        delete fresh.carried_from_attempt;
        fresh.result = null;
        fresh.photos = [];
      }
      return fresh;
    });
    // Build the new runsheet, preserving the template snapshot and equipment link.
    var fresh = {
      equipment_id: original.equipment_id,
      template_id: original.template_id,
      status: 'draft',
      attempt_number: originalAttempt + 1,
      parent_runsheet_id: original.id,
      scheduled_date: null,
      signed_at: null,
      runsheet_type: original.runsheet_type || 'equipment',  // preserve system vs equipment
      // Copy snapshot + non-state fields from `data`
      template_snapshot: original.template_snapshot || null,
      equipment_name: original.equipment_name || null,
      cx_tracker_id: original.cx_tracker_id || null,        // preserve tracker link
      scope_description: original.scope_description || null, // preserve system scope
      tests: carriedTests,
      witnesses: [],         // fresh sign-off required
      comments: '',
      photos: []
    };
    return await dbCreateWitnessRunsheet(original.project_num, fresh);
  } catch(e) {
    console.warn('dbCreateRewitnessRunsheet('+originalId+') failed:', e.message);
    return null;
  }
}

// ── Convenience: pull a company template into a project ──
// Snapshots the company template into project_witness_templates, recording
// source_template_id + source_template_version for audit (per design doc).
// Returns the new project template object, or null on failure.
async function dbPullWitnessTemplateToProject(projectNum, companyTemplateId) {
  if (!projectNum || !companyTemplateId) return null;
  try {
    var src = await dbGetWitnessTemplate(companyTemplateId);
    if (!src) {
      console.warn('dbPullWitnessTemplateToProject: company template not found:', companyTemplateId);
      return null;
    }
    // Build the project-tier copy. Strip id/timestamps; add audit linkage.
    var copy = {};
    Object.keys(src).forEach(function(k){
      if (['id','created_at','updated_at'].indexOf(k) === -1) copy[k] = src[k];
    });
    copy.source_template_id = src.id;
    copy.source_template_version = src.updated_at || src.created_at || null;
    copy.pulled_at = new Date().toISOString();
    var newId = await dbSaveProjectWitnessTemplate(projectNum, copy);
    if (!newId) return null;
    return await dbGetProjectWitnessTemplate(newId);
  } catch(e) {
    console.warn('dbPullWitnessTemplateToProject('+projectNum+','+companyTemplateId+') failed:', e.message);
    return null;
  }
}

// ── Convenience: get all runsheets for a given status (filter helper) ──
// e.g. dbGetWitnessRunsheetsByStatus('GCT001', 'failed_pending_rework')
async function dbGetWitnessRunsheetsByStatus(projectNum, status) {
  if (!projectNum || !status) return [];
  try {
    var rows = await sbFetch(
      'witness_runsheets?project_num=eq.'+encodeURIComponent(projectNum)+
      '&status=eq.'+encodeURIComponent(status)+
      '&select=*&order=created_at.desc'
    );
    return (rows || []).map(_witnessRowToRunsheet);
  } catch(e) {
    console.warn('dbGetWitnessRunsheetsByStatus('+projectNum+','+status+') failed:', e.message);
    return [];
  }
}

// ── Convenience: walk a re-witness chain for an equipment ──
// Returns [attempt1, attempt2, attempt3, ...] sorted by attempt_number ascending.
// Used by the witness landing page to render attempt history.
async function dbGetWitnessAttemptChain(projectNum, equipmentId) {
  return await dbGetWitnessRunsheetsByEquipment(projectNum, equipmentId);
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

// ── Vendor Invoices ──
async function dbGetVendorInvoices(projectNum) {
  return await dbGetProject('procurement', projectNum+'_vi') || {};
}
async function dbSetVendorInvoices(projectNum, data) {
  return await dbSetProject('procurement', projectNum+'_vi', data);
}

// ── Subcontractor Agreements ──
async function dbGetSubAgreements(projectNum) {
  return await dbGetProject('procurement', projectNum+'_sa') || [];
}
async function dbSetSubAgreements(projectNum, data) {
  return await dbSetProject('procurement', projectNum+'_sa', data);
}

// ── Equipment Schedule Templates (company-level) ──
async function dbGetEqsTemplates() {
  return await dbGet('eqs_templates') || [];
}
async function dbSetEqsTemplates(data) {
  return await dbSet('eqs_templates', data);
}

// ── Equipment Schedule Submissions (project → company) ──
async function dbGetEqsSubmissions() {
  return await dbGet('eqs_submissions') || [];
}
async function dbSetEqsSubmissions(data) {
  return await dbSet('eqs_submissions', data);
}

// ── Transmittals ──
async function dbGetTransmittals(projectNum) {
  return await dbGetProject('transmittals', projectNum) || [];
}
async function dbSetTransmittals(projectNum, data) {
  return await dbSetProject('transmittals', projectNum, data);
}

// ── Commissioning MSSB ──
async function dbGetCommissioningMssb(projectNum) {
  return await dbGetProject('commissioning_mssb', projectNum) || {};
}
async function dbSetCommissioningMssb(projectNum, data) {
  return await dbSetProject('commissioning_mssb', projectNum, data);
}

// ── Pre-Cx Template ──
async function dbGetPrecxTemplate() {
  return await dbGet('precx_template') || {};
}
async function dbSetPrecxTemplate(data) {
  return await dbSet('precx_template', data);
}

// ── Pre-Cx Template Library (company-level, multiple templates) ──
async function dbGetPrecxTemplateLibrary() {
  return await dbGet('precx_template_library') || [];
}
async function dbSetPrecxTemplateLibrary(data) {
  return await dbSet('precx_template_library', data);
}

// ── Project Pre-Cx Template (project-scoped, single duplicated template per project) ──
async function dbGetProjectPrecxTemplate(projectNum) {
  return await dbGetProject('project_precx_template', projectNum);
}
async function dbSetProjectPrecxTemplate(projectNum, data) {
  return await dbSetProject('project_precx_template', projectNum, data);
}

// ── Project Pre-Cx Area Checklists (project-scoped, array of checklist instances per project) ──
async function dbGetProjectPrecxAreaChecklists(projectNum) {
  return await dbGetProject('project_precx_area_checklists', projectNum) || [];
}
async function dbSetProjectPrecxAreaChecklists(projectNum, data) {
  return await dbSetProject('project_precx_area_checklists', projectNum, data);
}

// ── Project Plan Templates (company-level, multiple master templates) ──
async function dbGetProjectPlanTemplates() {
  return await dbGet('project_plan_templates') || [];
}
async function dbSetProjectPlanTemplates(data) {
  return await dbSet('project_plan_templates', data);
}

// ── Project Plans (project-scoped, array of plans per project) ──
// Each project can have multiple plans (e.g. "Main works", "Plant room", "Tenancy fitout L3")
// Each plan has phases → stages → items
async function dbGetProjectPlans(projectNum) {
  return await dbGetProject('project_plans', projectNum) || [];
}
async function dbSetProjectPlans(projectNum, data) {
  return await dbSetProject('project_plans', projectNum, data);
}


// ═══════════════════════════════════════════════════
// PHOTO STORAGE HELPERS
// Upload photos to hvacnex-photos bucket
// Returns URL string, or null on failure
// ═══════════════════════════════════════════════════
const PHOTO_BUCKET = 'hvacnex-photos';

async function uploadPhoto(file, folder) {
  try {
    folder = folder || 'general';
    var ext = file.name.split('.').pop() || 'jpg';
    var path = folder + '/' + Date.now() + '_' + Math.random().toString(36).slice(2,6) + '.' + ext;
    return await sbUploadFile(PHOTO_BUCKET, path, file, { contentType: file.type || 'image/jpeg' });
  } catch(e) {
    console.warn('uploadPhoto error:', e.message);
    return null;
  }
}

async function deletePhoto(url) {
  try {
    if (!url || !url.includes(PHOTO_BUCKET)) return;
    var path = url.split('/object/public/' + PHOTO_BUCKET + '/')[1];
    if (!path) return;
    await fetch(SUPABASE_URL + '/storage/v1/object/' + PHOTO_BUCKET + '/' + path, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + sbGetAuthToken() }
    });
  } catch(e) { console.warn('deletePhoto error:', e.message); }
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

// ── Asset Register ──
async function dbGetAssetRegister(projectNum) {
  return await dbGetProject('asset_register', projectNum) || {};
}
async function dbSetAssetRegister(projectNum, data) {
  return await dbSetProject('asset_register', projectNum, data);
}

// ── O&M Manual (project-scoped) ──
async function dbGetOmManual(projectNum) {
  return await dbGetProject('om_manuals', projectNum) || null;
}
async function dbSetOmManual(projectNum, data) {
  return await dbSetProject('om_manuals', projectNum, data);
}
async function dbDeleteOmManual(projectNum) {
  try {
    await sbFetch(`om_manuals?project_num=eq.${encodeURIComponent(projectNum)}`, { method: 'DELETE' });
    return true;
  } catch(e) {
    console.warn(`dbDeleteOmManual(${projectNum}) failed:`, e.message);
    return false;
  }
}

// ── Maintenance Library (company-level) ──
async function dbGetMaintenanceLibrary() {
  return await dbGet('maintenance_library') || [];
}
async function dbSetMaintenanceLibrary(data) {
  return await dbSet('maintenance_library', data);
}

// ── Certificates Template (company-level) ──
async function dbGetCertificatesTemplate() {
  return await dbGet('certificates_template') || [];
}
async function dbSetCertificatesTemplate(data) {
  return await dbSet('certificates_template', data);
}

// ── Specifications ──
async function dbGetSpecifications(projectNum) {
  return await dbGetProject('specifications', projectNum) || [];
}
async function dbSetSpecifications(projectNum, data) {
  return await dbSetProject('specifications', projectNum, data);
}

// ── Soft Delete Utilities ──
function softDeleteFile(fileObj){if(!fileObj)return;fileObj._deleted=true;fileObj._deletedAt=new Date().toISOString().split('T')[0];}
function isFileActive(fileObj){return fileObj&&!fileObj._deleted;}
function getActiveFiles(filesArray){return(filesArray||[]).filter(isFileActive);}
function getDeletedFiles(filesArray){return(filesArray||[]).filter(function(f){return f&&f._deleted;});}
function restoreFile(fileObj){if(!fileObj)return;delete fileObj._deleted;delete fileObj._deletedAt;}
function purgeOldDeletedFiles(filesArray,retentionDays){
  retentionDays=retentionDays||30;
  var cutoff=new Date();cutoff.setDate(cutoff.getDate()-retentionDays);
  var cutoffStr=cutoff.toISOString().split('T')[0];
  var kept=(filesArray||[]).filter(function(f){
    if(!f._deleted)return true;
    if(!f._deletedAt)return false;
    return f._deletedAt>cutoffStr;
  });
  filesArray.length=0;kept.forEach(function(f){filesArray.push(f);});
  return filesArray;
}

// ── AI Usage Logging ──
async function dbLogAiUsage(projectNum,module,action,usage){
  try{
    var companyId=authGetCompanyId();
    var inputTokens=(usage&&usage.input_tokens)||0;
    var outputTokens=(usage&&usage.output_tokens)||0;
    // Claude Sonnet 4 pricing: $3/M input, $15/M output
    var costUsd=((inputTokens/1000000)*3)+((outputTokens/1000000)*15);
    await fetch(SUPABASE_URL+'/rest/v1/ai_usage',{
      method:'POST',
      headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+sbGetAuthToken(),'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({company_id:companyId,project_num:projectNum||null,module:module||'unknown',action:action||'query',model:'claude-sonnet-4-6',input_tokens:inputTokens,output_tokens:outputTokens,cost_usd:parseFloat(costUsd.toFixed(6)),created_at:new Date().toISOString()})
    });
  }catch(e){console.warn('AI usage log failed:',e.message);}
}
