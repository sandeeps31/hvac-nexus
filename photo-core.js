/* ============================================================
   HVAC Nexus — photo-core.js
   Shared photo pipeline for BOTH desktop and mobile.

   Flow per photo:
     1. compressImage()  — Canvas API: resize ≤1920px, strip GPS
                           EXIF, output JPEG ~quality 0.85
     2. ask the r2-presign Edge Function for a presigned PUT URL
     3. PUT the compressed blob straight to Cloudflare R2
     4. INSERT a row in the `photos` table (metadata only)

   Returns a photo object the caller stores in its own record:
     { id, url, key, date, name, w, h, size }

   Environment-agnostic: reads the Supabase session token + company
   id from localStorage (set at login on both desktop & mobile).
   No SDK dependency — uses fetch throughout.
   ============================================================ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://qbsjrccrgkbevncvxbio.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFic2pyY2NyZ2tiZXZuY3Z4YmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMjU5MjIsImV4cCI6MjA5MDYwMTkyMn0.Y8CYH3QXjEVsYIyXEiUM_imjNpDokRE1h9iNmRh_JoA';
  var EDGE_FN = SUPABASE_URL + '/functions/v1/r2-presign';

  var MAX_DIM = 1920;        // longest edge after resize
  var JPEG_QUALITY = 0.85;   // compression quality

  // ── Session helpers (work on desktop & mobile) ─────────────
  // Desktop stores session JSON at localStorage['hvacnexus_session'].
  // Mobile (Supabase SDK) also mirrors a session; we prefer the
  // explicit localStorage value, then fall back to window._session.
  function getAccessToken() {
    try {
      var raw = localStorage.getItem('hvacnexus_session');
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.access_token) return s.access_token;
        if (s && s.session && s.session.access_token) return s.session.access_token;
      }
    } catch (e) {}
    // Mobile SDK fallback
    try {
      if (window._session && window._session.access_token) return window._session.access_token;
    } catch (e) {}
    return null;
  }

  function getCompanyId() {
    return localStorage.getItem('hvacnexus_company_id') || null;
  }

  function getUserId() {
    // Try the desktop-stored current user first
    try {
      var cu = JSON.parse(localStorage.getItem('hvacnexus_current_user') || 'null');
      if (cu && cu.id) return cu.id;
    } catch (e) {}
    // Fall back to decoding the JWT 'sub' claim
    try {
      var tok = getAccessToken();
      if (tok) {
        var payload = JSON.parse(atob(tok.split('.')[1]));
        if (payload && payload.sub) return payload.sub;
      }
    } catch (e) {}
    return null;
  }

  // ── 1. Compress + strip GPS EXIF ───────────────────────────
  // Draws the image onto a canvas (which discards ALL EXIF including
  // GPS), resizes to MAX_DIM longest edge, re-encodes as JPEG.
  // Returns a Promise<{ blob, width, height }>.
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        reject(new Error('Not an image file'));
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        // Scale down to fit MAX_DIM on the longest edge
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w >= h) { h = Math.round(h * (MAX_DIM / w)); w = MAX_DIM; }
          else        { w = Math.round(w * (MAX_DIM / h)); h = MAX_DIM; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        // White matte behind any transparency (JPEG has no alpha)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('Compression failed')); return; }
          resolve({ blob: blob, width: w, height: h });
        }, 'image/jpeg', JPEG_QUALITY);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image'));
      };
      img.src = url;
    });
  }

  // ── 2+3+4. Full upload pipeline ────────────────────────────
  // opts: { module, parentType, parentId, projectNum, caption }
  // Returns Promise<photoObj> or throws.
  async function uploadPhoto(file, opts) {
    opts = opts || {};
    var token = getAccessToken();
    var companyId = getCompanyId();
    var userId = getUserId();
    if (!token) throw new Error('Not signed in (no session token)');
    if (!companyId) throw new Error('No company id in localStorage');

    var projectNum = opts.projectNum || '';
    var module = opts.module || 'general';

    // 1. Compress
    var c = await compressImage(file);
    var blob = c.blob;

    // 2. Ask the Edge Function for a presigned PUT URL
    var presignRes = await fetch(EDGE_FN, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        companyId: companyId,
        projectNum: projectNum,
        module: module,
        contentType: 'image/jpeg',
        sizeBytes: blob.size
      })
    });
    if (!presignRes.ok) {
      var errTxt = await presignRes.text();
      throw new Error('Presign failed (' + presignRes.status + '): ' + errTxt);
    }
    var presign = await presignRes.json();
    // presign = { photoId, uploadUrl, publicUrl, key, expiresIn }

    // 3. PUT the blob straight to R2
    var putRes = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob
    });
    if (!putRes.ok) {
      throw new Error('R2 upload failed (' + putRes.status + ')');
    }

    // 4. Write the metadata row in `photos`
    var metaRow = {
      id: presign.photoId,
      company_id: companyId,
      project_num: projectNum,
      module: module,
      parent_type: opts.parentType || null,
      parent_id: opts.parentId || null,
      r2_key: presign.key,
      public_url: presign.publicUrl,
      caption: opts.caption || null,
      width: c.width,
      height: c.height,
      size_bytes: blob.size,
      taken_at: fileTakenAt(file),
      uploaded_by: userId
    };
    var insRes = await fetch(SUPABASE_URL + '/rest/v1/photos', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(metaRow)
    });
    if (!insRes.ok) {
      var insErr = await insRes.text();
      // The photo bytes are in R2 but metadata failed — surface it
      throw new Error('Metadata insert failed (' + insRes.status + '): ' + insErr);
    }

    // Return a compact object for the caller to store in its record
    return {
      id: presign.photoId,
      url: presign.publicUrl,
      key: presign.key,
      date: new Date().toISOString().split('T')[0],
      name: file.name || 'photo.jpg',
      w: c.width,
      h: c.height,
      size: blob.size
    };
  }

  // ── Delete (metadata row; R2 object cleanup is a later sweep) ─
  async function deletePhoto(photoId) {
    var token = getAccessToken();
    if (!token || !photoId) return false;
    try {
      var res = await fetch(SUPABASE_URL + '/rest/v1/photos?id=eq.' + encodeURIComponent(photoId), {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + token,
          'apikey': SUPABASE_ANON_KEY
        }
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  // ── Fetch photos for a parent record ───────────────────────
  // opts: { parentType, parentId } OR { projectNum, module }
  async function getPhotos(opts) {
    opts = opts || {};
    var token = getAccessToken();
    if (!token) return [];
    var q = SUPABASE_URL + '/rest/v1/photos?select=*&order=created_at.asc';
    if (opts.parentType) q += '&parent_type=eq.' + encodeURIComponent(opts.parentType);
    if (opts.parentId)   q += '&parent_id=eq.' + encodeURIComponent(opts.parentId);
    if (opts.projectNum) q += '&project_num=eq.' + encodeURIComponent(opts.projectNum);
    if (opts.module)     q += '&module=eq.' + encodeURIComponent(opts.module);
    try {
      var res = await fetch(q, {
        headers: {
          'Authorization': 'Bearer ' + token,
          'apikey': SUPABASE_ANON_KEY
        }
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      return [];
    }
  }

  // Best-effort EXIF capture timestamp (kept; GPS is stripped by canvas).
  // We don't parse EXIF here — just use lastModified as a proxy taken_at.
  function fileTakenAt(file) {
    try {
      if (file && file.lastModified) return new Date(file.lastModified).toISOString();
    } catch (e) {}
    return new Date().toISOString();
  }

  // ── Expose ─────────────────────────────────────────────────
  window.PhotoCore = {
    compressImage: compressImage,
    uploadPhoto: uploadPhoto,
    deletePhoto: deletePhoto,
    getPhotos: getPhotos,
    _getToken: getAccessToken,     // exposed for the test harness
    _getCompanyId: getCompanyId
  };
})();
