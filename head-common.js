// ── HVAC Nexus — Head Common ──
// Injects favicon and common meta tags into every page
(function(){
  // Favicon
  if(!document.querySelector('link[rel="icon"]')){
    var link=document.createElement('link');
    link.rel='icon';link.type='image/svg+xml';link.href='favicon.svg';
    document.head.appendChild(link);
  }
  // Google Fonts if not already loaded
  if(!document.querySelector('link[href*="fonts.googleapis"]')){
    var fonts=document.createElement('link');
    fonts.rel='stylesheet';
    fonts.href='https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap';
    document.head.appendChild(fonts);
  }
})();
