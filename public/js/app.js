// ═══════════════════════════════════════════════════════════════════════════════
// HIGHSPEED LOGISTIK — LAGERMANAGEMENT FRONTEND v3
// ═══════════════════════════════════════════════════════════════════════════════
const app = document.getElementById('app');
let currentUser = null;
let currentPage = 'dashboard';

// ─── INIT ────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const r = await fetch('/api/auth/session');
    if (r.ok) { currentUser = (await r.json()).user; renderApp(); }
    else renderLogin();
  } catch { renderLogin(); }
}

// ─── API HELPER ──────────────────────────────────────────────────────────────
async function api(url, opts = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Fehler');
  return data;
}

function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────
function renderLogin() {
  app.innerHTML = `
    <div class="login-page">
      <div class="login-box">
        <h1>HIGHSPEED Logistik</h1>
        <p class="subtitle">Lagermanagement · Anmeldung</p>
        <input type="text" id="login-user" placeholder="Benutzername" autofocus>
        <input type="password" id="login-pass" placeholder="Passwort">
        <button onclick="doLogin()">Anmelden</button>
        <p class="login-error" id="login-err"></p>
      </div>
    </div>`;
  document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

async function doLogin() {
  const err = document.getElementById('login-err');
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { benutzername: document.getElementById('login-user').value, passwort: document.getElementById('login-pass').value } });
    currentUser = data.user;
    renderApp();
  } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
}

// ─── APP SHELL ───────────────────────────────────────────────────────────────
function renderApp() {
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h2>HIGHSPEED Logistik</h2>
          <small>Lagermanagement</small>
        </div>
        <nav>
          <div class="nav-section">Übersicht</div>
          <a href="#" data-page="dashboard" class="active"><span class="icon">◉</span><span>Dashboard</span></a>
          <a href="#" data-page="suche"><span class="icon">⌕</span><span>Suche</span></a>
          
          <div class="nav-section">Lagerverwaltung</div>
          <a href="#" data-page="direktanlieferung"><span class="icon">⬇</span><span>Direkteinlagerung</span></a>
          <a href="#" data-page="pickliste"><span class="icon">☑</span><span>Abruf / Pickliste</span></a>
          <a href="#" data-page="musterung"><span class="icon">◈</span><span>Musterzug</span></a>
          <a href="#" data-page="umlagerung"><span class="icon">⇄</span><span>Umlagerung</span></a>
          <a href="#" data-page="einlagerung"><span class="icon">↓</span><span>Einlagerung</span></a>
          <a href="#" data-page="auslagerung"><span class="icon">↑</span><span>Direktauslagerung</span></a>
          <a href="#" data-page="lagerplan"><span class="icon">▦</span><span>Lagerplan</span></a>
          
          <div class="nav-section">Abrechnung</div>
          <a href="#" data-page="bewegungen"><span class="icon">⇄</span><span>Bewegungen</span></a>
          <a href="#" data-page="kontingent"><span class="icon">◧</span><span>Kontingent</span></a>
          <a href="#" data-page="berichte"><span class="icon">⊞</span><span>Berichte/PDF</span></a>
          
          <div class="nav-section">System</div>
          <a href="#" data-page="kunden"><span class="icon">⊕</span><span>Kunden</span></a>
          <a href="#" data-page="protokoll"><span class="icon">⊙</span><span>Protokoll</span></a>
          <a href="#" data-page="dokumente"><span class="icon">▤</span><span>Dokumente</span></a>
        </nav>
        <div class="sidebar-footer">
          <div class="user-name">${currentUser.vollname}</div>
          <button onclick="doLogout()">Abmelden</button>
        </div>
      </aside>
      <main class="main-content" id="page-content"></main>
    </div>`;
  
  document.querySelectorAll('.sidebar a[data-page]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); navigate(a.dataset.page); });
  });
  navigate('dashboard');
}

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
  document.querySelector(`.sidebar a[data-page="${page}"]`)?.classList.add('active');
  const fn = pages[page];
  if (fn) fn();
}

async function doLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  renderLogin();
}

// ─── PAGES ───────────────────────────────────────────────────────────────────
const pages = { dashboard: pgDashboard, suche: pgSuche, einlagerung: pgEinlagerung, direktanlieferung: pgDirekteinlagerung, auslagerung: pgAuslagerung, pickliste: pgPickliste, musterung: pgMusterung, umlagerung: pgUmlagerung, lagerplan: pgLagerplan, bewegungen: pgBewegungen, kontingent: pgKontingent, berichte: pgBerichte, kunden: pgKunden, protokoll: pgProtokoll, dokumente: pgDokumente };

// ═══ DASHBOARD ═══════════════════════════════════════════════════════════════
async function pgDashboard() {
  const d = await api('/api/dashboard');
  const pc = document.getElementById('page-content');
  const pct = d.auslastung;
  const barClass = pct > 90 ? 'red' : pct > 70 ? 'yellow' : 'green';
  
  pc.innerHTML = `
    <div class="page-header"><h1>Dashboard</h1></div>
    <div class="stats-grid">
      <div class="stat-card"><div class="label">Lagerplätze</div><div class="value">${d.plaetze_gesamt}</div><div class="sub">${d.plaetze_belegt} belegt · ${d.plaetze_frei} frei</div></div>
      <div class="stat-card ${pct > 90 ? 'warning' : ''}"><div class="label">Auslastung</div><div class="value">${pct}%</div><div class="progress-bar"><div class="fill ${barClass}" style="width:${pct}%"></div></div></div>
      <div class="stat-card"><div class="label">Aktive Paletten</div><div class="value">${d.paletten_aktiv}</div><div class="sub">mit Paletten-Nr.</div></div>
      <div class="stat-card"><div class="label">Offene Abrufe</div><div class="value">${d.offene_abrufe}</div><div class="sub">Pickliste ausstehend</div></div>
      <div class="stat-card"><div class="label">Bewegungen (30T)</div><div class="value">${d.bewegungen_30d}</div><div class="sub">Ein-/Auslagerungen</div></div>
      <div class="stat-card"><div class="label">Kunden aktiv</div><div class="value">${d.kunden_aktiv}</div></div>
    </div>
    
    <div class="card">
      <div class="card-header"><h3>Schnellaktionen</h3></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
        <button class="btn btn-primary btn-lg" onclick="navigate('einlagerung')" style="justify-content:center">↓ Einlagern</button>
        <button class="btn btn-lg" onclick="navigate('direktanlieferung')" style="justify-content:center;background:#e67e22;color:#fff">⬇ Direkteinlagerung</button>
        <button class="btn btn-danger btn-lg" onclick="navigate('auslagerung')" style="justify-content:center;background:var(--danger)">↑ Auslagern</button>
        <button class="btn btn-lg" onclick="navigate('pickliste')" style="justify-content:center;background:var(--info);color:#fff">☑ Abruf</button>
        <button class="btn btn-lg" onclick="navigate('musterung')" style="justify-content:center;background:#8e44ad;color:#fff">◈ Musterzug</button>
        <button class="btn btn-secondary btn-lg" onclick="navigate('umlagerung')" style="justify-content:center">⇄ Umlagern</button>
      </div>
    </div>
    
    ${d.kontingent ? `
    <div class="card">
      <div class="card-header"><h3>Kontingent Panpharma</h3><span class="badge badge-warning">${d.kontingent.monat}${d.kontingent.live ? ' (Live)' : ''}</span></div>
      <div class="form-row">
        <div><strong>Stellplätze:</strong> ${d.kontingent.kontingent_plaetze}</div>
        <div><strong>Bestand:</strong> ${d.kontingent.lagerbestand}</div>
        <div><strong>Verfügbar:</strong> <span style="color:${d.kontingent.verfuegbar < 0 ? 'var(--danger)' : 'var(--success)'}">${d.kontingent.verfuegbar}</span></div>
        <div><strong>Überkapazität:</strong> ${d.kontingent.saldo_ueberkapazitaet || 0}</div>
        <div><strong>Bewegungen:</strong> ${d.kontingent.bewegungen_gesamt}</div>
      </div>
    </div>` : ''}
    <div class="card">
      <div class="card-header"><h3>Bereiche</h3></div>
      <div class="table-wrap"><table><thead><tr><th>Bereich</th><th>Gesamt</th><th>Belegt</th><th>Frei</th><th>%</th></tr></thead><tbody>
        ${d.bereiche.map(b => `<tr><td>${b.bereich}</td><td>${b.gesamt}</td><td>${b.belegt}</td><td>${b.gesamt - b.belegt}</td><td>${Math.round(b.belegt / b.gesamt * 100)}%</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
}

// ═══ SUCHE ═══════════════════════════════════════════════════════════════════
async function pgSuche() {
  const pc = document.getElementById('page-content');
  const kunden = await api('/api/kunden');
  pc.innerHTML = `
    <div class="page-header"><h1>Suche</h1></div>
    <div class="search-bar">
      <input type="text" id="search-input" placeholder="Paletten-Nr., Artikel, Charge oder Lagerplatz eingeben…" autofocus>
      <select id="search-typ">
        <option value="">Überall</option>
        <option value="artikel">Artikel-Nr.</option>
        <option value="charge">Chargen-Nr.</option>
        <option value="lagerplatz">Lagerplatz</option>
        <option value="kunde">Kunde</option>
      </select>
      <button class="btn btn-primary" onclick="doSearch()">Suchen</button>
    </div>
    <div style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--text-muted);align-self:center">Schnellfilter Kunde:</span>
      ${kunden.map(k => `<button class="btn btn-sm btn-secondary" onclick="document.getElementById('search-input').value='${k.name}';document.getElementById('search-typ').value='kunde';doSearch()">${k.name}</button>`).join('')}
    </div>
    <div id="search-results"></div>`;
  document.getElementById('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}

async function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  const typ = document.getElementById('search-typ').value;
  if (!q) return;
  
  const results = await api(`/api/paletten/suche?q=${encodeURIComponent(q)}&typ=${typ}`);
  const box = document.getElementById('search-results');
  
  if (!results.length) { box.innerHTML = '<p style="color:var(--text-muted);padding:20px">Keine Ergebnisse gefunden.</p>'; return; }
  
  const aktiv = results.filter(r => !r.ausgelagert);
  const ausgelagert = results.filter(r => r.ausgelagert);
  
  box.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>${results.length} Ergebnis${results.length !== 1 ? 'se' : ''}${ausgelagert.length > 0 ? ` <span style="font-size:12px;color:var(--text-muted)">(davon ${ausgelagert.length} ausgelagert)</span>` : ''}</h3></div>
      <div class="table-wrap"><table><thead><tr><th>Pal.-Nr.</th><th>Typ</th><th>Lagerplatz</th><th>Artikel</th><th>Charge</th><th>Kunde</th><th>Status</th><th>Aktion</th></tr></thead><tbody>
        ${results.map(r => `<tr style="${r.ausgelagert ? 'opacity:0.6;background:#f5f5f5' : ''}">
          <td><strong>${r.paletten_nr || r.bezeichnung || '—'}</strong></td>
          <td><span class="badge badge-${(r.nummern_typ || '').toLowerCase() === 'eb' ? 'eb' : 'kw'}">${r.nummern_typ || '—'}</span></td>
          <td>${r.ausgelagert ? '<span style="color:var(--text-muted)">—</span>' : (r.platz || r.bezeichnung || '—')}</td>
          <td>${r.artikel_nr || '—'}</td>
          <td>${r.chargen_nr || '—'}</td>
          <td>${r.kunde_name || '—'}</td>
          <td>${r.ausgelagert ? `<span class="badge badge-danger" style="font-size:10px">Ausgelagert${r.ausgelagert_am ? ' ' + r.ausgelagert_am.split('T')[0] : ''}</span>` : '<span class="badge badge-success" style="font-size:10px">Im Lager</span>'}</td>
          <td>
            ${!r.ausgelagert && r.paletten_nr ? `<button class="btn btn-sm btn-secondary" onclick="editPalette(${r.id})">✎</button>` : ''}
            ${!r.ausgelagert && r.paletten_nr ? `<a class="btn btn-sm btn-primary" href="/api/berichte/auslagerungsbeleg/${r.paletten_nr}" target="_blank">PDF</a>` : ''}
          </td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>
    ${ausgelagert.length > 0 ? '<p style="font-size:12px;color:var(--text-muted);margin-top:8px">Ausgelagerte Paletten finden Sie mit allen Details im <a href="#" onclick="navigate(\'protokoll\');return false" style="color:var(--primary)">Änderungsprotokoll</a>.</p>' : ''}`;
}

// ═══ EINLAGERUNG ═════════════════════════════════════════════════════════════
async function pgEinlagerung() {
  const pc = document.getElementById('page-content');
  const kunden = await api('/api/kunden');
  const freie = await api('/api/einlagerung/freie-plaetze');
  const vorschlag = freie.length > 0 ? freie[0].bezeichnung : '';
  
  pc.innerHTML = `
    <div class="page-header"><h1>Einlagerung</h1></div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btn btn-primary btn-sm" id="tab-einzeln" onclick="einlTab('einzeln')">Einzeln einlagern</button>
      <button class="btn btn-secondary btn-sm" id="tab-stapler" onclick="einlTab('stapler')">Staplerauftrag erstellen</button>
      <button class="btn btn-secondary btn-sm" id="tab-auftraege" onclick="einlTab('auftraege')">Aufträge</button>
    </div>
    <div id="einl-tab-einzeln">
      <div class="card">
        <h3 style="margin-bottom:16px">Neue Palette einlagern</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Kunde *</label>
            <select id="einl-kunde" onchange="einlKundeChange()">
              ${kunden.map(k => `<option value="${k.id}" data-prefix="${k.nummern_prefix || ''}" data-format="${k.nummern_format || ''}">${k.name} (${k.kuerzel || ''})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Paletten-Nr. * <span id="einl-format-hint" style="color:var(--text-muted)"></span></label>
            <input type="text" id="einl-nr" placeholder="Nummer vom Kunden eingeben" autofocus onkeydown="if(event.key==='Enter')doEinlagern()">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Lagerplatz * <span style="color:var(--success);font-size:11px">(${freie.length} frei)</span></label>
            <input type="text" id="einl-platz" placeholder="${vorschlag || 'Kein freier Platz'}" value="${vorschlag}" onkeydown="if(event.key==='Enter')doEinlagern()">
            <div style="margin-top:6px;font-size:11px;color:var(--text-muted)">Vorschlag: <strong>${vorschlag}</strong> ${freie.length > 0 && freie[0].max_hoehe_cm ? `(max. ${freie[0].max_hoehe_cm}cm)` : ''} · <a href="#" onclick="showFreiePlaetze();return false" style="color:var(--info)">Alle ${freie.length} freien anzeigen</a></div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Artikel-Nr.</label>
            <input type="text" id="einl-artikel" placeholder="Optional">
          </div>
          <div class="form-group">
            <label>Chargen-Nr.</label>
            <input type="text" id="einl-charge" placeholder="z.B. CETV12345">
          </div>
        </div>
        <div class="form-group">
          <label>Bemerkung</label>
          <textarea id="einl-bemerkung" rows="2" placeholder="Optional"></textarea>
        </div>
        <button class="btn btn-primary btn-lg" onclick="doEinlagern()">Einlagern</button>
      </div>
      <div id="freie-plaetze-box"></div>
    </div>
    <div id="einl-tab-stapler" style="display:none">
      <div class="card">
        <h3 style="margin-bottom:16px">Staplerauftrag erstellen</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:14px">EB-Nummern vom Kunden einfügen (eine pro Zeile). Ein QR-Code wird generiert, den der Staplerfahrer mit dem Handy scannen kann.</p>
        <div class="form-group">
          <label>Kunde *</label>
          <select id="sa-kunde">
            ${kunden.map(k => `<option value="${k.id}" data-prefix="${k.nummern_prefix || ''}">${k.name} (${k.kuerzel || ''})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Paletten-Nummern * <span style="color:var(--text-muted);font-size:11px">(eine pro Zeile)</span></label>
          <textarea id="sa-nummern" rows="8" placeholder="645524\n645525\n645526\n..." style="font-family:monospace"></textarea>
        </div>
        <div class="form-group">
          <label>Bemerkung</label>
          <input type="text" id="sa-bemerkung" placeholder="Optional">
        </div>
        <button class="btn btn-primary btn-lg" onclick="erstelleStaplerauftrag()">Auftrag erstellen & QR generieren</button>
      </div>
      <div id="sa-ergebnis"></div>
    </div>
    <div id="einl-tab-auftraege" style="display:none">
      <div class="card" id="auftraege-liste">
        <h3 style="margin-bottom:16px">Stapleraufträge</h3>
        <p style="color:var(--text-muted)">Lade...</p>
      </div>
    </div>`;
  
  // Letzten Kunden aus localStorage vorbelegen
  const lastKunde = localStorage.getItem('einl_last_kunde');
  if (lastKunde) {
    const sel = document.getElementById('einl-kunde');
    if (sel && [...sel.options].find(o => o.value === lastKunde)) sel.value = lastKunde;
  }
  einlKundeChange();
  loadAuftraege();
}

function einlTab(tab) {
  ['einzeln', 'stapler', 'auftraege'].forEach(t => {
    document.getElementById(`einl-tab-${t}`).style.display = t === tab ? '' : 'none';
    document.getElementById(`tab-${t}`).className = t === tab ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
  });
}

async function erstelleStaplerauftrag() {
  const sel = document.getElementById('sa-kunde');
  const kundeId = sel.value;
  const prefix = sel.options[sel.selectedIndex]?.dataset?.prefix;
  const text = document.getElementById('sa-nummern').value.trim();
  const bemerkung = document.getElementById('sa-bemerkung').value.trim();

  if (!text) { toast('Bitte Paletten-Nummern eingeben', 'error'); return; }

  const nummern = text.split(/[\n,;]+/).map(n => n.trim()).filter(n => n.length > 0);
  if (nummern.length === 0) { toast('Keine gültigen Nummern', 'error'); return; }

  if (prefix === 'EB') {
    const ungueltig = nummern.filter(n => !/^\d{6}$/.test(n));
    if (ungueltig.length > 0) {
      toast(`Panpharma: EB-Nummern müssen 6-stellig sein. Ungültig: ${ungueltig.slice(0, 5).join(', ')}${ungueltig.length > 5 ? '...' : ''}`, 'error');
      return;
    }
  }

  try {
    const data = await api('/api/auftraege', { method: 'POST', body: {
      kunde_id: kundeId,
      positionen: nummern.map(nr => ({ paletten_nr: nr })),
      bemerkung: bemerkung || null
    }});

    document.getElementById('sa-ergebnis').innerHTML = `
      <div class="card" style="margin-top:16px;border:2px solid var(--success)">
        <h3 style="color:var(--success);margin-bottom:12px">✓ Auftrag erstellt — ${data.positionen} Paletten</h3>
        <p style="margin-bottom:14px;font-size:13px;color:var(--text-muted)">Der Staplerfahrer kann den QR-Code scannen oder den Link öffnen:</p>
        <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
          <div id="qr-code-box" style="background:#fff;padding:12px;border-radius:8px;display:inline-block"></div>
          <div style="flex:1;min-width:200px">
            <div class="form-group">
              <label>Link für Staplerfahrer</label>
              <input type="text" value="${data.url}" readonly onclick="this.select();document.execCommand('copy');toast('Link kopiert','success')" style="font-size:13px;cursor:pointer">
            </div>
            <p style="font-size:11px;color:var(--text-muted);margin-top:8px">Tipp: Klick auf den Link kopiert ihn automatisch.</p>
            <button class="btn btn-sm btn-secondary" style="margin-top:10px" onclick="window.open('${data.url}','_blank')">Seite öffnen</button>
            <button class="btn btn-sm btn-secondary" style="margin-top:10px;margin-left:6px" onclick="druckeQR()">QR drucken</button>
            <a class="btn btn-sm btn-primary" style="margin-top:10px;margin-left:6px" href="/api/berichte/einlagerungsbeleg/${data.id}" target="_blank">Einlagerungsbeleg PDF</a>
          </div>
        </div>
      </div>`;

    generateQR(data.url);
    document.getElementById('sa-nummern').value = '';
    loadAuftraege();
  } catch (e) { toast(e.message, 'error'); }
}

function generateQR(url) {
  const box = document.getElementById('qr-code-box');
  if (!box) return;
  if (typeof QRCode !== 'undefined') {
    new QRCode(box, { text: url, width: 180, height: 180, colorDark: '#000000', colorLight: '#ffffff' });
  } else {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
    script.onload = () => { new QRCode(box, { text: url, width: 180, height: 180, colorDark: '#000000', colorLight: '#ffffff' }); };
    document.head.appendChild(script);
  }
}

function druckeQR() {
  const qr = document.getElementById('qr-code-box');
  if (!qr) return;
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>QR-Code Staplerauftrag</title><style>body{text-align:center;padding:40px;font-family:sans-serif}img{width:250px;height:250px}</style></head><body><h2>Einlagerungsauftrag</h2><p>QR-Code scannen zum Einlagern:</p>${qr.innerHTML}<script>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  win.document.close();
}

async function loadAuftraege() {
  const box = document.getElementById('auftraege-liste');
  if (!box) return;
  try {
    const auftraege = await api('/api/auftraege');
    if (auftraege.length === 0) {
      box.innerHTML = `<h3 style="margin-bottom:16px">Stapleraufträge</h3><p style="color:var(--text-muted)">Noch keine Aufträge erstellt.</p>`;
      return;
    }
    box.innerHTML = `
      <h3 style="margin-bottom:16px">Stapleraufträge (${auftraege.length})</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Kunde</th><th>Erstellt</th><th>Fortschritt</th><th>Status</th><th>QR</th></tr></thead>
        <tbody>${auftraege.map(a => `
          <tr>
            <td>${a.id}</td>
            <td>${a.kunde_name || '—'}</td>
            <td>${a.erstellt_am ? a.erstellt_am.substring(0, 16).replace('T', ' ') : '—'}</td>
            <td><strong>${a.erledigt}/${a.gesamt}</strong></td>
            <td><span class="badge ${a.status === 'abgeschlossen' ? 'badge-success' : a.status === 'in_arbeit' ? 'badge-warning' : 'badge-info'}">${a.status}</span></td>
            <td><button class="btn btn-sm btn-secondary" onclick="zeigeAuftragQR('${a.token}')">QR</button></td>
          </tr>
        `).join('')}</tbody>
      </table></div>`;
  } catch (e) { box.innerHTML = `<h3>Stapleraufträge</h3><p style="color:var(--danger)">${e.message}</p>`; }
}

async function zeigeAuftragQR(token) {
  const host = window.location.origin;
  const url = `${host}/stapler/${token}`;
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML = `
    <div style="background:var(--card-bg,#2a2a2a);border-radius:12px;padding:24px;max-width:400px;width:90%;text-align:center">
      <h3 style="margin-bottom:14px">Staplerauftrag QR-Code</h3>
      <div id="modal-qr" style="background:#fff;padding:12px;border-radius:8px;display:inline-block;margin-bottom:14px"></div>
      <div class="form-group" style="margin-bottom:12px">
        <input type="text" value="${url}" readonly onclick="this.select();document.execCommand('copy');toast('Kopiert','success')" style="text-align:center;font-size:12px;cursor:pointer">
      </div>
      <button class="btn btn-sm btn-secondary" onclick="this.closest('div[style]').remove()">Schließen</button>
      <button class="btn btn-sm btn-primary" style="margin-left:8px" onclick="window.open('${url}','_blank')">Öffnen</button>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  setTimeout(() => generateQRInElement('modal-qr', url), 50);
}

function generateQRInElement(elementId, url) {
  const box = document.getElementById(elementId);
  if (!box) return;
  if (typeof QRCode !== 'undefined') {
    new QRCode(box, { text: url, width: 180, height: 180, colorDark: '#000000', colorLight: '#ffffff' });
  } else {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
    script.onload = () => { new QRCode(box, { text: url, width: 180, height: 180, colorDark: '#000000', colorLight: '#ffffff' }); };
    document.head.appendChild(script);
  }
}

async function einlKundeChange() {
  const sel = document.getElementById('einl-kunde');
  localStorage.setItem('einl_last_kunde', sel.value);
  const opt = sel.options[sel.selectedIndex];
  const hint = document.getElementById('einl-format-hint');
  const format = opt.dataset.format;
  const input = document.getElementById('einl-nr');
  if (opt.dataset.prefix === 'EB') {
    hint.textContent = '(6-stellig, nur Ziffern)';
    input.placeholder = '6-stellige EB-Nr. vom Kunden';
    input.maxLength = 6;
    input.pattern = '\\d{6}';
  } else {
    hint.textContent = format ? `(${format})` : '';
    input.placeholder = 'Paletten-Nr. eingeben';
    input.maxLength = 50;
    input.pattern = '';
  }
}

async function showFreiePlaetze() {
  const plaetze = await api('/api/einlagerung/freie-plaetze');
  const box = document.getElementById('freie-plaetze-box');
  box.innerHTML = `<div class="card"><div class="card-header"><h3>${plaetze.length} freie Plätze</h3><button class="btn btn-sm btn-secondary" onclick="this.closest('.card').remove()">Schließen</button></div>
    <p style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Klicke auf einen Platz um ihn zu übernehmen</p>
    <div class="table-wrap"><table><thead><tr><th>Platz</th><th>Regal</th><th>Pos.</th><th>Bereich</th><th>Ebene</th><th>Max. Höhe</th></tr></thead><tbody>
    ${plaetze.map(p => `<tr onclick="document.getElementById('einl-platz').value='${p.bezeichnung}';this.closest('.card').remove()" style="cursor:pointer"><td><strong>${p.bezeichnung}</strong></td><td>${p.regal}</td><td>${p.position}</td><td>${p.bereich}</td><td>${p.ebene}</td><td>${p.max_hoehe_cm ? p.max_hoehe_cm + ' cm' : '—'}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}

async function doEinlagern() {
  const nr = document.getElementById('einl-nr').value.trim();
  const sel = document.getElementById('einl-kunde');
  const opt = sel.options[sel.selectedIndex];

  if (opt.dataset.prefix === 'EB' && !/^\d{6}$/.test(nr)) {
    toast('Panpharma EB-Nummern müssen genau 6-stellig sein (nur Ziffern)', 'error');
    document.getElementById('einl-nr').focus();
    return;
  }

  if (!nr) { toast('Paletten-Nr. eingeben', 'error'); document.getElementById('einl-nr').focus(); return; }

  try {
    const data = await api('/api/einlagerung', { method: 'POST', body: {
      paletten_nr: nr,
      kunde_id: sel.value,
      lagerplatz: document.getElementById('einl-platz').value.trim(),
      artikel_nr: document.getElementById('einl-artikel').value.trim() || null,
      chargen_nr: document.getElementById('einl-charge').value.trim() || null,
      bemerkung: document.getElementById('einl-bemerkung').value.trim() || null
    }});
    toast(data.message, 'success');
    document.getElementById('einl-nr').value = '';
    // Freien Platz aktualisieren
    const freie = await api('/api/einlagerung/freie-plaetze');
    const platzInput = document.getElementById('einl-platz');
    if (freie.length > 0) {
      platzInput.value = freie[0].bezeichnung;
      platzInput.placeholder = freie[0].bezeichnung;
    }
    document.getElementById('einl-nr').focus();
  } catch (e) { toast(e.message, 'error'); document.getElementById('einl-nr').focus(); }
}

// ═══ DIREKTANLIEFERUNG ════════════════════════════════════════════════════════
async function pgDirekteinlagerung() {
  const pc = document.getElementById('page-content');
  const kunden = await api('/api/kunden');

  pc.innerHTML = `
    <div class="page-header"><h1>Direkteinlagerung</h1><span style="color:var(--text-muted);font-size:13px">3 Bewegungen pro Palette (LKW-Entladung + Handling + Einlagerung)</span></div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btn btn-primary btn-sm" id="dtab-neu" onclick="direktTab('neu')">Neue Direkteinlagerung</button>
      <button class="btn btn-secondary btn-sm" id="dtab-liste" onclick="direktTab('liste')">Übersicht</button>
    </div>
    <div id="direkt-tab-neu">
      <div class="card">
        <h3 style="margin-bottom:16px">Neue Direkteinlagerung erstellen</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:14px">Ware kommt per LKW an. EB-Nummern eingeben, QR-Code für Staplerfahrer generieren. Pro Palette werden automatisch 3 Bewegungen gebucht.</p>
        <div class="form-row">
          <div class="form-group">
            <label>Kunde *</label>
            <select id="da-kunde">
              ${kunden.map(k => `<option value="${k.id}" data-prefix="${k.nummern_prefix || ''}">${k.name} (${k.kuerzel || ''})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>LKW-Nr.</label>
            <input type="text" id="da-lkw" placeholder="z.B. 1, 2, 3...">
          </div>
        </div>
        <div class="form-group">
          <label>Paletten-Nummern * <span style="color:var(--text-muted);font-size:11px">(eine pro Zeile)</span></label>
          <textarea id="da-nummern" rows="8" placeholder="645524\n645525\n645526\n..." style="font-family:monospace"></textarea>
        </div>
        <div class="form-group">
          <label>Bemerkung</label>
          <input type="text" id="da-bemerkung" placeholder="Optional">
        </div>
        <div style="margin-bottom:16px;padding:12px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border,#e0e0e0)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <strong style="font-size:13px">Freie Plätze</strong>
            <input type="number" id="da-hoehe" placeholder="Höhe in cm" style="width:120px;padding:6px 10px;font-size:13px">
            <button class="btn btn-sm btn-secondary" onclick="zeigeFreiePlaetzeDirekt()">Anzeigen</button>
            <span id="da-freie-count" style="font-size:12px;color:var(--text-muted)"></span>
          </div>
          <div id="da-freie-liste" style="max-height:200px;overflow-y:auto"></div>
        </div>
        <button class="btn btn-primary btn-lg" onclick="erstelleDirekteinlagerung()">Auftrag erstellen & QR generieren</button>
        <button class="btn btn-lg" onclick="direktWareneingang()" style="background:#e67e22;color:#fff;margin-left:10px">Wareneingang (alle zwischenlagern)</button>
      </div>
      <div id="da-ergebnis"></div>
    </div>
    <div id="direkt-tab-liste" style="display:none">
      <div class="card" id="direkt-liste-box">
        <h3 style="margin-bottom:16px">Direkteinlagerungen</h3>
        <p style="color:var(--text-muted)">Lade...</p>
      </div>
    </div>`;

  loadDirekteinlagerungen();
  // Letzten Kunden vorbelegen
  const lastKunde = localStorage.getItem('direkt_kunde_id');
  if (lastKunde) { const sel = document.getElementById('da-kunde'); if (sel) sel.value = lastKunde; }
}

function direktTab(tab) {
  ['neu', 'liste'].forEach(t => {
    document.getElementById(`direkt-tab-${t}`).style.display = t === tab ? '' : 'none';
    document.getElementById(`dtab-${t}`).className = t === tab ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
  });
}

async function zeigeFreiePlaetzeDirekt() {
  const hoehe = document.getElementById('da-hoehe')?.value?.trim();
  const url = hoehe ? `/api/einlagerung/freie-plaetze?hoehe=${hoehe}` : '/api/einlagerung/freie-plaetze';
  const plaetze = await api(url);
  const box = document.getElementById('da-freie-liste');
  const count = document.getElementById('da-freie-count');
  count.textContent = `${plaetze.length} Plätze gefunden${hoehe ? ` (≥ ${hoehe} cm)` : ''}`;

  if (plaetze.length === 0) {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:12px;margin:0">Keine passenden freien Plätze gefunden.</p>';
    return;
  }

  box.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:4px">${plaetze.map(p => {
    const hLabel = p.max_hoehe_cm ? ` (${p.max_hoehe_cm}cm)` : '';
    const isGang = p.typ === 'Gang';
    return `<span style="display:inline-block;padding:5px 9px;background:${isGang ? '#e67e22' : 'var(--success,#2ecc71)'};color:#fff;border-radius:5px;font-size:12px;font-weight:600;cursor:default" title="${p.bereich} ${p.ebene || ''}${hLabel}">${p.bezeichnung}${hLabel}</span>`;
  }).join('')}</div>`;
}

async function erstelleDirekteinlagerung() {
  const sel = document.getElementById('da-kunde');
  const kundeId = sel.value;
  localStorage.setItem('direkt_kunde_id', kundeId);
  const prefix = sel.options[sel.selectedIndex]?.dataset?.prefix;
  const lkwNr = document.getElementById('da-lkw').value.trim();
  const text = document.getElementById('da-nummern').value.trim();
  const bemerkung = document.getElementById('da-bemerkung').value.trim();

  if (!text) { toast('Bitte Paletten-Nummern eingeben', 'error'); return; }

  const nummern = text.split(/[\n,;]+/).map(n => n.trim()).filter(n => n.length > 0);
  if (nummern.length === 0) { toast('Keine gültigen Nummern', 'error'); return; }

  if (prefix === 'EB') {
    const ungueltig = nummern.filter(n => !/^\d{6}$/.test(n));
    if (ungueltig.length > 0) {
      toast(`Panpharma: EB-Nummern müssen 6-stellig sein. Ungültig: ${ungueltig.slice(0, 5).join(', ')}${ungueltig.length > 5 ? '...' : ''}`, 'error');
      return;
    }
  }

  try {
    const data = await api('/api/auftraege', { method: 'POST', body: {
      kunde_id: kundeId,
      typ: 'direktanlieferung',
      lkw_nr: lkwNr || null,
      positionen: nummern.map(nr => ({ paletten_nr: nr })),
      bemerkung: bemerkung || null
    }});

    document.getElementById('da-ergebnis').innerHTML = `
      <div class="card" style="margin-top:16px;border:2px solid var(--success)">
        <h3 style="color:var(--success);margin-bottom:12px">✓ Direkteinlagerung erstellt — ${data.positionen} Paletten (${data.positionen * 3} Bewegungen)</h3>
        ${data.direkt_id ? `<p style="margin-bottom:8px"><strong>ID:</strong> ${data.direkt_id}</p>` : ''}
        <p style="margin-bottom:14px;font-size:13px;color:var(--text-muted)">Der Staplerfahrer scannt den QR-Code und trägt die Lagerplätze ein:</p>
        <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
          <div id="da-qr-box" style="background:#fff;padding:12px;border-radius:8px;display:inline-block"></div>
          <div style="flex:1;min-width:200px">
            <div class="form-group">
              <label>Link für Staplerfahrer</label>
              <input type="text" value="${data.url}" readonly onclick="this.select();document.execCommand('copy');toast('Link kopiert','success')" style="font-size:13px;cursor:pointer">
            </div>
            <p style="font-size:11px;color:var(--text-muted);margin-top:8px">Klick auf den Link kopiert ihn. Pro Palette: LKW-Entladung + Handling + Einlagerung.</p>
            <button class="btn btn-sm btn-secondary" style="margin-top:10px" onclick="window.open('${data.url}','_blank')">Seite öffnen</button>
            <button class="btn btn-sm btn-secondary" style="margin-top:10px;margin-left:6px" onclick="druckeQRDirekt()">QR drucken</button>
            <a class="btn btn-sm btn-primary" style="margin-top:10px;margin-left:6px" href="/api/berichte/einlagerungsbeleg/${data.id}" target="_blank">Einlagerungsbeleg PDF</a>
          </div>
        </div>
      </div>`;

    generateQRInElement('da-qr-box', data.url);
    document.getElementById('da-nummern').value = '';
    loadDirekteinlagerungen();
  } catch (e) { toast(e.message, 'error'); }
}

async function direktWareneingang() {
  const sel = document.getElementById('da-kunde');
  const kundeId = sel.value;
  localStorage.setItem('direkt_kunde_id', kundeId);
  const prefix = sel.options[sel.selectedIndex]?.dataset?.prefix;
  const lkwNr = document.getElementById('da-lkw').value.trim();
  const text = document.getElementById('da-nummern').value.trim();
  const bemerkung = document.getElementById('da-bemerkung').value.trim();

  if (!text) { toast('Bitte Paletten-Nummern eingeben', 'error'); return; }

  const nummern = text.split(/[\n,;]+/).map(n => n.trim()).filter(n => n.length > 0);
  if (nummern.length === 0) { toast('Keine gültigen Nummern', 'error'); return; }

  if (prefix === 'EB') {
    const ungueltig = nummern.filter(n => !/^\d{6}$/.test(n));
    if (ungueltig.length > 0) {
      toast(`Panpharma: EB-Nummern müssen 6-stellig sein. Ungültig: ${ungueltig.slice(0, 5).join(', ')}${ungueltig.length > 5 ? '...' : ''}`, 'error');
      return;
    }
  }

  if (!confirm(`${nummern.length} Paletten direkt in den Wareneingang buchen?\n\nPro Palette werden 3 Bewegungen erzeugt.`)) return;

  try {
    // 1. Auftrag erstellen
    const data = await api('/api/auftraege', { method: 'POST', body: {
      kunde_id: kundeId,
      typ: 'direktanlieferung',
      lkw_nr: lkwNr || null,
      positionen: nummern.map(nr => ({ paletten_nr: nr })),
      bemerkung: bemerkung || null
    }});

    // 2. Sofort zwischenlagern
    const zw = await api(`/api/auftraege/${data.token}/zwischenlagern`, { method: 'POST' });

    document.getElementById('da-ergebnis').innerHTML = `
      <div class="card" style="margin-top:16px;border:2px solid var(--success)">
        <h3 style="color:var(--success);margin-bottom:8px">✓ ${zw.count} Paletten im Wareneingang</h3>
        <p style="font-size:13px;color:var(--text-muted)">${zw.count * 3} Bewegungen gebucht (3 pro Palette).${data.direkt_id ? ' ID: ' + data.direkt_id : ''}</p>
        <p style="font-size:12px;color:var(--text-muted);margin-top:8px">Die Paletten können über <strong>Umlagerung</strong> auf ihre endgültigen Plätze verschoben werden.</p>
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn btn-primary" href="/api/berichte/einlagerungsbeleg/${data.id}" target="_blank">Wareneingangsbeleg PDF</a>
        </div>
      </div>`;

    document.getElementById('da-nummern').value = '';
    loadDirekteinlagerungen();
  } catch (e) { toast(e.message, 'error'); }
}

function druckeQRDirekt() {
  const qr = document.getElementById('da-qr-box');
  if (!qr) return;
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>QR-Code Direkteinlagerung</title><style>body{text-align:center;padding:40px;font-family:sans-serif}img{width:250px;height:250px}</style></head><body><h2>Direkteinlagerung</h2><p>QR-Code scannen — 3 Bewegungen pro Palette:</p>${qr.innerHTML}<script>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  win.document.close();
}

async function loadDirekteinlagerungen() {
  const box = document.getElementById('direkt-liste-box');
  if (!box) return;
  try {
    const liste = await api('/api/direktanlieferung');
    if (liste.length === 0) {
      box.innerHTML = `<h3 style="margin-bottom:16px">Direkteinlagerungen</h3><p style="color:var(--text-muted)">Noch keine Direkteinlagerungen erstellt.</p>`;
      return;
    }
    box.innerHTML = `
      <h3 style="margin-bottom:16px">Direkteinlagerungen (${liste.length})</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>ID</th><th>Kunde</th><th>LKW</th><th>Erstellt</th><th>Fortschritt</th><th>Bew.</th><th>Status</th><th>QR</th><th>Beleg</th></tr></thead>
        <tbody>${liste.map(a => `
          <tr>
            <td>${a.id}</td>
            <td><strong>${a.direkt_id || '—'}</strong></td>
            <td>${a.kunde_name || '—'}</td>
            <td>${a.lkw_nr || '—'}</td>
            <td>${a.erstellt_am ? a.erstellt_am.substring(0, 16).replace('T', ' ') : '—'}</td>
            <td><strong>${a.erledigt}/${a.gesamt}</strong></td>
            <td>${a.erledigt * 3}/${a.gesamt * 3}</td>
            <td><span class="badge ${a.status === 'abgeschlossen' ? 'badge-success' : a.status === 'in_arbeit' ? 'badge-warning' : 'badge-info'}">${a.status}</span></td>
            <td><button class="btn btn-sm btn-secondary" onclick="zeigeAuftragQR('${a.token}')">QR</button></td>
            <td><a class="btn btn-sm btn-primary" href="/api/berichte/einlagerungsbeleg/${a.id}" target="_blank">PDF</a></td>
          </tr>
        `).join('')}</tbody>
      </table></div>`;
  } catch (e) { box.innerHTML = `<h3>Direkteinlagerungen</h3><p style="color:var(--danger)">${e.message}</p>`; }
}

// ═══ AUSLAGERUNG ═════════════════════════════════════════════════════════════
function pgAuslagerung() {
  const pc = document.getElementById('page-content');
  pc.innerHTML = `
    <div class="page-header"><h1>Direktauslagerung</h1><p style="font-size:12px;color:var(--text-muted)">Verladung auf Fremd-LKW</p></div>
    <div class="card">
      <h3 style="margin-bottom:16px">Auslagerung</h3>
      <div class="form-row">
        <div class="form-group" style="flex:2">
          <label>Paletten-Nr. (mehrere Nummern per Zeilenumbruch möglich)</label>
          <textarea id="ausl-nr" rows="3" placeholder="EB- oder KW-Nummern einfügen (eine pro Zeile)" style="width:100%;padding:10px;font-size:14px;font-family:monospace;border:1px solid #ddd;border-radius:6px;resize:vertical"></textarea>
        </div>
        <div class="form-group">
          <label>Bemerkung</label>
          <input type="text" id="ausl-bem" placeholder="Optional">
        </div>
      </div>
      <button class="btn btn-primary" onclick="doAuslagern()">Auslagern</button>
      <div id="ausl-result" style="margin-top:16px"></div>
    </div>`;
}

async function doAuslagern() {
  const raw = document.getElementById('ausl-nr').value.trim();
  if (!raw) { toast('Paletten-Nr. eingeben', 'error'); return; }
  
  const nummern = raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  if (nummern.length === 0) { toast('Keine gültigen Nummern', 'error'); return; }
  
  const bemerkung = document.getElementById('ausl-bem').value.trim();
  
  if (nummern.length === 1) {
    if (!confirm(`Palette "${nummern[0]}" wirklich auslagern?`)) return;
    try {
      const data = await api('/api/auslagerung', { method: 'POST', body: { paletten_nr: nummern[0], bemerkung } });
      document.getElementById('ausl-result').innerHTML = `
        <div style="background:var(--success-bg, #d4edda);border:1px solid var(--success, #28a745);padding:14px 18px;border-radius:8px">
          <strong style="color:var(--success, #28a745)">✓ Auslagerung erfolgreich</strong>
          <p style="margin:8px 0 0;font-size:13px">${data.message}</p>
          <button class="btn btn-sm btn-primary" style="margin-top:10px" onclick="window.open('/api/berichte/auslagerungsbeleg/${nummern[0]}','_blank')">PDF-Beleg öffnen</button>
        </div>`;
      document.getElementById('ausl-nr').value = '';
      document.getElementById('ausl-bem').value = '';
    } catch (e) { toast(e.message, 'error'); }
  } else {
    if (!confirm(`${nummern.length} Paletten auslagern?\n\n${nummern.join(', ')}`)) return;
    let erfolg = [];
    let fehler = [];
    for (const nr of nummern) {
      try {
        await api('/api/auslagerung', { method: 'POST', body: { paletten_nr: nr, bemerkung } });
        erfolg.push(nr);
      } catch (e) {
        fehler.push({ nr, msg: e.message });
      }
    }
    let html = '';
    if (erfolg.length > 0) {
      html += `<div style="background:var(--success-bg, #d4edda);border:1px solid var(--success, #28a745);padding:14px 18px;border-radius:8px;margin-bottom:10px">
        <strong style="color:var(--success, #28a745)">✓ ${erfolg.length} Palette(n) erfolgreich ausgelagert</strong>
        <p style="margin:6px 0 0;font-size:13px;font-family:monospace">${erfolg.join(', ')}</p>
        <button class="btn btn-sm btn-primary" style="margin-top:12px" onclick="openSammelbeleg(${JSON.stringify(erfolg).replace(/"/g,'&quot;')})">PDF-Sammelbeleg öffnen (${erfolg.length} Pal.)</button>
      </div>`;
    }
    if (fehler.length > 0) {
      html += `<div style="background:#fdecea;border:1px solid #e74c3c;padding:14px 18px;border-radius:8px">
        <strong style="color:#e74c3c">✗ ${fehler.length} Fehler</strong>
        ${fehler.map(f => `<p style="margin:4px 0 0;font-size:13px"><code>${f.nr}</code>: ${f.msg}</p>`).join('')}
      </div>`;
    }
    document.getElementById('ausl-result').innerHTML = html;
    document.getElementById('ausl-nr').value = '';
    // Automatisch PDF öffnen
    if (erfolg.length > 0) openSammelbeleg(erfolg);
    document.getElementById('ausl-bem').value = '';
  }
}

function openSammelbeleg(nummern) {
  fetch('/api/berichte/sammelbeleg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paletten_nummern: nummern })
  }).then(r => r.blob()).then(blob => {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }).catch(e => toast('PDF-Fehler: ' + e.message, 'error'));
}

// ═══ PICKLISTE ═══════════════════════════════════════════════════════════════
async function pgPickliste() {
  const pc = document.getElementById('page-content');
  const aktuell = await api('/api/pickliste/aktuell');
  
  const gepickt = aktuell.filter(i => i.abgehakt);
  const offen = aktuell.filter(i => !i.abgehakt);
  
  pc.innerHTML = `
    <div class="page-header"><h1>Abruf / Pickliste</h1><div class="actions"><button class="btn btn-primary" onclick="showNeuePickliste()">Neuer Abruf</button></div></div>
    ${aktuell.length > 0 ? `
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <span style="font-size:13px"><strong>${gepickt.length}</strong> / ${aktuell.length} gepickt</span>
        <div class="progress-bar" style="flex:1;min-width:120px"><div class="fill ${gepickt.length === aktuell.length ? 'green' : 'yellow'}" style="width:${Math.round(gepickt.length/aktuell.length*100)}%"></div></div>
        ${gepickt.length > 0 ? `<button class="btn btn-sm btn-success" onclick="picklisteAbschliessen()">Gepickte auslagern + Lieferschein (${gepickt.length} Pal.)</button>` : ''}
        <button class="btn btn-sm btn-secondary" onclick="picklisteQR()">QR für Staplerfahrer</button>
      </div>
    </div>` : ''}
    <div class="tabs">
      <button class="active" onclick="showPickTab('tablet')">Tablet-Ansicht</button>
      <button onclick="showPickTab('liste')">Listenansicht</button>
    </div>
    <div id="pick-content">
      ${aktuell.length === 0 ? '<p style="color:var(--text-muted);padding:20px">Keine aktive Pickliste vorhanden. Klicke "Neuer Abruf" um eine Liste zu importieren.</p>' :
      aktuell.map(item => `
        <div class="picklist-item ${item.abgehakt ? 'done' : ''} ${item.bereits_ausgelagert ? 'already-out' : ''}" data-nr="${item.paletten_nr}">
          <div class="check" ${item.bereits_ausgelagert ? 'style="background:#fee;color:#c00;pointer-events:none"' : `onclick="togglePickItem(this, '${item.abruf_id}', '${item.paletten_nr}')"`}>${item.bereits_ausgelagert ? '✗' : (item.abgehakt ? '✓' : '')}</div>
          <div class="nr">${item.paletten_nr}</div>
          <div class="platz">${item.bereits_ausgelagert ? '<span style="color:var(--danger);font-size:11px">Bereits ausgelagert</span>' : (item.aktueller_platz || item.lagerplatz || '?')}</div>
          <div class="info">Pos. ${item.lfd_nummer}</div>
        </div>
      `).join('')}
    </div>
    <div id="pick-liste-content" style="display:none">
      ${aktuell.length === 0 ? '' : `
      <div class="card">
        <div class="table-wrap"><table><thead><tr><th>Pos.</th><th>Pal.-Nr.</th><th>Lagerplatz</th><th>Status</th></tr></thead><tbody>
          ${aktuell.map(item => `<tr style="${item.abgehakt ? 'background:#e8f8f0' : ''} ${item.bereits_ausgelagert ? 'opacity:0.5;background:#fee' : ''}">
            <td>${item.lfd_nummer}</td>
            <td><strong>${item.paletten_nr}</strong></td>
            <td>${item.bereits_ausgelagert ? '<span style="color:var(--danger)">Bereits ausgelagert</span>' : (item.aktueller_platz || item.lagerplatz || '?')}</td>
            <td>${item.bereits_ausgelagert ? '<span class="badge badge-danger">Ausgelagert</span>' : (item.abgehakt ? '<span class="badge badge-success">Gepickt</span>' : '<span class="badge badge-warning">Offen</span>')}</td>
          </tr>`).join('')}
        </tbody></table></div>
      </div>`}
    </div>`;
}

function showPickTab(tab) {
  document.getElementById('pick-content').style.display = tab === 'tablet' ? '' : 'none';
  document.getElementById('pick-liste-content').style.display = tab === 'liste' ? '' : 'none';
  document.querySelectorAll('.tabs button').forEach((b, i) => {
    b.className = (i === 0 && tab === 'tablet') || (i === 1 && tab === 'liste') ? 'active' : '';
  });
}

async function togglePickItem(el, abrufId, nr) {
  const item = el.closest('.picklist-item');
  const done = !item.classList.contains('done');
  item.classList.toggle('done');
  el.textContent = done ? '✓' : '';
  await api('/api/pickliste/abhaken', { method: 'POST', body: { abruf_id: abrufId, paletten_nr: nr, abgehakt: done } });
  updatePickCounter();
}

function updatePickCounter() {
  const alle = document.querySelectorAll('.picklist-item');
  const gepickt = document.querySelectorAll('.picklist-item.done');
  const total = alle.length;
  const done = gepickt.length;
  const bar = document.querySelector('.card .progress-bar .fill');
  const counter = document.querySelector('.card span[style*="font-size:13px"]');
  if (counter) counter.innerHTML = `<strong>${done}</strong> / ${total} gepickt`;
  if (bar) { bar.style.width = Math.round(done/total*100)+'%'; bar.className = `fill ${done===total?'green':'yellow'}`; }
  const actionsDiv = counter?.closest('div');
  if (!actionsDiv) return;
  const existingBtn = actionsDiv.querySelector('.btn-success');
  if (done > 0 && !existingBtn) {
    const qrBtn = actionsDiv.querySelector('.btn-secondary');
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-success';
    btn.onclick = picklisteAbschliessen;
    btn.textContent = `Gepickte auslagern + Lieferschein (${done} Pal.)`;
    actionsDiv.insertBefore(btn, qrBtn);
  } else if (done > 0 && existingBtn) {
    existingBtn.textContent = `Gepickte auslagern + Lieferschein (${done} Pal.)`;
  } else if (done === 0 && existingBtn) {
    existingBtn.remove();
  }
}

async function picklisteQR() {
  const aktuell = await api('/api/pickliste/aktuell');
  const offen = aktuell.filter(i => !i.abgehakt);
  if (offen.length === 0) { toast('Alle Paletten bereits gepickt', 'error'); return; }
  
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const url = `${window.location.origin}/api/pickliste/stapler-link`;
  overlay.innerHTML = `
    <div class="modal">
      <h2>QR-Code für Staplerfahrer</h2>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">${offen.length} Paletten zum Picken. Staplerfahrer scannt und arbeitet die Liste ab.</p>
      <div id="pick-qr-code" style="text-align:center;margin:20px 0"></div>
      <p style="text-align:center;font-size:11px;word-break:break-all;color:var(--text-muted)"><a href="${url}" target="_blank">${url}</a></p>
      <div class="modal-actions"><button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Schließen</button></div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof QRCode !== 'undefined') new QRCode(document.getElementById('pick-qr-code'), { text: url, width: 200, height: 200 });
}

async function picklisteAbschliessen() {
  const aktuell = await api('/api/pickliste/aktuell');
  const gepickt = aktuell.filter(i => i.abgehakt);
  if (gepickt.length === 0) { toast('Keine Paletten gepickt', 'error'); return; }
  
  const lkwKap = 17;
  const lkwAnzahl = Math.ceil(gepickt.length / lkwKap);
  
  if (!confirm(`${gepickt.length} Paletten auslagern und ${lkwAnzahl} Lieferschein${lkwAnzahl > 1 ? 'e' : ''} generieren?`)) return;
  
  try {
    const data = await api('/api/pickliste/abschliessen', { method: 'POST', body: { lkw_kapazitaet: lkwKap } });
    toast(`${data.ausgelagert} Paletten ausgelagert, ${data.lieferscheine} Lieferschein(e) erstellt`, 'success');
    if (data.pdf_urls && data.pdf_urls.length > 0) {
      data.pdf_urls.forEach((url, i) => {
        setTimeout(() => window.open(url, '_blank'), i * 500);
      });
    }
    pgPickliste();
  } catch (e) { toast(e.message, 'error'); }
}

function showNeuePickliste() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:600px">
      <h2>Neuer Abruf — Liste importieren</h2>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Paletten-Nummern einfügen (eine pro Zeile, z.B. vom Kunden per Mail). Leere Zeilen werden ignoriert.</p>
      <div class="form-group">
        <label>Paletten-Nummern (eine pro Zeile)</label>
        <textarea id="pick-nummern" rows="10" placeholder="645524&#10;645525&#10;645526&#10;652654&#10;652655" style="font-family:monospace"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Abruf-ID</label><input type="text" id="pick-abruf" placeholder="z.B. 2026/149-1"></div>
        <div class="form-group"><label>LKW-Kapazität</label><input type="number" id="pick-kap" value="17"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Abbrechen</button>
        <button class="btn btn-primary" onclick="erstellePickliste()">Abruf erstellen</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function erstellePickliste() {
  const nummern = document.getElementById('pick-nummern').value.split('\n').map(l => l.trim()).filter(Boolean);
  const abruf = document.getElementById('pick-abruf').value.trim();
  const kap = parseInt(document.getElementById('pick-kap').value) || 17;

  if (nummern.length === 0) { toast('Keine Nummern eingegeben', 'error'); return; }

  try {
    const data = await api('/api/pickliste/erstellen', { method: 'POST', body: { paletten_nummern: nummern, abruf_id: abruf, lkw_split: kap } });
    document.querySelector('.modal-overlay')?.remove();
    toast(`Pickliste erstellt: ${data.gesamt} Paletten auf ${data.lkw_anzahl} LKW`, 'success');
    pgPickliste();
  } catch (e) { toast(e.message, 'error'); }
}

function renderAbrufErgebnis(data) {
  const pc = document.getElementById('pick-content');
  const nichtGefunden = data.items.filter(i => !i.gefunden);
  const gefunden = data.items.filter(i => i.gefunden);
  
  let html = `
    <div class="card">
      <div class="card-header">
        <h3>Abruf${data.abruf_id ? ' ' + data.abruf_id : ''}: ${data.gesamt} Paletten · ${data.lkw_anzahl} LKW</h3>
        <div class="actions">
          <button class="btn btn-sm btn-primary" onclick="abrufPDF()">PDF Pickliste</button>
          <button class="btn btn-sm btn-success" onclick="abrufDurchfuehren()">Abruf ausführen</button>
        </div>
      </div>
      ${nichtGefunden.length > 0 ? `<div style="background:#fdecea;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:12px"><strong>${nichtGefunden.length} nicht gefunden:</strong> ${nichtGefunden.map(i => i.paletten_nr).join(', ')}</div>` : ''}
    </div>
    <div class="card">
      <div class="card-header"><h3>Detaillierte Aufschlüsselung</h3></div>
      <div class="table-wrap"><table><thead><tr>
        <th>Nr.</th><th>Pal.-Nr.</th><th>Lagerplatz</th><th>Bereich</th><th>LKW</th>
      </tr></thead><tbody>`;
  
  let lastLkw = '';
  for (const item of data.items) {
    if (item.lkw !== lastLkw) {
      html += `<tr style="background:#f8f9fa"><td colspan="5" style="font-weight:600;color:var(--info);padding:8px 12px">${item.lkw} (max. ${data.lkw_kapazitaet} Pal.)</td></tr>`;
      lastLkw = item.lkw;
    }
    html += `<tr${!item.gefunden ? ' style="background:#fdecea"' : ''}>
      <td>${item.lfd}</td>
      <td><strong>${item.paletten_nr}</strong></td>
      <td>${item.gefunden ? `<span style="color:var(--info);font-weight:500">${item.lagerplatz}</span>` : '<span style="color:var(--danger)">NICHT GEFUNDEN</span>'}</td>
      <td>${item.bereich !== '?' ? item.bereich : ''}</td>
      <td>${item.lkw}</td>
    </tr>`;
  }
  
  html += `</tbody></table></div>
    </div>
    <div class="card">
      <div class="card-header"><h3>Zusammenfassung</h3></div>
      <table style="width:100%;font-size:13px">
        <tr><td>Paletten gesamt</td><td><strong>${data.gesamt}</strong></td></tr>
        <tr><td>Gefunden / zuordenbar</td><td>${gefunden.length}</td></tr>
        <tr><td>Nicht gefunden</td><td style="color:var(--danger)">${nichtGefunden.length}</td></tr>
        <tr><td>LKW benötigt</td><td>${data.lkw_anzahl} (à ${data.lkw_kapazitaet} Pal.)</td></tr>
        <tr><td>Auslagerungen (Abrechnung)</td><td><strong>${gefunden.length}</strong></td></tr>
      </table>
      <p style="font-size:11px;color:var(--text-muted);margin-top:12px">
        Musterzüge separat über den eigenen Workflow buchen (Dashboard → Musterzug).
      </p>
    </div>`;
  
  pc.innerHTML = html;
}

async function abrufPDF() {
  if (!window._lastPickliste) return;
  // PDF über neues Fenster mit POST
  const form = document.createElement('form');
  form.method = 'POST'; form.action = '/api/pickliste/pdf'; form.target = '_blank';
  form.innerHTML = `<input type="hidden" name="items" value='${JSON.stringify(window._lastPickliste.items)}'>
    <input type="hidden" name="abruf_id" value="${window._lastPickliste.abruf_id || ''}">
    <input type="hidden" name="kunde_name" value="Panpharma">`;
  document.body.appendChild(form); form.submit(); form.remove();
}

async function abrufDurchfuehren() {
  if (!window._lastPickliste) return;
  const items = window._lastPickliste.items.filter(i => i.gefunden);
  if (items.length === 0) { toast('Keine Paletten zum Auslagern', 'error'); return; }
  
  if (!confirm(`${items.length} Paletten auslagern?`)) return;
  
  try {
    const data = await api('/api/pickliste/ausfuehren', { method: 'POST', body: {
      paletten_nummern: items.map(i => i.paletten_nr),
      abruf_id: window._lastPickliste.abruf_id
    }});
    toast(`Abruf abgeschlossen: ${data.ausgelagert} Paletten ausgelagert`, 'success');
    pgPickliste();
  } catch (e) { toast(e.message, 'error'); }
}

// ═══ MUSTERUNG ═══════════════════════════════════════════════════════════════
async function pgMusterung() {
  const pc = document.getElementById('page-content');
  const muster = await api('/api/musterung');
  
  pc.innerHTML = `
    <div class="page-header"><h1>Musterzug</h1></div>
    <div class="card">
      <h3 style="margin-bottom:16px">Neuen Musterzug durchführen</h3>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px">
        Trays werden aus der Palette entnommen. Bewegungen: <strong>Anzahl Trays + 2</strong><br>
        1× Auslagerung (raus) → N× Tray-Entnahme → 1× Rücklagerung (rein)<br>
        <em>1 Tray = 3, 2 Trays = 4, 3 Trays = 5 Bewegungen usw.</em>
      </p>
      <div class="form-row-3">
        <div class="form-group"><label>Paletten-Nr. *</label><input type="text" id="must-nr" placeholder="EB/KW-Nr."></div>
        <div class="form-group"><label>Anzahl Trays *</label><input type="number" id="must-menge" value="1" min="1" max="20" onchange="updateMustBew()" oninput="updateMustBew()"></div>
        <div class="form-group"><label>Bemerkung</label><input type="text" id="must-bem" placeholder="Optional"></div>
      </div>
      <div style="margin-bottom:14px;font-size:13px;color:var(--primary)" id="must-info">→ 3 Bewegungen werden gebucht</div>
      <button class="btn btn-primary" onclick="doMusterung()" style="background:#8e44ad">Musterzug buchen</button>
    </div>
    <div class="card">
      <div class="card-header"><h3>Bisherige Musterzüge (${muster.length})</h3></div>
      <div class="table-wrap"><table><thead><tr><th>Nr.</th><th>Pal.-Nr.</th><th>Lagerplatz</th><th>Trays</th><th>Bew.</th><th>Kunde</th><th>Benutzer</th><th>Datum</th></tr></thead><tbody>
        ${muster.map(m => `<tr><td>${m.lfd_nummer}</td><td><strong>${m.paletten_nr}</strong></td><td>${m.lagerplatz || '—'}</td><td>${m.menge}</td><td>${m.handling_gebuehr || 3}</td><td>${m.kunde_name || '—'}</td><td>${m.benutzer || '—'}</td><td>${m.datum ? new Date(m.datum).toLocaleString('de-DE') : '—'}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
}

function updateMustBew() {
  const trays = parseInt(document.getElementById('must-menge').value) || 1;
  document.getElementById('must-info').textContent = `→ ${trays + 2} Bewegungen werden gebucht (1× raus + ${trays}× Tray + 1× rein)`;
}

async function doMusterung() {
  try {
    const trays = parseInt(document.getElementById('must-menge').value) || 1;
    const data = await api('/api/musterung', { method: 'POST', body: { paletten_nr: document.getElementById('must-nr').value.trim(), menge: trays, bemerkung: document.getElementById('must-bem').value.trim() } });
    toast(data.message, 'success');
    pgMusterung();
  } catch (e) { toast(e.message, 'error'); }
}

// ═══ UMLAGERUNG ══════════════════════════════════════════════════════════════
async function pgUmlagerung() {
  const pc = document.getElementById('page-content');
  const umlagerungen = await api('/api/umlagerung');
  const wareneingang = await api('/api/paletten?platz=Wareneingang');

  pc.innerHTML = `
    <div class="page-header"><h1>Umlagerung</h1></div>
    ${wareneingang.length > 0 ? `
    <div class="card" style="border-left:4px solid #e67e22;margin-bottom:16px">
      <div class="card-header">
        <h3>Wareneingang — ${wareneingang.length} Paletten warten auf Einlagerung</h3>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-primary" onclick="warenEingangQR()">QR für Staplerfahrer</button>
        </div>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Paletten auswählen und gemeinsam auf einen Platz verschieben, oder einzeln umlagern.</p>
      <div style="margin-bottom:10px;padding:10px;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px solid var(--border,#e0e0e0)">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label style="font-size:13px;font-weight:600"><input type="checkbox" id="we-select-all" onchange="weSelectAll(this.checked)"> Alle</label>
          <span id="we-selected-count" style="font-size:12px;color:var(--text-muted)">0 ausgewählt</span>
          <input type="number" id="we-hoehe-filter" placeholder="Höhe (cm)" style="width:100px;padding:5px 8px;font-size:13px">
          <button class="btn btn-sm btn-secondary" onclick="weZeigeFreie()">Freie Plätze</button>
          <input type="text" id="we-bulk-platz" placeholder="Ziel-Platz..." style="width:130px;padding:5px 8px;font-size:13px">
          <button class="btn btn-sm btn-primary" onclick="weBulkUmlagern()">Ausgewählte umlagern</button>
        </div>
        <div id="we-freie-box" style="margin-top:8px;max-height:150px;overflow-y:auto"></div>
        <div id="we-block-hint" style="margin-top:6px;display:none;font-size:12px;color:#e67e22;font-weight:600"></div>
      </div>
      <div class="table-wrap" style="max-height:400px;overflow-y:auto"><table><thead><tr><th style="width:30px"></th><th>Pal.-Nr.</th><th>Kunde</th><th>Neuer Platz</th><th></th></tr></thead><tbody>
        ${wareneingang.sort((a,b) => a.paletten_nr.localeCompare(b.paletten_nr)).map(p => `<tr>
          <td><input type="checkbox" class="we-cb" data-nr="${p.paletten_nr}" data-id="${p.id}" onchange="weCheckChanged()"></td>
          <td><strong>${p.paletten_nr}</strong></td>
          <td>${p.kunde_name || '—'}</td>
          <td><input type="text" id="we-platz-${p.id}" placeholder="z.B. A42, XB..." style="width:100px;padding:4px 8px;font-size:13px"></td>
          <td><button class="btn btn-sm btn-secondary" onclick="umlagerungAusWareneingang(${p.id},'${p.paletten_nr}')">Umlagern</button></td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>` : ''}
    <div class="card">
      <h3 style="margin-bottom:16px">Palette umlagern (Lagerverdichtung)</h3>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px">
        Umlagerungen dienen der Lagerverdichtung. Sie werden dokumentiert (für Nachvollziehbarkeit),
        aber <strong>nicht als abrechenbare Bewegung</strong> gezählt.
      </p>
      <div class="form-row-3">
        <div class="form-group"><label>Paletten-Nr. *</label><input type="text" id="uml-nr" placeholder="EB/KW-Nr."></div>
        <div class="form-group"><label>Neuer Platz *</label><input type="text" id="uml-platz" placeholder="z.B. A42"></div>
        <div class="form-group"><label>Bemerkung</label><input type="text" id="uml-bem" placeholder="Optional"></div>
      </div>
      <button class="btn btn-secondary btn-lg" onclick="doUmlagerung()">⇄ Umlagern</button>
    </div>
    <div class="card">
      <div class="card-header"><h3>Letzte Umlagerungen (${umlagerungen.length})</h3></div>
      <div class="table-wrap"><table><thead><tr><th>Pal.-Nr.</th><th>Von</th><th>Nach</th><th>Benutzer</th><th>Datum</th><th>Bemerkung</th></tr></thead><tbody>
        ${umlagerungen.map(u => `<tr><td><strong>${u.paletten_nr}</strong></td><td>${u.von_platz}</td><td><span style="color:var(--success)">${u.nach_platz}</span></td><td>${u.benutzer || '—'}</td><td>${u.datum ? new Date(u.datum).toLocaleString('de-DE') : '—'}</td><td>${u.bemerkung || ''}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
}

function weSelectAll(checked) {
  document.querySelectorAll('.we-cb').forEach(cb => cb.checked = checked);
  weCheckChanged();
}

function weCheckChanged() {
  const checked = document.querySelectorAll('.we-cb:checked');
  const count = checked.length;
  document.getElementById('we-selected-count').textContent = `${count} ausgewählt`;
  const hint = document.getElementById('we-block-hint');
  if (count > 0) {
    hint.style.display = 'block';
    let html = '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">';
    if (count > 3) {
      html += `<span style="font-size:12px;font-weight:600;color:#e67e22">Blöcke:</span>`;
      html += ['BlockE','BlockF'].map(b =>
        `<button class="btn btn-sm" onclick="document.getElementById('we-bulk-platz').value='${b}'" style="background:#e67e22;color:#fff;padding:4px 12px;font-size:12px;border-radius:4px;cursor:pointer">${b}</button>`
      ).join('');
      html += `<span style="margin-left:10px;font-size:12px;font-weight:600;color:#aaa">Gänge:</span>`;
    } else {
      html += `<span style="font-size:12px;font-weight:600;color:#aaa">Schnellauswahl:</span>`;
      html += ['BlockE','BlockF'].map(b =>
        `<button class="btn btn-sm" onclick="document.getElementById('we-bulk-platz').value='${b}'" style="background:#e67e22;color:#fff;padding:4px 12px;font-size:12px;border-radius:4px;cursor:pointer">${b}</button>`
      ).join('');
      html += `<span style="margin-left:10px;font-size:12px;color:#aaa">|</span>`;
    }
    html += ['XA','XB','XC','XD','XE1','XE2','XF1','XF2'].map(g =>
      `<button class="btn btn-sm" onclick="document.getElementById('we-bulk-platz').value='${g}'" style="background:#6c757d;color:#fff;padding:4px 10px;font-size:11px;border-radius:4px;cursor:pointer">${g}</button>`
    ).join('');
    html += '</div>';
    hint.innerHTML = html;
  } else {
    hint.style.display = 'none';
  }
}

async function weZeigeFreie() {
  const hoehe = document.getElementById('we-hoehe-filter')?.value?.trim();
  const url = hoehe ? `/api/einlagerung/freie-plaetze?hoehe=${hoehe}` : '/api/einlagerung/freie-plaetze';
  const plaetze = await api(url);
  const box = document.getElementById('we-freie-box');
  const checked = document.querySelectorAll('.we-cb:checked').length;

  // Bei >3 ausgewählt: Gang-Plätze zuerst hervorheben
  let sorted = plaetze;
  if (checked > 3) {
    sorted = [...plaetze.filter(p => p.typ === 'Gang'), ...plaetze.filter(p => p.typ !== 'Gang')];
  }

  box.innerHTML = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">${sorted.length} Plätze${hoehe ? ` (≥ ${hoehe} cm)` : ''} — Klick übernimmt</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">${sorted.map(p => {
    const hLabel = p.max_hoehe_cm ? ` ${p.max_hoehe_cm}cm` : '';
    const isGang = p.typ === 'Gang';
    return `<span onclick="document.getElementById('we-bulk-platz').value='${p.bezeichnung}'" style="display:inline-block;padding:4px 8px;background:${isGang ? '#e67e22' : 'var(--success,#2ecc71)'};color:#fff;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer" title="${p.bereich}${hLabel}">${p.bezeichnung}${hLabel}</span>`;
  }).join('')}</div>`;
}

async function weBulkUmlagern() {
  const checked = [...document.querySelectorAll('.we-cb:checked')];
  if (checked.length === 0) { toast('Bitte Paletten auswählen', 'error'); return; }
  const platz = document.getElementById('we-bulk-platz')?.value?.trim();
  if (!platz) { toast('Bitte Ziel-Platz eingeben', 'error'); return; }

  const nummern = checked.map(cb => cb.dataset.nr);
  if (!confirm(`${nummern.length} Paletten nach "${platz}" umlagern?`)) return;

  try {
    const data = await api('/api/umlagerung/bulk', { method: 'POST', body: { paletten_nummern: nummern, nach_platz: platz } });
    toast(data.message, 'success');
    if (data.errors && data.errors.length > 0) toast(`Fehler: ${data.errors.join(', ')}`, 'error');
    pgUmlagerung();
  } catch (e) { toast(e.message, 'error'); }
}

async function umlagerungAusWareneingang(paletteId, nr) {
  const platz = document.getElementById(`we-platz-${paletteId}`)?.value?.trim();
  if (!platz) { toast('Bitte Ziel-Platz eingeben', 'error'); return; }
  try {
    const data = await api('/api/umlagerung', { method: 'POST', body: { paletten_nr: nr, nach_platz: platz, bemerkung: 'Aus Wareneingang' } });
    toast(data.message, 'success');
    pgUmlagerung();
  } catch (e) { toast(e.message, 'error'); }
}

async function warenEingangQR() {
  const wareneingang = await api('/api/paletten?platz=Wareneingang');
  if (wareneingang.length === 0) { toast('Keine Paletten im Wareneingang', 'error'); return; }

  // Staplerauftrag erstellen mit den Wareneingang-Paletten
  const kundeId = wareneingang[0].kunde_id || 1;
  try {
    const data = await api('/api/auftraege', { method: 'POST', body: {
      kunde_id: kundeId,
      positionen: wareneingang.map(p => ({ paletten_nr: p.paletten_nr })),
      bemerkung: 'Umlagerung aus Wareneingang'
    }});

    // QR-Code anzeigen
    zeigeAuftragQR(data.token);
    toast(`QR-Code erstellt für ${wareneingang.length} Paletten`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function doUmlagerung() {
  try {
    const data = await api('/api/umlagerung', { method: 'POST', body: { paletten_nr: document.getElementById('uml-nr').value.trim(), nach_platz: document.getElementById('uml-platz').value.trim(), bemerkung: document.getElementById('uml-bem').value.trim() } });
    toast(data.message, 'success');
    pgUmlagerung();
  } catch (e) { toast(e.message, 'error'); }
}

// ═══ LAGERPLAN ═══════════════════════════════════════════════════════════════
let lpSelectedPaletten = new Set();

async function pgLagerplan() {
  const pc = document.getElementById('page-content');
  const uebersicht = await api('/api/lagerplaetze/plan/uebersicht');
  lpSelectedPaletten = new Set();
  
  pc.innerHTML = `
    <div class="page-header"><h1>Lagerplan</h1></div>
    <div class="lagerplan-tabs" id="lp-tabs">
      ${uebersicht.map(r => `<button data-regal="${r.regal}" onclick="loadRegal('${r.regal}')">${r.regal} <small style="opacity:.6">(${r.frei} frei)</small></button>`).join('')}
    </div>
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;gap:16px;font-size:12px;align-items:center;flex-wrap:wrap">
        <span><span style="display:inline-block;width:14px;height:14px;background:#e74c3c;border-radius:3px;vertical-align:middle"></span> Belegt (mit Nr.)</span>
        <span><span style="display:inline-block;width:14px;height:14px;background:#f39c12;border-radius:3px;vertical-align:middle"></span> Belegt (ohne Nr.)</span>
        <span><span style="display:inline-block;width:14px;height:14px;background:#95a5a6;border-radius:3px;vertical-align:middle"></span> Gesperrt/x</span>
        <span><span style="display:inline-block;width:14px;height:14px;background:#2ecc71;border-radius:3px;vertical-align:middle"></span> Frei</span>
        <span><span style="display:inline-block;width:14px;height:14px;background:#2980b9;border-radius:3px;vertical-align:middle"></span> Ausgewählt</span>
      </div>
    </div>
    <div id="lp-toolbar" style="display:none;margin-bottom:12px" class="card">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <strong id="lp-sel-count" style="font-size:13px">0 ausgewählt</strong>
        <input type="text" id="lp-umlagern-platz" placeholder="Ziel-Platz (z.B. XA, XB...)" style="width:180px;padding:6px 10px;font-size:13px">
        <button class="btn btn-sm btn-primary" onclick="lpBulkUmlagern()">Umlagern (ohne Buchung)</button>
        <button class="btn btn-sm btn-secondary" onclick="lpSelectedPaletten.clear();loadRegal(document.querySelector('.lagerplan-tabs .active')?.textContent?.trim()?.split(' ')[0]||'A')">Auswahl aufheben</button>
        <span id="lp-block-hint" style="font-size:12px;color:#e67e22;font-weight:600"></span>
      </div>
    </div>
    <div id="lp-grid" class="card"></div>`;
  
  if (uebersicht.length) loadRegal(uebersicht[0].regal);
}

async function loadRegal(regal) {
  document.querySelectorAll('.lagerplan-tabs button').forEach(b => b.classList.remove('active'));
  const btns = document.querySelectorAll('.lagerplan-tabs button');
  btns.forEach(b => { if (b.dataset.regal === regal) b.classList.add('active'); });

  const plaetze = await api(`/api/lagerplaetze/plan/regal/${encodeURIComponent(regal)}`);
  const grid = document.getElementById('lp-grid');

  grid.innerHTML = `<div class="card-header"><h3>Regal ${regal} — ${plaetze.length} Plätze</h3><span style="font-size:11px;color:var(--text-muted)">Klick = Details · Shift+Klick = Auswählen zum Umlagern</span></div>
    <div class="lagerplan-grid">
      ${plaetze.map(p => {
        let cls = 'frei';
        let label = p.position;
        const isSelected = p.paletten_nr && lpSelectedPaletten.has(p.paletten_nr);
        if (isSelected) { cls = 'belegt-selected'; label = '✓'; }
        else if (p.paletten_nr) { cls = 'belegt-nr'; label = p.paletten_nr; }
        else if (p.belegt && p.bemerkung?.includes('Nicht nutzbar')) { cls = 'belegt-x'; label = '×'; }
        else if (p.belegt) { cls = 'belegt-sonstige'; label = p.position; }
        const hoehe = p.max_hoehe_cm ? `<span class="lp-hoehe">${p.max_hoehe_cm}</span>` : '';
        return `<div class="lagerplan-cell ${cls}" onclick="lpCellClick(event, ${p.id}, '${p.paletten_nr || ''}')" title="${p.bezeichnung}${p.paletten_nr ? ' — ' + p.paletten_nr : ''}${p.max_hoehe_cm ? ' (max ' + p.max_hoehe_cm + 'cm)' : ''}">${label}${hoehe}</div>`;
      }).join('')}
    </div>`;

  lpUpdateToolbar();
}

function lpCellClick(event, platzId, palNr) {
  if (event.shiftKey && palNr) {
    if (lpSelectedPaletten.has(palNr)) lpSelectedPaletten.delete(palNr);
    else lpSelectedPaletten.add(palNr);
    const activeRegal = document.querySelector('.lagerplan-tabs .active')?.dataset?.regal;
    if (activeRegal) loadRegal(activeRegal);
  } else {
    showPlatzDetail(platzId);
  }
}

function lpUpdateToolbar() {
  const toolbar = document.getElementById('lp-toolbar');
  const count = lpSelectedPaletten.size;
  if (count > 0) {
    toolbar.style.display = '';
    document.getElementById('lp-sel-count').textContent = `${count} ausgewählt`;
    const hint = document.getElementById('lp-block-hint');
    let html = '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">';
    if (count > 3) {
      html += `<span style="font-size:11px;font-weight:600;color:#e67e22">Blöcke:</span>`;
    } else {
      html += `<span style="font-size:11px;font-weight:600;color:#aaa">Schnellauswahl:</span>`;
    }
    html += ['BlockE','BlockF'].map(b =>
      `<button class="btn btn-sm" onclick="document.getElementById('lp-umlagern-platz').value='${b}'" style="background:#e67e22;color:#fff;padding:2px 10px;font-size:11px;border-radius:4px">${b}</button>`
    ).join('');
    html += `<span style="font-size:11px;color:#aaa;margin-left:8px">Gänge:</span>`;
    html += ['XA','XB','XC','XD','XE1','XE2','XF1','XF2'].map(g =>
      `<button class="btn btn-sm" onclick="document.getElementById('lp-umlagern-platz').value='${g}'" style="background:#6c757d;color:#fff;padding:2px 8px;font-size:11px;border-radius:4px">${g}</button>`
    ).join('');
    html += '</div>';
    hint.innerHTML = html;
  } else {
    toolbar.style.display = 'none';
  }
}

async function lpBulkUmlagern() {
  const platz = document.getElementById('lp-umlagern-platz')?.value?.trim();
  if (!platz) { toast('Bitte Ziel-Platz eingeben', 'error'); return; }
  if (lpSelectedPaletten.size === 0) { toast('Keine Paletten ausgewählt', 'error'); return; }

  const nummern = [...lpSelectedPaletten];
  if (!confirm(`${nummern.length} Paletten nach "${platz}" umlagern?\n\n(Keine abrechenbare Buchung — nur Lagerverdichtung)`)) return;

  try {
    const data = await api('/api/umlagerung/bulk', { method: 'POST', body: { paletten_nummern: nummern, nach_platz: platz, bemerkung: 'Umlagerung aus Lagerplan' } });
    toast(data.message, 'success');
    if (data.errors && data.errors.length > 0) toast(`Fehler: ${data.errors.join(', ')}`, 'error');
    lpSelectedPaletten.clear();
    pgLagerplan();
  } catch (e) { toast(e.message, 'error'); }
}

async function showPlatzDetail(id) {
  const p = await api(`/api/lagerplaetze/${id}`);
  const isGesperrt = p.belegt && p.bemerkung?.includes('Nicht nutzbar');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="modal">
      <h2>Lagerplatz ${p.bezeichnung}</h2>
      <table style="width:100%;font-size:13px">
        <tr><td style="color:var(--text-muted)">Bereich</td><td>${p.bereich}</td></tr>
        <tr><td style="color:var(--text-muted)">Ebene</td><td>${p.ebene}</td></tr>
        <tr><td style="color:var(--text-muted)">Max. Höhe</td><td>${p.max_hoehe_cm ? p.max_hoehe_cm + ' cm' : '—'}</td></tr>
        <tr><td style="color:var(--text-muted)">Typ</td><td>${p.typ}</td></tr>
        <tr><td style="color:var(--text-muted)">Stapelbar</td><td>${p.stapelbar ? 'Ja (.a/.b)' : 'Nein'}</td></tr>
        <tr><td style="color:var(--text-muted)">Status</td><td>${isGesperrt ? '<span class="badge badge-warning">Gesperrt (×)</span>' : (p.belegt ? '<span class="badge badge-danger">Belegt</span>' : '<span class="badge badge-success">Frei</span>')}</td></tr>
        ${p.paletten_nr ? `
        <tr><td colspan="2" style="padding-top:12px"><strong>Palette</strong></td></tr>
        <tr><td style="color:var(--text-muted)">Paletten-Nr.</td><td><strong>${p.paletten_nr}</strong> <span class="badge badge-${p.nummern_typ === 'EB' ? 'eb' : 'kw'}">${p.nummern_typ}</span></td></tr>
        <tr><td style="color:var(--text-muted)">Artikel</td><td>${p.artikel_nr || '—'}</td></tr>
        <tr><td style="color:var(--text-muted)">Charge</td><td>${p.chargen_nr || '—'}</td></tr>
        <tr><td style="color:var(--text-muted)">Kunde</td><td>${p.kunde_name || '—'}</td></tr>
        <tr><td style="color:var(--text-muted)">Eingelagert</td><td>${p.eingelagert_am ? new Date(p.eingelagert_am).toLocaleDateString('de-DE') : '—'}</td></tr>
        ` : ''}
        ${p.bemerkung ? `<tr><td style="color:var(--text-muted)">Bemerkung</td><td>${p.bemerkung}</td></tr>` : ''}
      </table>
      <div class="modal-actions">
        ${p.paletten_nr ? `<button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove();editPalette(${p.palette_id})">Bearbeiten</button>` : ''}
        ${p.paletten_nr ? `<a class="btn btn-secondary" href="/api/berichte/auslagerungsbeleg/${p.paletten_nr}" target="_blank">Beleg PDF</a>` : ''}
        ${!p.paletten_nr ? `<button class="btn btn-sm ${isGesperrt ? 'btn-success' : 'btn-warning'}" onclick="togglePlatzSperre(${p.id}, ${isGesperrt ? 'false' : 'true'})">${isGesperrt ? 'Entsperren' : 'Sperren (×)'}</button>` : ''}
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Schließen</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function togglePlatzSperre(platzId, sperren) {
  try {
    await api(`/api/lagerplaetze/${platzId}/sperre`, { method: 'POST', body: { gesperrt: sperren } });
    toast(sperren ? 'Platz gesperrt' : 'Platz entsperrt', 'success');
    document.querySelector('.modal-overlay')?.remove();
    const activeRegal = document.querySelector('.lagerplan-tabs .active')?.dataset?.regal;
    if (activeRegal) loadRegal(activeRegal);
  } catch (e) { toast(e.message, 'error'); }
}

// ═══ BEWEGUNGEN ══════════════════════════════════════════════════════════════
async function pgBewegungen() {
  const pc = document.getElementById('page-content');
  pc.innerHTML = `
    <div class="page-header"><h1>Bewegungen</h1></div>
    <div class="card">
      <div class="form-row" style="margin-bottom:14px">
        <div class="form-group"><label>Von</label><input type="date" id="bew-von"></div>
        <div class="form-group"><label>Bis</label><input type="date" id="bew-bis"></div>
        <div class="form-group"><label>Typ</label>
          <select id="bew-typ"><option value="">Alle</option><option value="Einlagerung">Einlagerung</option><option value="Auslagerung">Auslagerung</option><option value="Extra Handling">Extra Handling</option></select>
        </div>
        <div class="form-group"><label>&nbsp;</label><button class="btn btn-primary" onclick="loadBewegungen()">Filtern</button></div>
      </div>
    </div>
    <div id="bew-results"></div>`;
  loadBewegungen();
}

async function loadBewegungen() {
  const von = document.getElementById('bew-von')?.value || '';
  const bis = document.getElementById('bew-bis')?.value || '';
  const typ = document.getElementById('bew-typ')?.value || '';
  
  let url = '/api/bewegungen?kunde_id=1&limit=100';
  if (von) url += `&von=${von}`;
  if (bis) url += `&bis=${bis}`;
  if (typ) url += `&typ=${encodeURIComponent(typ)}`;
  
  const data = await api(url);
  const box = document.getElementById('bew-results');
  
  box.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>${data.total} Bewegungen</h3>
        <div style="font-size:12px">${data.zusammenfassung.map(z => `${z.typ}: ${z.summe}`).join(' · ')}</div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Datum</th><th>Typ</th><th>Anzahl</th><th>Paletten</th><th>Benutzer</th><th></th></tr></thead><tbody>
        ${data.bewegungen.map(b => `<tr>
          <td>${b.datum ? new Date(b.datum).toLocaleDateString('de-DE') : '—'}</td>
          <td><span class="badge badge-${b.typ === 'Einlagerung' ? 'success' : b.typ === 'Auslagerung' ? 'danger' : b.typ === 'Entladung' ? 'eb' : 'warning'}">${b.typ}</span></td>
          <td>${b.anzahl}</td>
          <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.paletten_nummern || '—'}</td>
          <td style="font-size:12px">${b.benutzer || '—'}</td>
          <td>${b.korrektur ? '<span class="badge badge-warning">Korrektur</span>' : ''}</td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>`;
}

// ═══ KONTINGENT ══════════════════════════════════════════════════════════════
async function pgKontingent() {
  const pc = document.getElementById('page-content');
  const kunden = await api('/api/kunden');

  pc.innerHTML = `
    <div class="page-header"><h1>Kontingent</h1></div>
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <label style="font-size:13px;font-weight:600">Kunde:</label>
        <select id="kont-kunde" onchange="loadKontingent(this.value)" style="padding:6px 12px;font-size:13px;border-radius:6px;border:1px solid var(--border)">
          ${kunden.map(k => `<option value="${k.id}">${k.name} — Kontingent: ${k.kontingent_plaetze || 0} Plätze</option>`).join('')}
        </select>
        <button class="btn btn-sm btn-secondary" onclick="editKontingentPlaetze()">Kontingent anpassen</button>
      </div>
    </div>
    <div id="kont-content"></div>`;

  if (kunden.length) loadKontingent(kunden[0].id);
}

async function loadKontingent(kundeId) {
  const data = await api(`/api/kontingent/${kundeId}`);
  const box = document.getElementById('kont-content');
  const aktBestand = data.kunde?.live_bestand ?? (data.monate[0]?.lagerbestand || 0);
  const kontPlaetze = data.kunde?.kontingent_plaetze || 0;
  const ueber = Math.max(0, aktBestand - kontPlaetze);

  box.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="label">Kontingent</div><div class="value">${kontPlaetze}</div><div class="sub">Stellplätze</div></div>
      <div class="stat-card"><div class="label">Akt. Bestand (live)</div><div class="value">${aktBestand}</div></div>
      <div class="stat-card ${ueber > 0 ? 'warning' : ''}"><div class="label">Überkapazität</div><div class="value">${ueber}</div><div class="sub">zu berechnen</div></div>
    </div>
    <div class="card">
      <div class="card-header"><h3>Monatsverlauf — ${data.kunde?.name || ''}</h3></div>
      <div class="table-wrap"><table><thead><tr><th>Monat</th><th>Kontingent</th><th>Bestand</th><th>Einlag.</th><th>Auslag.</th><th>Bew.</th><th>Traffic</th><th>Überkapaz.</th></tr></thead><tbody>
        ${data.monate.length > 0 ? data.monate.slice(0, 24).map(m => `<tr>
          <td>${m.monat}</td><td>${m.kontingent_plaetze || '—'}</td><td>${m.lagerbestand || '—'}</td>
          <td>${m.einlagerungen || 0}</td><td>${m.auslagerungen || 0}</td>
          <td>${m.bewegungen_gesamt || 0}</td><td>${m.traffic_ratio ? (m.traffic_ratio * 100).toFixed(1) + '%' : '—'}</td>
          <td>${m.saldo_ueberkapazitaet || 0}</td>
        </tr>`).join('') : '<tr><td colspan="8" style="color:var(--text-muted)">Noch keine Kontingent-Daten vorhanden. Kontingent über "Kontingent anpassen" festlegen.</td></tr>'}
      </tbody></table></div>
    </div>`;
}

async function editKontingentPlaetze() {
  const kundeId = document.getElementById('kont-kunde').value;
  const kunde = (await api('/api/kunden')).find(k => k.id == kundeId);
  const aktKont = kunde?.kontingent_plaetze || 0;
  const monat = new Date().toISOString().substring(0, 7);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="modal">
      <h2>Kontingent anpassen — ${kunde?.name || ''}</h2>
      <div class="form-group"><label>Stellplätze (Kontingent)</label><input type="number" id="kp-plaetze" value="${aktKont}"></div>
      <div class="form-group"><label>Gültig ab Monat</label><input type="month" id="kp-monat" value="${monat}"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Abbrechen</button>
        <button class="btn btn-primary" onclick="saveKontingent(${kundeId})">Speichern</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function saveKontingent(kundeId) {
  const plaetze = parseInt(document.getElementById('kp-plaetze').value) || 0;
  const monat = document.getElementById('kp-monat').value;
  try {
    await api('/api/kunden/' + kundeId, { method: 'PUT', body: { kontingent_plaetze: plaetze, name: (await api('/api/kunden')).find(k => k.id == kundeId)?.name } });
    await api(`/api/kontingent/${kundeId}`, { method: 'POST', body: { monat, kontingent_plaetze: plaetze } });
    toast('Kontingent gespeichert', 'success');
    document.querySelector('.modal-overlay')?.remove();
    loadKontingent(kundeId);
  } catch (e) { toast(e.message, 'error'); }
}

// ═══ BERICHTE / PDF ══════════════════════════════════════════════════════════
function pgBerichte() {
  const pc = document.getElementById('page-content');
  pc.innerHTML = `
    <div class="page-header"><h1>Berichte & PDF-Export</h1></div>
    <div class="card">
      <h3 style="margin-bottom:16px">Monatsbericht (Abrechnungsdokument)</h3>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Erstellt ein PDF mit allen Bewegungen im Zeitraum — identisch zur Excel-Struktur.</p>
      <div class="form-row-3">
        <div class="form-group"><label>Von</label><input type="date" id="ber-von" value="2026-01-01"></div>
        <div class="form-group"><label>Bis</label><input type="date" id="ber-bis" value="2026-01-31"></div>
        <div class="form-group"><label>&nbsp;</label><button class="btn btn-primary" onclick="genMonatsbericht()">PDF generieren</button></div>
      </div>
    </div>
    <div class="card">
      <h3 style="margin-bottom:16px">Einzelbeleg</h3>
      <div class="form-row">
        <div class="form-group"><label>Paletten-Nr.</label><input type="text" id="ber-nr" placeholder="z.B. 654321"></div>
        <div class="form-group"><label>&nbsp;</label><button class="btn btn-primary" onclick="genEinzelbeleg()">Auslagerungsbeleg</button></div>
      </div>
    </div>`;
}

function genMonatsbericht() {
  const von = document.getElementById('ber-von').value;
  const bis = document.getElementById('ber-bis').value;
  window.open(`/api/berichte/monatsbericht-pdf?kunde_id=1&von=${von}&bis=${bis}`, '_blank');
}

function genEinzelbeleg() {
  const nr = document.getElementById('ber-nr').value.trim();
  if (nr) window.open(`/api/berichte/auslagerungsbeleg/${nr}`, '_blank');
}

// ═══ KUNDEN ══════════════════════════════════════════════════════════════════
async function pgKunden() {
  const pc = document.getElementById('page-content');
  const kunden = await api('/api/kunden');
  
  pc.innerHTML = `
    <div class="page-header"><h1>Kunden</h1><div class="actions"><button class="btn btn-primary" onclick="showNeuerKunde()">+ Neuer Kunde</button></div></div>
    <div class="card">
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Kürzel</th><th>Nr.-Prefix</th><th>Format</th><th>Kontingent</th><th>Paletten aktiv</th><th></th></tr></thead><tbody>
        ${kunden.map(k => `<tr><td><strong>${k.name}</strong></td><td>${k.kuerzel || '—'}</td><td>${k.nummern_prefix || '—'}</td><td>${k.nummern_format || '—'}</td><td>${k.kontingent_plaetze || '—'}</td><td>${k.aktive_paletten || '—'}</td><td><button class="btn btn-sm" onclick="showKundeDetail(${k.id})">Details</button></td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
}

async function showKundeDetail(id) {
  window._currentKundeId = id;
  const data = await api(`/api/kunden/${id}`);
  const { kunde, bewegungen, muster, kontingent, monatsStats } = data;
  const pc = document.getElementById('page-content');
  
  pc.innerHTML = `
    <div class="page-header">
      <h1>${kunde.name}</h1>
      <div class="actions"><button class="btn btn-secondary" onclick="pgKunden()">← Zurück</button></div>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card"><div class="label">Aktive Paletten</div><div class="value">${kunde.aktive_paletten}</div></div>
      <div class="stat-card"><div class="label">Kontingent</div><div class="value">${kunde.kontingent_plaetze || '—'}</div></div>
      <div class="stat-card ${kunde.ueberbelegung > 0 ? 'warning' : ''}"><div class="label">Überbelegung</div><div class="value">${kunde.ueberbelegung}</div></div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3>Adresse</h3><button class="btn btn-sm btn-secondary" onclick="editKundeAdresse(${kunde.id})">✎ Bearbeiten</button></div>
      <p style="font-size:13px;white-space:pre-line;color:${kunde.adresse ? 'var(--text)' : 'var(--text-muted)'}">${kunde.adresse || 'Keine Adresse hinterlegt — für Lieferscheine bitte hinterlegen.'}</p>
    </div>
    
    ${monatsStats.length > 0 ? `
    <div class="card">
      <div class="card-header"><h3>Bewegungen aktueller Monat</h3></div>
      <div class="table-wrap"><table><thead><tr><th>Typ</th><th>Anzahl</th></tr></thead><tbody>
        ${monatsStats.map(s => `<tr><td>${s.typ}</td><td><strong>${s.summe}</strong></td></tr>`).join('')}
      </tbody></table></div>
    </div>` : ''}
    
    ${kontingent ? `
    <div class="card">
      <div class="card-header"><h3>Kontingent</h3></div>
      <table style="width:100%;font-size:13px">
        <tr><td>Monat</td><td>${kontingent.monat || '—'}</td></tr>
        <tr><td>Stellplätze</td><td>${kontingent.kontingent_plaetze}</td></tr>
        <tr><td>Lagerbestand</td><td>${kontingent.lagerbestand}</td></tr>
        <tr><td>Saldo Überkapazität</td><td style="color:${(kontingent.saldo_ueberkapazitaet || 0) > 0 ? 'var(--danger)' : 'var(--success)'}">${kontingent.saldo_ueberkapazitaet || 0}</td></tr>
      </table>
    </div>` : ''}
    
    ${muster.length > 0 ? `
    <div class="card">
      <div class="card-header"><h3>Musterzüge (${muster.length})</h3></div>
      <div class="table-wrap"><table><thead><tr><th>Nr.</th><th>Pal.-Nr.</th><th>Lagerplatz</th><th>Menge</th><th>Benutzer</th><th>Datum</th></tr></thead><tbody>
        ${muster.map(m => `<tr><td>${m.lfd_nummer}</td><td>${m.paletten_nr}</td><td>${m.lagerplatz || '—'}</td><td>${m.menge}</td><td>${m.benutzer || '—'}</td><td>${m.datum ? new Date(m.datum).toLocaleString('de-DE') : '—'}</td></tr>`).join('')}
      </tbody></table></div>
    </div>` : ''}
    
    <div class="card">
      <div class="card-header"><h3>Letzte Bewegungen (${bewegungen.length})</h3></div>
      <div class="table-wrap"><table><thead><tr><th>Datum</th><th>Typ</th><th>Anzahl</th><th>Pal.-Nr.</th><th>Platz</th><th>Benutzer</th><th></th></tr></thead><tbody>
        ${bewegungen.map(b => `<tr><td>${b.datum || '—'}</td><td><span class="badge ${b.typ === 'Einlagerung' ? 'badge-success' : b.typ === 'Auslagerung' ? 'badge-danger' : 'badge-warning'}">${b.typ}</span></td><td>${b.anzahl}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${b.paletten_nummern || '—'}</td><td>${b.bemerkung || '—'}</td><td>${b.benutzer || '—'}</td><td>${b.typ === 'Auslagerung' || b.typ === 'Einlagerung' ? `<button class="btn btn-sm btn-danger" onclick="rueckgaengigBewegung(${b.id}, '${b.typ}', '${(b.paletten_nummern||'').replace(/'/g,'')}')" title="Rückgängig">↩</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
}

async function rueckgaengigBewegung(bewegungId, typ, palNr) {
  if (!confirm(`Bewegung "${typ}" für "${palNr}" wirklich rückgängig machen?\n\nDies kann nicht erneut rückgängig gemacht werden.`)) return;
  try {
    const data = await api(`/api/bewegungen/${bewegungId}/rueckgaengig`, { method: 'POST' });
    toast(data.message, 'success');
    if (window._currentKundeId) showKundeDetail(window._currentKundeId);
  } catch (e) { toast(e.message, 'error'); }
}

function showNeuerKunde() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="modal">
      <h2>Neuer Kunde</h2>
      <div class="form-row"><div class="form-group"><label>Name</label><input type="text" id="nk-name"></div><div class="form-group"><label>Kürzel</label><input type="text" id="nk-kuerzel"></div></div>
      <div class="form-row"><div class="form-group"><label>Nr.-Prefix</label><input type="text" id="nk-prefix" placeholder="z.B. EB, KW"></div><div class="form-group"><label>Format</label><input type="text" id="nk-format" placeholder="z.B. 6-stellig"></div></div>
      <div class="form-group"><label>Kontingent (Stellplätze)</label><input type="number" id="nk-kont" value="0"></div>
      <div class="form-group"><label>Adresse (für Lieferschein)</label><textarea id="nk-adresse" rows="3" placeholder="Firmenname&#10;Straße Nr.&#10;PLZ Ort"></textarea></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Abbrechen</button>
        <button class="btn btn-primary" onclick="saveNeuerKunde()">Speichern</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function editKundeAdresse(id) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="modal">
      <h2>Adresse bearbeiten</h2>
      <div class="form-group"><label>Adresse (für Lieferschein)</label><textarea id="ka-adresse" rows="4" placeholder="Firmenname&#10;Straße Nr.&#10;PLZ Ort&#10;Land" style="font-size:14px"></textarea></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Abbrechen</button>
        <button class="btn btn-primary" onclick="saveKundeAdresse(${id})">Speichern</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  api(`/api/kunden/${id}`).then(d => { document.getElementById('ka-adresse').value = d.kunde.adresse || ''; });
}

async function saveKundeAdresse(id) {
  const adresse = document.getElementById('ka-adresse').value.trim();
  try {
    await api(`/api/kunden/${id}/adresse`, { method: 'PUT', body: { adresse } });
    toast('Adresse gespeichert', 'success');
    document.querySelector('.modal-overlay')?.remove();
    showKundeDetail(id);
  } catch (e) { toast(e.message, 'error'); }
}

async function saveNeuerKunde() {
  try {
    await api('/api/kunden', { method: 'POST', body: { name: document.getElementById('nk-name').value, kuerzel: document.getElementById('nk-kuerzel').value, nummern_prefix: document.getElementById('nk-prefix').value, nummern_format: document.getElementById('nk-format').value, kontingent_plaetze: parseInt(document.getElementById('nk-kont').value) || 0 } });
    document.querySelector('.modal-overlay')?.remove();
    toast('Kunde angelegt', 'success');
    pgKunden();
  } catch (e) { toast(e.message, 'error'); }
}

// ═══ PROTOKOLL ═══════════════════════════════════════════════════════════════
async function pgProtokoll() {
  const pc = document.getElementById('page-content');
  
  pc.innerHTML = `
    <div class="page-header"><h1>Veränderungsprotokoll</h1></div>
    <div class="card" style="margin-bottom:12px">
      <p style="font-size:12px;color:var(--text-muted);margin:0 0 12px 0">
        Lückenlose Dokumentation aller Lagerbewegungen mit Zeitstempel, Benutzer und vollständigen Details.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:200px">
          <input type="text" id="protokoll-suche" placeholder="Suche: Palette, Platz, Kunde, Datum, Aktion..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);font-size:14px" onkeydown="if(event.key==='Enter')protokollSuchen()">
        </div>
        <select id="protokoll-filter" onchange="protokollSuchen()" style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px">
          <option value="">Alle Aktionen</option>
          <option value="Einlagerung">Einlagerung</option>
          <option value="Auslagerung">Auslagerung</option>
          <option value="Umlagerung">Umlagerung</option>
          <option value="Direkteinlagerung">Direkteinlagerung</option>
          <option value="Musterzug">Musterzug</option>
          <option value="Zwischengelagert">Zwischengelagert</option>
          <option value="Rückgängig">Rückgängig</option>
        </select>
        <button class="btn btn-primary" onclick="protokollSuchen()">Suchen</button>
        <button class="btn btn-secondary" onclick="document.getElementById('protokoll-suche').value='';document.getElementById('protokoll-filter').value='';protokollSuchen()">Reset</button>
      </div>
    </div>
    <div id="protokoll-tabelle">
      <p style="color:var(--text-muted);padding:20px">Lade...</p>
    </div>`;
  
  protokollSuchen();
}

async function protokollSuchen() {
  const q = document.getElementById('protokoll-suche')?.value?.trim() || '';
  const filter = document.getElementById('protokoll-filter')?.value || '';
  let url = '/api/protokoll?limit=500';
  const searchTerms = [q, filter].filter(Boolean).join(' ');
  if (searchTerms) url += `&q=${encodeURIComponent(searchTerms)}`;
  
  const logs = await api(url);
  const box = document.getElementById('protokoll-tabelle');
  
  if (logs.length === 0) {
    box.innerHTML = '<div class="card"><p style="color:var(--text-muted);text-align:center;padding:20px">Keine Einträge gefunden.</p></div>';
    return;
  }

  box.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>${q || filter ? `Suche: ${logs.length} Treffer` : `Letzte ${logs.length} Einträge`}</h3></div>
      <div class="table-wrap"><table><thead><tr>
        <th style="width:140px">Zeitstempel</th>
        <th style="width:130px">Aktion</th>
        <th>Details</th>
        <th style="width:100px">Benutzer</th>
      </tr></thead><tbody>
        ${logs.map(l => {
          const aktionClass = l.aktion?.includes('Einlagerung') ? 'badge-success' : 
            l.aktion?.includes('Auslagerung') ? 'badge-danger' : 
            l.aktion?.includes('Musterzug') ? 'badge-warning' :
            l.aktion?.includes('Direkt') || l.aktion?.includes('Zwischen') ? 'badge-eb' :
            l.aktion?.includes('Umlagerung') ? 'badge-info' :
            l.aktion?.includes('Rückgängig') ? 'badge-warning' : 'badge-info';
          const ts = l.zeitstempel ? new Date(l.zeitstempel).toLocaleString('de-DE', {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—';
          const details = (l.details || '').replace(/\|/g, '<span style="color:var(--text-muted);margin:0 4px">·</span>');
          return `<tr>
            <td style="white-space:nowrap;font-size:12px;font-family:monospace;color:var(--text-muted)">${ts}</td>
            <td><span class="badge ${aktionClass}">${l.aktion || '?'}</span></td>
            <td style="font-size:12px;line-height:1.4">${details}</td>
            <td style="font-size:12px;font-weight:500">${l.benutzer || '—'}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>
    </div>`;
}

// ═══ PALETTE BEARBEITEN (Modal) ═══════════════════════════════════════════════
async function editPalette(id) {
  const p = await api(`/api/paletten/${id}`);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="modal">
      <h2>Palette bearbeiten</h2>
      <div class="form-group"><label>Paletten-Nr.</label><input type="text" id="ep-nr" value="${p.paletten_nr || ''}"></div>
      <div class="form-row">
        <div class="form-group"><label>Lagerplatz</label><input type="text" id="ep-platz" value="${p.platz || p.lagerplatz_bezeichnung || ''}"></div>
        <div class="form-group"><label>Menge</label><input type="number" id="ep-menge" value="${p.menge || 1}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Artikel-Nr.</label><input type="text" id="ep-artikel" value="${p.artikel_nr || ''}"></div>
        <div class="form-group"><label>Chargen-Nr.</label><input type="text" id="ep-charge" value="${p.chargen_nr || ''}"></div>
      </div>
      <div class="form-group"><label>Bemerkung</label><textarea id="ep-bem" rows="2">${p.bemerkung || ''}</textarea></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Abbrechen</button>
        <button class="btn btn-primary" onclick="savePalette(${id})">Speichern</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function savePalette(id) {
  try {
    await api(`/api/paletten/${id}`, { method: 'PUT', body: {
      paletten_nr: document.getElementById('ep-nr').value.trim(),
      lagerplatz_bezeichnung: document.getElementById('ep-platz').value.trim(),
      menge: parseInt(document.getElementById('ep-menge').value) || 1,
      artikel_nr: document.getElementById('ep-artikel').value.trim() || null,
      chargen_nr: document.getElementById('ep-charge').value.trim() || null,
      bemerkung: document.getElementById('ep-bem').value.trim() || null
    }});
    document.querySelector('.modal-overlay')?.remove();
    toast('Palette gespeichert', 'success');
    if (currentPage === 'suche') doSearch();
    else if (currentPage === 'lagerplan') pgLagerplan();
  } catch (e) { toast(e.message, 'error'); }
}

// ═══ DOKUMENTENARCHIV ═════════════════════════════════════════════════════════
async function pgDokumente() {
  const pc = document.getElementById('page-content');
  const docs = await api('/api/pickliste/archiv');

  pc.innerHTML = `
    <div class="page-header"><h1>Dokumentenarchiv</h1><p style="font-size:12px;color:var(--text-muted)">Alle generierten Lieferscheine & Belege</p></div>
    <div class="card">
      <div class="table-wrap"><table><thead><tr><th>Beleg-Nr.</th><th>Kunde</th><th>Paletten</th><th>LKW</th><th>Benutzer</th><th>Erstellt</th><th>PDF</th></tr></thead><tbody>
        ${docs.length === 0 ? '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Noch keine Dokumente vorhanden</td></tr>' :
        docs.map(d => `<tr>
          <td><strong>${d.beleg_nr}</strong></td>
          <td>${d.kunde_name || '—'}</td>
          <td>${d.anzahl}</td>
          <td>${d.lkw_gesamt > 1 ? `${d.lkw_nr}/${d.lkw_gesamt}` : '1'}</td>
          <td>${d.benutzer || '—'}</td>
          <td>${d.erstellt_am ? new Date(d.erstellt_am).toLocaleString('de-DE') : '—'}</td>
          <td><a class="btn btn-sm btn-primary" href="/api/pickliste/lieferschein/${d.id}" target="_blank">PDF</a></td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>`;
}

// ─── START ───────────────────────────────────────────────────────────────────
init();
