const App = {
  page: 'dashboard',
  user: null,

  async init() {
    const s = await this.api('/api/auth/session');
    if (s?.user) { this.user = s.user; this.render(); }
    else this.loginPage();
  },

  async api(url, o = {}) {
    try {
      const r = await fetch(url, { headers: {'Content-Type':'application/json'}, ...o });
      if (!r.ok) { const t = await r.text(); throw new Error(t); }
      return r.json();
    } catch(e) { return null; }
  },

  toast(msg, type='info') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fas fa-${type==='success'?'check':'exclamation-circle'}"></i> ${msg}`;
    c.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  },

  go(p) { this.page = p; this.render(); },

  // ═══════ LOGIN ═══════
  loginPage() {
    document.getElementById('app').innerHTML = `
      <div class="login-wrap">
        <div class="login-box">
          <div class="logo"><i class="fas fa-warehouse"></i></div>
          <h1>Highspeed Kurier</h1>
          <p class="sub">Lagermanagement</p>
          <form id="lf">
            <div class="field"><label>Benutzer</label><input id="lu" placeholder="admin" autofocus></div>
            <div class="field"><label>Passwort</label><input id="lp" type="password" placeholder="••••"></div>
            <button type="submit" class="btn btn-y" style="width:100%;justify-content:center;padding:14px;font-size:15px">Anmelden</button>
          </form>
        </div>
      </div>`;
    document.getElementById('lf').onsubmit = async(e) => {
      e.preventDefault();
      const r = await this.api('/api/auth/login', { method:'POST', body: JSON.stringify({benutzername:document.getElementById('lu').value,passwort:document.getElementById('lp').value})});
      if (r?.success) { this.user = r.user; this.render(); }
      else this.toast('Anmeldung fehlgeschlagen','error');
    };
  },

  // ═══════ APP SHELL ═══════
  render() {
    const nav = [
      {id:'dashboard',icon:'fa-th-large',label:'Start'},
      {id:'suche',icon:'fa-search',label:'Suche'},
      {id:'einlagern',icon:'fa-arrow-circle-down',label:'Einlagern'},
      {id:'auslagern',icon:'fa-arrow-circle-up',label:'Auslagern'},
      {id:'lagerplan',icon:'fa-map',label:'Lagerplan'},
      {id:'berichte',icon:'fa-chart-line',label:'Berichte'},
      {id:'protokoll',icon:'fa-clipboard-list',label:'Protokoll'},
    ];

    document.getElementById('app').innerHTML = `
      <div class="app-layout">
        <nav class="sidebar">
          <div class="sidebar-logo">HS</div>
          <div class="sidebar-nav">
            ${nav.map(n => `<div class="sidebar-item ${n.id===this.page?'active':''}" data-p="${n.id}"><i class="fas ${n.icon}"></i><span class="tooltip">${n.label}</span></div>`).join('')}
          </div>
          <div class="sidebar-bottom">
            <div class="sidebar-item" id="logout-btn"><i class="fas fa-sign-out-alt"></i><span class="tooltip">Abmelden</span></div>
          </div>
        </nav>
        <main class="main" id="content"></main>
      </div>`;

    document.querySelectorAll('.sidebar-item[data-p]').forEach(el => { el.onclick = () => this.go(el.dataset.p); });
    document.getElementById('logout-btn').onclick = async() => { await this.api('/api/auth/logout',{method:'POST'}); this.user=null; this.loginPage(); };
    this.loadPage();
  },

  async loadPage() {
    const el = document.getElementById('content');
    switch(this.page) {
      case 'dashboard': return this.pgDashboard(el);
      case 'suche': return this.pgSuche(el);
      case 'einlagern': return this.pgEinlagern(el);
      case 'auslagern': return this.pgAuslagern(el);
      case 'lagerplan': return this.pgLagerplan(el);
      case 'berichte': return this.pgBerichte(el);
      case 'protokoll': return this.pgProtokoll(el);
    }
  },

  // ═══════ DASHBOARD ═══════
  async pgDashboard(el) {
    const [stats, bereiche] = await Promise.all([
      this.api('/api/dashboard/stats'),
      this.api('/api/dashboard/belegung-bereiche')
    ]);
    if (!stats) return;

    el.innerHTML = `
      <div class="top-bar">
        <h1>Lagerübersicht</h1>
        <div class="user-info">
          <span>${new Date().toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span>
          <div class="user-avatar">${(this.user?.vollname||'A')[0]}</div>
        </div>
      </div>

      <div class="stat-tiles">
        <div class="stat-tile"><div class="icon r"><i class="fas fa-fire"></i></div><div class="data"><h3>${stats.belegungProzent}%</h3><p>Auslastung</p></div></div>
        <div class="stat-tile"><div class="icon y"><i class="fas fa-pallet"></i></div><div class="data"><h3>${stats.totalPlaetze.toLocaleString('de')}</h3><p>Plätze Gesamt</p></div></div>
        <div class="stat-tile"><div class="icon g"><i class="fas fa-check-circle"></i></div><div class="data"><h3>${stats.freiePlaetze}</h3><p>Freie Plätze</p></div></div>
        <div class="stat-tile"><div class="icon b"><i class="fas fa-file-contract"></i></div><div class="data"><h3>${stats.kontingent?.kontingent_plaetze||642}</h3><p>Kontingent PPH</p></div></div>
      </div>

      <div class="capacity-section">
        <div class="capacity-header">
          <h2>Lagerbelegung</h2>
          <span class="pct">${stats.belegungProzent}%</span>
        </div>
        <div class="capacity-bar"><div class="capacity-fill" style="width:${stats.belegungProzent}%"></div></div>
        <div class="capacity-labels"><span><strong>${stats.belegtePlaetze.toLocaleString('de')}</strong> belegt</span><span><strong>${stats.freiePlaetze}</strong> frei von ${stats.totalPlaetze.toLocaleString('de')}</span></div>
      </div>

      <div class="actions-grid">
        <div class="action-card" data-p="suche"><i class="fas fa-search"></i><h4>EB-Nummer suchen</h4><p>Palette finden</p></div>
        <div class="action-card" data-p="einlagern"><i class="fas fa-arrow-circle-down"></i><h4>Einlagern</h4><p>Neue Palette</p></div>
        <div class="action-card" data-p="auslagern"><i class="fas fa-arrow-circle-up"></i><h4>Auslagern / Abruf</h4><p>Beleg erstellen</p></div>
        <div class="action-card" data-p="lagerplan"><i class="fas fa-map"></i><h4>Lagerplan</h4><p>Belegung anzeigen</p></div>
        <div class="action-card" data-p="berichte"><i class="fas fa-chart-line"></i><h4>Berichte</h4><p>Kontingent & Traffic</p></div>
        <div class="action-card" data-p="protokoll"><i class="fas fa-clipboard-list"></i><h4>Protokoll</h4><p>Alle Aktionen</p></div>
      </div>

      ${bereiche?`<div class="card"><div class="card-head"><h3>Belegung nach Bereich</h3></div><div class="card-body"><div class="bereich-list">
        ${bereiche.map(b => {
          const pct = Math.round(b.belegt/b.gesamt*100);
          const color = pct>95?'var(--red)':pct>80?'var(--yellow)':'var(--green)';
          return `<div class="bereich-item"><h4>${b.bereich}</h4><div class="bereich-progress"><div class="bereich-progress-fill" style="width:${pct}%;background:${color}"></div></div><div class="nums"><span>${b.belegt} / ${b.gesamt}</span><span>${pct}%</span></div></div>`;
        }).join('')}
      </div></div></div>`:''}
    `;
    el.querySelectorAll('.action-card[data-p]').forEach(c => { c.onclick = () => this.go(c.dataset.p); });
  },

  // ═══════ SUCHE ═══════
  async pgSuche(el) {
    el.innerHTML = `
      <div class="top-bar"><h1>Palette suchen</h1></div>
      <div class="search-wrap"><i class="fas fa-search icon"></i><input id="si" placeholder="EB-Nummer, Lagerplatz oder Kunde eingeben..." autofocus></div>
      <div id="sr"></div>`;
    const input = document.getElementById('si');
    let timer;
    const search = async() => {
      const q = input.value.trim();
      if (!q) { document.getElementById('sr').innerHTML = ''; return; }
      const r = await this.api(`/api/paletten/suche?q=${encodeURIComponent(q)}`);
      if (!r||!r.length) { document.getElementById('sr').innerHTML = `<div style="text-align:center;padding:40px;color:var(--gray-500)"><i class="fas fa-search" style="font-size:32px;margin-bottom:12px;display:block;opacity:0.3"></i>Keine Ergebnisse für "${q}"</div>`; return; }
      document.getElementById('sr').innerHTML = `<div class="card"><div class="card-head"><h3>${r.length} Ergebnis${r.length>1?'se':''}</h3></div><div class="card-body" style="padding:0;overflow-x:auto"><table class="tbl"><thead><tr><th>EB-Nummer</th><th>Lagerplatz</th><th>Kunde</th><th>Eingelagert</th><th></th></tr></thead><tbody>${r.map(p=>`<tr><td><span class="eb">${p.eb_nummer}</span></td><td><span class="loc">${p.lagerplatz_bez||p.lagerplatz_bezeichnung||'-'}</span></td><td>${p.kunde_name||'-'}</td><td>${p.eingelagert_am?new Date(p.eingelagert_am).toLocaleDateString('de'):'-'}</td><td><button class="btn btn-sm btn-outline" onclick="App.detailModal(${p.id})"><i class="fas fa-eye"></i></button></td></tr>`).join('')}</tbody></table></div></div>`;
    };
    input.oninput = () => { clearTimeout(timer); timer = setTimeout(search, 300); };
    input.onkeydown = (e) => { if(e.key==='Enter') search(); };
  },

  async detailModal(id) {
    const p = await this.api(`/api/paletten/${id}`);
    if (!p) return;
    const d = document.createElement('div');
    d.className = 'modal-bg';
    d.innerHTML = `<div class="modal-box"><div class="modal-top"><h3>Palette ${p.eb_nummer}</h3><button class="modal-close" onclick="this.closest('.modal-bg').remove()">&times;</button></div><div class="modal-content">
      <div class="field-row"><div class="field"><label>EB-Nummer</label><input value="${p.eb_nummer}" readonly></div><div class="field"><label>Lagerplatz</label><input value="${p.lagerplatz_bezeichnung||'-'}" readonly></div></div>
      <div class="field-row"><div class="field"><label>Kunde</label><input value="${p.kunde_name||'Panpharma'}" readonly></div><div class="field"><label>Eingelagert am</label><input value="${p.eingelagert_am?new Date(p.eingelagert_am).toLocaleDateString('de'):'-'}" readonly></div></div>
      ${p.artikel_nr?`<div class="field"><label>Artikel-Nr.</label><input value="${p.artikel_nr}" readonly></div>`:''}
    </div><div class="modal-footer"><button class="btn btn-y" onclick="App.auslagerBeleg('${p.eb_nummer}','${p.lagerplatz_bezeichnung||''}','${p.kunde_name||'Panpharma'}');this.closest('.modal-bg').remove()"><i class="fas fa-file-pdf"></i> Auslagerungsbeleg</button></div></div>`;
    document.body.appendChild(d);
    d.onclick = (e) => { if(e.target===d) d.remove(); };
  },

  // ═══════ EINLAGERN ═══════
  async pgEinlagern(el) {
    const freie = await this.api('/api/lagerplaetze?belegt=0&limit=84');
    el.innerHTML = `
      <div class="top-bar"><h1>Einlagern</h1></div>
      <div class="dash-grid">
        <div class="card"><div class="card-head"><h3>Neue Palette einlagern</h3></div><div class="card-body">
          <form id="ef">
            <div class="field-row"><div class="field"><label>EB-Nummer *</label><input id="e-eb" placeholder="z.B. 655564" required></div><div class="field"><label>Lagerplatz *</label><input id="e-pl" placeholder="z.B. C12" required></div></div>
            <div class="field-row"><div class="field"><label>Artikel-Nr.</label><input id="e-art"></div><div class="field"><label>Chargen-Nr.</label><input id="e-ch"></div></div>
            <div class="field"><label>Bemerkung</label><input id="e-bem"></div>
            <button type="submit" class="btn btn-y"><i class="fas fa-check"></i> Einlagern</button>
          </form>
        </div></div>
        <div class="card"><div class="card-head"><h3>Freie Plätze (${freie?.length||0})</h3></div><div class="card-body" style="padding:0;max-height:400px;overflow-y:auto">
          <table class="tbl"><thead><tr><th>Platz</th><th>Regal</th><th>Ebene</th></tr></thead><tbody>
          ${(freie||[]).map(f=>`<tr style="cursor:pointer" onclick="document.getElementById('e-pl').value='${f.bezeichnung}'"><td><span class="loc">${f.bezeichnung}</span></td><td>${f.regal}</td><td>${f.ebene}</td></tr>`).join('')}
          </tbody></table>
        </div></div>
      </div>`;
    document.getElementById('ef').onsubmit = async(e) => {
      e.preventDefault();
      const r = await this.api('/api/einlagerung', { method:'POST', body: JSON.stringify({ eb_nummer:document.getElementById('e-eb').value.trim(), lagerplatz:document.getElementById('e-pl').value.trim(), artikel_nr:document.getElementById('e-art').value.trim(), chargen_nr:document.getElementById('e-ch').value.trim(), bemerkung:document.getElementById('e-bem').value.trim() })});
      if (r?.success) { this.toast('Palette eingelagert auf '+r.lagerplatz,'success'); this.pgEinlagern(el); }
      else this.toast(r?.error||'Fehler','error');
    };
  },

  // ═══════ AUSLAGERN ═══════
  async pgAuslagern(el) {
    const [abruf, direkt] = await Promise.all([
      this.api('/api/bewegungen/abrufliste'),
      this.api('/api/bewegungen/direktabholungen')
    ]);
    el.innerHTML = `
      <div class="top-bar"><h1>Auslagern / Abruf</h1><button class="btn btn-y" onclick="App.neuerAbruf()"><i class="fas fa-plus"></i> Neuer Abruf</button></div>
      <div class="card" style="margin-bottom:20px"><div class="card-head"><h3>Aktuelle Abrufliste (${abruf?.length||0} Pal.)</h3><button class="btn btn-sm btn-dark" onclick="App.abrufBeleg()"><i class="fas fa-file-pdf"></i> Beleg drucken</button></div><div class="card-body" style="padding:0;overflow-x:auto">
        ${abruf?.length?`<table class="tbl"><thead><tr><th>#</th><th>EB-Nummer</th><th>Lagerplatz</th><th>LKW</th></tr></thead><tbody>${abruf.map(a=>`<tr><td>${a.lfd_nummer||'-'}</td><td><span class="eb">${a.eb_nummer}</span></td><td><span class="loc">${a.lagerplatz||'-'}</span></td><td>${a.lkw||'-'}</td></tr>`).join('')}</tbody></table>`:'<div style="padding:32px;text-align:center;color:var(--gray-500)">Keine offenen Abrufe</div>'}
      </div></div>
      <div class="card"><div class="card-head"><h3>DirektAbholungen (${direkt?.length||0})</h3></div><div class="card-body" style="padding:0;overflow-x:auto">
        ${direkt?.length?`<table class="tbl"><thead><tr><th>#</th><th>EB-Nummer</th><th>Platz</th><th>Artikel</th><th>Charge</th></tr></thead><tbody>${direkt.map(d=>`<tr><td>${d.lfd_nummer||'-'}</td><td><span class="eb">${d.eb_nummer}</span></td><td><span class="loc">${d.lagerplatz||'-'}</span></td><td>${d.artikel_nr||'-'}</td><td>${d.chargen_nr||'-'}</td></tr>`).join('')}</tbody></table>`:'<div style="padding:32px;text-align:center;color:var(--gray-500)">Keine DirektAbholungen</div>'}
      </div></div>`;
  },

  neuerAbruf() {
    const d = document.createElement('div');
    d.className = 'modal-bg';
    d.innerHTML = `<div class="modal-box"><div class="modal-top"><h3>Auslagerung / Abruf</h3><button class="modal-close" onclick="this.closest('.modal-bg').remove()">&times;</button></div><div class="modal-content">
      <form id="af"><div class="field"><label>EB-Nummer</label><input id="a-eb" placeholder="EB-Nummer der Palette" required autofocus></div><div class="field"><label>Bemerkung</label><input id="a-bem" placeholder="z.B. Abruf durch Kunde"></div>
      <div style="display:flex;gap:10px"><button type="submit" class="btn btn-y"><i class="fas fa-arrow-up"></i> Auslagern</button><button type="button" class="btn btn-dark" onclick="App.auslagerBelegFromModal()"><i class="fas fa-file-pdf"></i> Beleg erstellen</button></div></form>
    </div></div>`;
    document.body.appendChild(d);
    d.onclick = (e) => { if(e.target===d) d.remove(); };
    document.getElementById('af').onsubmit = async(e) => {
      e.preventDefault();
      const eb = document.getElementById('a-eb').value.trim();
      const r = await this.api('/api/auslagerung', { method:'POST', body: JSON.stringify({ eb_nummer:eb, bemerkung:document.getElementById('a-bem').value.trim() })});
      if (r?.success) { d.remove(); this.toast(`Palette ${eb} ausgelagert von ${r.palette?.lagerplatz_bezeichnung||'?'}`,'success'); this.pgAuslagern(document.getElementById('content')); }
      else this.toast(r?.error||'Palette nicht gefunden','error');
    };
  },

  // ═══════ PDF BELEG ═══════
  async auslagerBeleg(eb, platz, kunde) {
    window.open(`/api/berichte/auslagerungsbeleg?eb=${eb}&platz=${encodeURIComponent(platz)}&kunde=${encodeURIComponent(kunde)}`, '_blank');
  },

  auslagerBelegFromModal() {
    const eb = document.getElementById('a-eb').value.trim();
    if (!eb) { this.toast('Bitte EB-Nummer eingeben','error'); return; }
    window.open(`/api/berichte/auslagerungsbeleg?eb=${eb}`, '_blank');
  },

  async abrufBeleg() {
    window.open('/api/berichte/abrufbeleg', '_blank');
  },

  // ═══════ LAGERPLAN ═══════
  async pgLagerplan(el) {
    const bereiche = await this.api('/api/dashboard/belegung-bereiche');
    el.innerHTML = `
      <div class="top-bar"><h1>Lagerplan</h1></div>
      <div class="stat-tiles" style="margin-bottom:20px">
        ${(bereiche||[]).filter(b=>b.bereich.startsWith('Regal')).map(b => {
          const pct = Math.round(b.belegt/b.gesamt*100);
          return `<div class="stat-tile"><div class="icon ${pct>95?'r':pct>80?'y':'g'}"><i class="fas fa-grip-vertical"></i></div><div class="data"><h3>${pct}%</h3><p>${b.bereich} (${b.belegt}/${b.gesamt})</p></div></div>`;
        }).join('')}
      </div>
      <div class="bereich-list">
        ${(bereiche||[]).map(b => {
          const pct = Math.round(b.belegt/b.gesamt*100);
          const color = pct>95?'var(--red)':pct>80?'var(--yellow)':'var(--green)';
          return `<div class="bereich-item"><h4>${b.bereich}</h4><div class="bereich-progress"><div class="bereich-progress-fill" style="width:${pct}%;background:${color}"></div></div><div class="nums"><span>${b.belegt} / ${b.gesamt} belegt</span><span>${pct}%</span></div></div>`;
        }).join('')}
      </div>`;
  },

  // ═══════ BERICHTE ═══════
  async pgBerichte(el) {
    const [stats, kontingent] = await Promise.all([
      this.api('/api/dashboard/stats'),
      this.api('/api/dashboard/kontingent-verlauf')
    ]);
    el.innerHTML = `
      <div class="top-bar"><h1>Berichte & Kontingent</h1></div>
      <div class="stat-tiles">
        <div class="stat-tile"><div class="icon b"><i class="fas fa-file-contract"></i></div><div class="data"><h3>${stats?.kontingent?.kontingent_plaetze||642}</h3><p>Kontingent PPH</p></div></div>
        <div class="stat-tile"><div class="icon y"><i class="fas fa-warehouse"></i></div><div class="data"><h3>${stats?.kontingent?.lagerbestand||'-'}</h3><p>Lagerbestand aktuell</p></div></div>
        <div class="stat-tile"><div class="icon g"><i class="fas fa-plus-circle"></i></div><div class="data"><h3>${stats?.kontingent?.verfuegbar||'-'}</h3><p>Verfügbar</p></div></div>
        <div class="stat-tile"><div class="icon r"><i class="fas fa-exchange-alt"></i></div><div class="data"><h3>${stats?.kontingent?.bewegungen_gesamt||'-'}</h3><p>Bewegungen Monat</p></div></div>
      </div>
      <div class="card"><div class="card-head"><h3>Kontingent-Verlauf (letzte 24 Monate)</h3></div><div class="card-body" style="padding:0;overflow-x:auto;max-height:500px;overflow-y:auto">
        ${kontingent?.length?`<table class="tbl"><thead><tr><th>Monat</th><th>Bestand</th><th>Kontingent</th><th>Einlag.</th><th>Auslag.</th><th>Bewegungen</th></tr></thead><tbody>${kontingent.slice().reverse().map(k=>`<tr><td><strong>${k.monat}</strong></td><td>${k.lagerbestand||'-'}</td><td>${k.kontingent_plaetze||'-'}</td><td>${k.einlagerungen||'-'}</td><td>${k.auslagerungen||'-'}</td><td>${k.bewegungen_gesamt||'-'}</td></tr>`).join('')}</tbody></table>`:''}
      </div></div>`;
  },

  // ═══════ PROTOKOLL ═══════
  async pgProtokoll(el) {
    const data = await this.api('/api/protokoll?limit=100');
    const log = data?.rows || data || [];
    el.innerHTML = `
      <div class="top-bar"><h1>Systemprotokoll</h1></div>
      <div class="card"><div class="card-body" style="padding:0;overflow-x:auto;max-height:600px;overflow-y:auto">
        <table class="tbl"><thead><tr><th>Zeitpunkt</th><th>Aktion</th><th>Details</th><th>Benutzer</th></tr></thead><tbody>
        ${log.map(l=>`<tr><td style="white-space:nowrap">${l.zeitstempel?new Date(l.zeitstempel).toLocaleString('de'):'-'}</td><td><strong>${l.aktion}</strong></td><td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.details||'-'}</td><td>${l.benutzer||'-'}</td></tr>`).join('')}
        </tbody></table>
      </div></div>`;
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
