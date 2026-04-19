// ── HVAC Nexus — Shared Sidebar ──
// Drop <div id="app-sidebar"></div> in your page and this script renders it
// Also handles: project name display, active nav item, collapse state, logout

(function(){
  var SIDEBAR_HTML = `
<div class="sb" id="sidebar">
  <div class="sb-resize-handle" id="sbResize"></div>
  <div class="sb-top">
    <div class="sb-brand"><span class="sb-icon">❄️</span><span class="sb-name">HVAC NEXUS</span></div>
    <button class="sb-toggle" onclick="toggleSB()" id="sbToggleBtn">«</button>
  </div>
  <div class="sb-proj-block">
    <div class="sb-proj-lbl">Current Project</div>
    <div class="sb-proj-name" id="sb-proj-name">—</div>
    <div class="sb-proj-num" id="sb-proj-num">—</div>
  </div>
  <nav class="sb-nav" id="sbNav">
    <div class="sb-item" onclick="navTo('index.html')"><span class="sb-item-icon">🏗️</span><span class="sb-item-label">Projects</span></div>
    <div class="sb-item" onclick="navTo('project-dashboard.html')"><span class="sb-item-icon">🏠</span><span class="sb-item-label">Project Dashboard</span></div>

    <div class="sb-group">
      <div class="sb-group-hdr" onclick="toggleGroup('financials')" id="ghdr-financials">
        <span class="sb-group-chev" id="gchev-financials">▾</span>
        <span class="sb-group-name">Financials</span>
      </div>
      <div class="sb-group-items" id="gitems-financials">
        <div class="sb-item" onclick="navTo('hvac-budget.html')"><span class="sb-item-icon">📊</span><span class="sb-item-label">Budget</span></div>
        <div class="sb-item" onclick="navTo('hvac-progress-claims.html')"><span class="sb-item-icon">📈</span><span class="sb-item-label">Progress claims</span></div>
        <div class="sb-item" onclick="navTo('hvac-vendor-invoices.html')"><span class="sb-item-icon">🧾</span><span class="sb-item-label">Vendor invoices</span></div>
        <div class="sb-item" onclick="navTo('hvac-variations.html')"><span class="sb-item-icon">🔄</span><span class="sb-item-label">Variations</span></div>
        <div class="sb-item" onclick="navTo('hvac-subcontractor-variations.html')"><span class="sb-item-icon">👥</span><span class="sb-item-label">Subbie variations</span></div>
      </div>
    </div>

    <div class="sb-group">
      <div class="sb-group-hdr" onclick="toggleGroup('procurement')" id="ghdr-procurement">
        <span class="sb-group-chev" id="gchev-procurement">▾</span>
        <span class="sb-group-name">Procurement</span>
      </div>
      <div class="sb-group-items" id="gitems-procurement">
        <div class="sb-item" onclick="navTo('hvac-procurement-schedule.html')"><span class="sb-item-icon">📅</span><span class="sb-item-label">Procurement schedule</span></div>
        <div class="sb-item" onclick="navTo('hvac-procurement-pos.html')"><span class="sb-item-icon">📦</span><span class="sb-item-label">Purchase orders</span></div>
        <div class="sb-item" onclick="navTo('hvac-subcontractor-agreements.html')"><span class="sb-item-icon">📝</span><span class="sb-item-label">Subcontractor agreements</span></div>
      </div>
    </div>

    <div class="sb-group">
      <div class="sb-group-hdr" onclick="toggleGroup('technical')" id="ghdr-technical">
        <span class="sb-group-chev" id="gchev-technical">▾</span>
        <span class="sb-group-name">Technical</span>
      </div>
      <div class="sb-group-items" id="gitems-technical">
        <div class="sb-item" style="opacity:.45;pointer-events:none"><span class="sb-item-icon">❓</span><span class="sb-item-label">RFI</span></div>
        <div class="sb-item" onclick="navTo('hvac-tech-submissions.html')"><span class="sb-item-icon">📤</span><span class="sb-item-label">Tech submissions</span></div>
        <div class="sb-item" onclick="navTo('hvac-drawings.html')"><span class="sb-item-icon">📐</span><span class="sb-item-label">Drawings</span></div>
        <div class="sb-item" onclick="navTo('hvac-specifications.html')"><span class="sb-item-icon">📋</span><span class="sb-item-label">Specifications</span></div>
        <div class="sb-item" onclick="navTo('hvac-equipment-schedule.html')"><span class="sb-item-icon">🗂️</span><span class="sb-item-label">Equipment schedules</span></div>
        <div class="sb-item" style="opacity:.45;pointer-events:none"><span class="sb-item-icon">📅</span><span class="sb-item-label">Project plan</span></div>
      </div>
    </div>

    <div class="sb-group">
      <div class="sb-group-hdr" onclick="toggleGroup('quality')" id="ghdr-quality">
        <span class="sb-group-chev" id="gchev-quality">▾</span>
        <span class="sb-group-name">Quality</span>
      </div>
      <div class="sb-group-items" id="gitems-quality">
        <div class="sb-item" onclick="navTo('hvac-itp.html')"><span class="sb-item-icon">📋</span><span class="sb-item-label">ITPs</span></div>
        <div class="sb-item" onclick="navTo('hvac-fire-register.html')"><span class="sb-item-icon">🔥</span><span class="sb-item-label">Passive fire</span></div>
        <div class="sb-item" onclick="navTo('hvac-defects.html')"><span class="sb-item-icon">⚠️</span><span class="sb-item-label">Defects</span></div>
        <div class="sb-item" style="opacity:.45;pointer-events:none"><span class="sb-item-icon">📄</span><span class="sb-item-label">NCR</span></div>
      </div>
    </div>

    <div class="sb-group">
      <div class="sb-group-hdr" onclick="toggleGroup('commissioning')" id="ghdr-commissioning">
        <span class="sb-group-chev" id="gchev-commissioning">▾</span>
        <span class="sb-group-name">Commissioning</span>
      </div>
      <div class="sb-group-items" id="gitems-commissioning">
        <div class="sb-item" onclick="navTo('hvac-commissioning-plan.html')"><span class="sb-item-icon">📋</span><span class="sb-item-label">Commissioning plan</span></div>
        <div class="sb-item" onclick="navTo('hvac-precommissioning.html')"><span class="sb-item-icon">✔️</span><span class="sb-item-label">Pre-commissioning</span></div>
        <div class="sb-item" onclick="navTo('hvac-commissioning.html')"><span class="sb-item-icon">⚙️</span><span class="sb-item-label">Commissioning tracker</span></div>
      </div>
    </div>

    <div class="sb-group">
      <div class="sb-group-hdr" onclick="toggleGroup('handover')" id="ghdr-handover">
        <span class="sb-group-chev" id="gchev-handover">▾</span>
        <span class="sb-group-name">Handover</span>
      </div>
      <div class="sb-group-items" id="gitems-handover">
        <div class="sb-item" onclick="navTo('hvac-asset-register.html')"><span class="sb-item-icon">📦</span><span class="sb-item-label">Asset register</span></div>
        <div class="sb-item" style="opacity:.45;pointer-events:none"><span class="sb-item-icon">📖</span><span class="sb-item-label">O&amp;M manuals</span></div>
        <div class="sb-item" style="opacity:.45;pointer-events:none"><span class="sb-item-icon">🔧</span><span class="sb-item-label">Maintenance plan</span></div>
        <div class="sb-item" style="opacity:.45;pointer-events:none"><span class="sb-item-icon">🎓</span><span class="sb-item-label">User training</span></div>
      </div>
    </div>

    <div class="sb-group">
      <div class="sb-group-hdr" onclick="toggleGroup('settings')" id="ghdr-settings">
        <span class="sb-group-chev" id="gchev-settings">▾</span>
        <span class="sb-group-name">Settings</span>
      </div>
      <div class="sb-group-items" id="gitems-settings">
        <div class="sb-item" onclick="navTo('hvac-project-settings.html')"><span class="sb-item-icon">🏗️</span><span class="sb-item-label">Project settings</span></div>
        <div class="sb-item" onclick="navTo('hvac-settings.html')"><span class="sb-item-icon">⚙️</span><span class="sb-item-label">Company settings</span></div>
      </div>
    </div>
  </nav>
  <div class="sb-footer">
    <div class="sb-av" id="sb-av">S</div>
    <span class="sb-user-name" id="sb-user" style="flex:1">—</span>
    <button onclick="authSignOut()" title="Sign out" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:2px 4px;border-radius:4px;transition:color .13s;flex-shrink:0" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--muted)'">⏻</button>
  </div>
</div>`;

  // Inject sidebar HTML
  document.addEventListener('DOMContentLoaded', function(){
    var target = document.getElementById('app-sidebar');
    if(target){
      target.outerHTML = SIDEBAR_HTML;
    }

    // Mark active nav item based on current page
    var page = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.sb-item').forEach(function(el){
      var onclick = el.getAttribute('onclick') || '';
      if(onclick.indexOf(page) >= 0){
        el.classList.add('active');
      }
    });

    // Load project name
    var SBK = 'hvacnexus_sb_collapsed';
    try{
      var p = JSON.parse(localStorage.getItem('hvacnexus_current_project') || '{}');
      if(p.name){ var pn=document.getElementById('sb-proj-name'); if(pn)pn.textContent=p.name; }
      if(p.num){ var pnum=document.getElementById('sb-proj-num'); if(pnum)pnum.textContent=p.num; }
    }catch(e){}

    // Load user name
    try{
      var sess = JSON.parse(localStorage.getItem('hvacnexus_session') || '{}');
      var name = sess.user?.user_metadata?.name || sess.user?.email || '—';
      var av = document.getElementById('sb-av');
      var un = document.getElementById('sb-user');
      if(av) av.textContent = name.charAt(0).toUpperCase();
      if(un) un.textContent = name;
    }catch(e){}

    // Apply collapse state
    applySB(localStorage.getItem(SBK) === '1');

    // Resize handle
    var handle = document.getElementById('sbResize');
    var sb = document.getElementById('sidebar');
    if(handle && sb){
      var MIN_W=230, MAX_W=276, dragging=false, startX=0, startW=0;
      handle.addEventListener('mousedown', function(e){
        dragging=true; startX=e.clientX; startW=sb.offsetWidth;
        document.body.style.userSelect='none'; document.body.style.cursor='col-resize';
        e.preventDefault();
      });
      document.addEventListener('mousemove', function(e){
        if(!dragging)return;
        var w=Math.min(MAX_W, Math.max(MIN_W, startW+(e.clientX-startX)));
        sb.style.width=w+'px';
      });
      document.addEventListener('mouseup', function(){
        if(!dragging)return;
        dragging=false; document.body.style.userSelect=''; document.body.style.cursor='';
      });
    }
  });

  // Global sidebar functions
  window.toggleSB = function(){
    var SBK='hvacnexus_sb_collapsed';
    var c=!document.getElementById('sidebar').classList.contains('sm');
    localStorage.setItem(SBK, c?'1':'0');
    applySB(c);
  };
  window.applySB = function(c){
    var sb=document.getElementById('sidebar');
    var main=document.getElementById('mainWrap')||document.querySelector('.main');
    var btn=document.getElementById('sbToggleBtn');
    if(sb) sb.classList.toggle('sm', c);
    if(main) main.style.marginLeft=c?'52px':'';
    if(btn) btn.textContent=c?'»':'«';
  };
  window.toggleGroup = function(id){
    var items=document.getElementById('gitems-'+id);
    var chev=document.getElementById('gchev-'+id);
    if(!items||!chev)return;
    var open=items.style.display!=='none';
    items.style.display=open?'none':'block';
    chev.textContent=open?'▸':'▾';
  };
  window.navTo = function(url){
    var b=window.location.href.substring(0,window.location.href.lastIndexOf('/')+1);
    window.location.href=b+url;
  };
  window.authSignOut = function(){
    var SURL='https://qbsjrccrgkbevncvxbio.supabase.co';
    var SKEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFic2pyY2NyZ2tiZXZuY3Z4YmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMjU5MjIsImV4cCI6MjA5MDYwMTkyMn0.Y8CYH3QXjEVsYIyXEiUM_imjNpDokRE1h9iNmRh_JoA';
    try{
      var sess=JSON.parse(localStorage.getItem('hvacnexus_session')||'{}');
      if(sess.access_token) fetch(SURL+'/auth/v1/logout',{method:'POST',headers:{'apikey':SKEY,'Authorization':'Bearer '+sess.access_token}});
    }catch(e){}
    localStorage.removeItem('hvacnexus_session');
    localStorage.removeItem('hvacnexus_company_id');
    window.location.href='hvac-login.html';
  };
})();
