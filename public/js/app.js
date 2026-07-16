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
    t.innerHTML = `<i class="fas fa-${type==='success'?'check-circle':'exclamation-triangle'}"></i> ${msg}`;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  },

  go(p) { this.page = p; this.render(); },

  loginPage() {
    document.getElementById('app').innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="brand"><div class="ico"><i class="fas fa-warehouse"></i></div><span>Highspeed Kurier</span></div>
          <p class="sub">Lagerverwaltung</p>
          <form id="lf">
            <div class="field"><label>Benutzername</label><input id="lu" placeholder="Benutzername" autofocus></div>
            <div class="field"><label>Passwort</label><input id="lp" type="password" placeholder="Passwort"></div>
            <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;padding:11px">Anmelden</button>
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

  render() {
    const nav = [
      {section:'Übersicht'},
      {id:'dashboard',icon:'fa-th-large',label:'Dashboard'},
      {id:'suche',icon:'fa-search',label:'Suche'},
      {section:'Lager'},
      {id:'einlagern',icon:'fa-arrow-down',label:'Einlagern'},
      {id:'auslagern',icon:'fa-arrow-up',label:'Auslagern'},
      {id:'lagerplan',icon:'fa-map',label:'Lagerplan'},
      {section:'Auswertung'},
      {id:'berichte',icon:'fa-chart-bar',label:'Berichte'},
      {id:'protokoll',icon:'fa-list',label:'Protokoll'},
    ];

    document.getElementById('app').innerHTML = `
      <div class="app-layout">
        <nav class="sidebar">
          <div class="sidebar-brand"><div class="logo">HS</div><span>Highspeed Kurier</span></div>
          <div class="sidebar-nav">
            ${nav.map(n => n.section
              ? `<div class="nav-section">${n.section}</div>`
              : `<div class="nav-item ${n.id===this.page?'active':''}" data-p="${n.id}"><i class="fas ${n.icon}"></i>${n.label}</div>`
            ).join('')}
          </div>
          <div class="sidebar-footer">
            <div class="nav-item" id="logout-btn"><i class="fas fa-sign-out-alt"></i>Abmelden</div>
          </div>
        </nav>
        <main class="main" id="content"></main>
      </div>`;

    document.querySelectorAll('.nav-item[data-p]').forEach(el => { el.onclick = () => this.go(el.dataset.p); });
    document.getElementById('logout-btn').onclick = async() => { await this.api('/api/auth/logout',{method:'POST'}); this.user=null; this.loginPage(); };
    this.loadPage();
  },

  async loadPage() {
    const el = document.getElementById('content');
    switch(this.page) {
      case 'dashboard': return this.pgDash(el);
      case 'suche': return this.pgSuche(el);
      case 'einlagern': return this.pgEinlagern(el);
      case 'auslagern': return this.pgAuslagern(el);
      case 'lagerplan': return this.pgLagerplan(el);
      case 'berichte': return this.pgBerichte(el);
      case 'protokoll': return this.pgProtokoll(el);
    }
  },

  // ═══════ DASHBOARD ═══════
  async pgDash(el) {
    const [stats, bereiche] = await Promise.all([
      this.api('/api/dashboard/stats'),
      this.api('/api/dashboard/belegung-bereiche')
    ]);
    if (!stats) { el.innerHTML = '<p>Fehler beim Laden</p>'; return; }

    const pct = stats.belegungProzent;
    const lvl = pct > 90 ? 'high' : pct > 70 ? 'mid' : 'low';

    el.innerHTML = `
      <div class="page-header">
        <h1>Dashboard</h1>
        <div class="meta"><span>${new Date().toLocaleDateString('de-DE',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</span><div class="avatar">${(this.user?.vollname||'?')[0]}</div></div>
      </div>

      <div class="stats-row">
        <div class="stat-card"><div class="stat-icon crit"><i class="fas fa-tachometer-alt"></i></div><div><div class="stat-val">${pct}%</div><div class="stat-label">Auslastung</div></div></div>
        <div class="stat-card"><div class="stat-icon warn"><i class="fas fa-pallet"></i></div><div><div class="stat-val">${stats.totalPlaetze.toLocaleString('de')}</div><div class="stat-label">Plätze gesamt</div></div></div>
        <div class="stat-card"><div class="stat-icon ok"><i class="fas fa-check"></i></div><div><div class="stat-val">${stats.freiePlaetze}</div><div class="stat-label">Frei verfügbar</div></div></div>
        <div class="stat-card"><div class="stat-icon info"><i class="fas fa-file-alt"></i></div><div><div class="stat-val">${stats.kontingent?.kontingent_plaetze||642}</div><div class="stat-label">Kontingent PPH</div></div></div>
      </div>

      <div class="capacity">
        <div class="capacity-top"><h3>Gesamtbelegung</h3><span class="val ${lvl}">${pct}%</span></div>
        <div class="bar"><div class="bar-fill ${lvl}" style="width:${pct}%"></div></div>
        <div class="capacity-info"><span>${stats.belegtePlaetze.toLocaleString('de')} belegt</span><span>${stats.freiePlaetze} frei von ${stats.totalPlaetze.toLocaleString('de')}</span></div>
      </div>

      <div class="quick-grid">
        <div class="q-card" data-p="suche"><i class="fas fa-search"></i><h4>EB-Nr. suchen</h4><p>Palette lokalisieren</p></div>
        <div class="q-card" data-p="einlagern"><i class="fas fa-arrow-down"></i><h4>Einlagern</h4><p>Neue Palette</p></div>
        <div class="q-card" data-p="auslagern"><i class="fas fa-arrow-up"></i><h4>Auslagern</h4><p>Beleg erstellen</p></div>
        <div class="q-card" data-p="lagerplan"><i class="fas fa-map"></i><h4>Lagerplan</h4><p>Belegung</p></div>
        <div class="q-card" data-p="berichte"><i class="fas fa-chart-bar"></i><h4>Berichte</h4><p>Kontingent</p></div>
        <div class="q-card" data-p="protokoll"><i class="fas fa-list"></i><h4>Protokoll</h4><p>Verlauf</p></div>
      </div>

      ${bereiche?.length?`<div class="card"><div class="card-h"><h3>Belegung nach Bereich</h3></div><div class="card-b"><div class="bereich-grid">
        ${bereiche.map(b => {
          const p = Math.round(b.belegt/b.gesamt*100);
          const c = p>95?'var(--danger)':p>80?'var(--accent)':'var(--success)';
          return `<div class="bereich-card"><h4>${b.bereich}</h4><div class="mini-bar"><div class="mini-fill" style="width:${p}%;background:${c}"></div></div><div class="nums"><span>${b.belegt}/${b.gesamt}</span><span>${p}%</span></div></div>`;
        }).join('')}
      </div></div></div>`:''}
    `;
    el.querySelectorAll('.q-card[data-p]').forEach(c => { c.onclick = () => this.go(c.dataset.p); });
  },

  // ═══════ SUCHE ═══════
  async pgSuche(el) {
    el.innerHTML = `
      <div class="page-header"><h1>Suche</h1></div>
      <div class="search-box"><i class="fas fa-search ico"></i><input id="si" placeholder="EB-Nummer, Lagerplatz oder Kunde..." autofocus></div>
      <div id="sr"></div>`;
    let timer;
    document.getElementById('si').oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(async() => {
        const q = document.getElementById('si').value.trim();
        if (!q) { document.getElementById('sr').innerHTML = ''; return; }
        const r = await this.api(`/api/paletten/suche?q=${encodeURIComponent(q)}`);
        if (!r?.length) { document.getElementById('sr').innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted)">Keine Treffer für "${q}"</div>`; return; }
        document.getElementById('sr').innerHTML = `<div class="card"><div class="card-h"><h3>${r.length} Ergebnis${r.length>1?'se':''}</h3></div><div style="overflow-x:auto"><table class="tbl"><thead><tr><th>EB-Nr.</th><th>Platz</th><th>Kunde</th><th>Datum</th><th></th></tr></thead><tbody>${r.map(p=>`<tr><td><span class="eb">${p.eb_nummer}</span></td><td><span class="loc">${p.lagerplatz_bez||p.lagerplatz_bezeichnung||'-'}</span></td><td>${p.kunde_name||'-'}</td><td>${p.eingelagert_am?new Date(p.eingelagert_am).toLocaleDateString('de'):'-'}</td><td><button class="btn btn-sm btn-outline" onclick="App.detail(${p.id})"><i class="fas fa-eye"></i></button></td></tr>`).join('')}</tbody></table></div></div>`;
      }, 250);
    };
  },

  async detail(id) {
    const p = await this.api(`/api/paletten/${id}`);
    if (!p) return;
    const d = document.createElement('div');
    d.className = 'modal-bg';
    d.innerHTML = `<div class="modal-box"><div class="modal-top"><h3>Palette ${p.eb_nummer}</h3><button class="modal-close" onclick="this.closest('.modal-bg').remove()">&times;</button></div><div class="modal-body">
      <div class="field-row"><div class="field"><label>EB-Nummer</label><input value="${p.eb_nummer}" readonly></div><div class="field"><label>Lagerplatz</label><input value="${p.lagerplatz_bezeichnung||'-'}" readonly></div></div>
      <div class="field-row"><div class="field"><label>Kunde</label><input value="${p.kunde_name||'Panpharma'}" readonly></div><div class="field"><label>Eingelagert</label><input value="${p.eingelagert_am?new Date(p.eingelagert_am).toLocaleDateString('de'):'-'}" readonly></div></div>
    </div><div class="modal-footer"><button class="btn btn-primary" onclick="window.open('/api/berichte/auslagerungsbeleg?eb=${p.eb_nummer}&platz=${encodeURIComponent(p.lagerplatz_bezeichnung||'')}&kunde=${encodeURIComponent(p.kunde_name||'Panpharma')}');this.closest('.modal-bg').remove()"><i class="fas fa-file-pdf"></i> Auslagerungsbeleg</button></div></div>`;
    document.body.appendChild(d);
    d.onclick = (e) => { if(e.target===d) d.remove(); };
  },

  // ═══════ EINLAGERN ═══════
  async pgEinlagern(el) {
    const freie = await this.api('/api/lagerplaetze?belegt=0&limit=50');
    el.innerHTML = `
      <div class="page-header"><h1>Einlagern</h1></div>
      <div class="two-col">
        <div class="card"><div class="card-h"><h3>Neue Palette</h3></div><div class="card-b">
          <form id="ef">
            <div class="field-row"><div class="field"><label>EB-Nummer *</label><input id="e-eb" placeholder="z.B. 655564" required></div><div class="field"><label>Lagerplatz *</label><input id="e-pl" placeholder="z.B. C12" required></div></div>
            <div class="field-row"><div class="field"><label>Artikel-Nr.</label><input id="e-art"></div><div class="field"><label>Chargen-Nr.</label><input id="e-ch"></div></div>
            <div class="field"><label>Bemerkung</label><input id="e-bem"></div>
            <button type="submit" class="btn btn-primary"><i class="fas fa-check"></i> Einlagern</button>
          </form>
        </div></div>
        <div class="card"><div class="card-h"><h3>Freie Plätze</h3><span style="font-size:12px;color:var(--text-muted)">${freie?.length||0} verfügbar</span></div><div style="max-height:380px;overflow-y:auto">
          <table class="tbl"><thead><tr><th>Platz</th><th>Regal</th><th>Ebene</th></tr></thead><tbody>
          ${(freie||[]).map(f=>`<tr style="cursor:pointer" onclick="document.getElementById('e-pl').value='${f.bezeichnung}'"><td><span class="loc">${f.bezeichnung}</span></td><td>${f.regal}</td><td>${f.ebene}</td></tr>`).join('')}
          </tbody></table>
        </div></div>
      </div>`;
    document.getElementById('ef').onsubmit = async(e) => {
      e.preventDefault();
      const r = await this.api('/api/einlagerung', { method:'POST', body: JSON.stringify({ eb_nummer:document.getElementById('e-eb').value.trim(), lagerplatz:document.getElementById('e-pl').value.trim(), artikel_nr:document.getElementById('e-art').value.trim(), chargen_nr:document.getElementById('e-ch').value.trim(), bemerkung:document.getElementById('e-bem').value.trim() })});
      if (r?.success) { this.toast('Eingelagert: '+r.lagerplatz,'success'); this.pgEinlagern(el); }
      else this.toast(r?.error||'Fehler','error');
    };
  },

  // ═══════ AUSLAGERN ═══════
  async pgAuslagern(el) {
    const abruf = await this.api('/api/bewegungen/abrufliste');
    el.innerHTML = `
      <div class="page-header"><h1>Auslagern</h1><button class="btn btn-primary" onclick="App.neuerAbruf()"><i class="fas fa-plus"></i> Neuer Abruf</button></div>
      <div class="card"><div class="card-h"><h3>Abrufliste</h3><span style="font-size:12px;color:var(--text-muted)">${abruf?.length||0} Positionen</span><button class="btn btn-sm btn-dark" onclick="window.open('/api/berichte/abrufbeleg')"><i class="fas fa-print"></i> Beleg</button></div><div style="overflow-x:auto">
        ${abruf?.length?`<table class="tbl"><thead><tr><th>#</th><th>EB-Nr.</th><th>Platz</th><th>LKW</th></tr></thead><tbody>${abruf.map(a=>`<tr><td>${a.lfd_nummer||'-'}</td><td><span class="eb">${a.eb_nummer}</span></td><td><span class="loc">${a.lagerplatz||'-'}</span></td><td>${a.lkw||'-'}</td></tr>`).join('')}</tbody></table>`:`<div style="padding:32px;text-align:center;color:var(--text-muted)">Keine offenen Abrufe</div>`}
      </div></div>`;
  },

  neuerAbruf() {
    const d = document.createElement('div');
    d.className = 'modal-bg';
    d.innerHTML = `<div class="modal-box"><div class="modal-top"><h3>Palette auslagern</h3><button class="modal-close" onclick="this.closest('.modal-bg').remove()">&times;</button></div><div class="modal-body">
      <form id="af"><div class="field"><label>EB-Nummer</label><input id="a-eb" placeholder="EB-Nummer" required autofocus></div><div class="field"><label>Bemerkung</label><input id="a-bem"></div>
      <div style="display:flex;gap:8px"><button type="submit" class="btn btn-primary"><i class="fas fa-arrow-up"></i> Auslagern</button><button type="button" class="btn btn-dark" onclick="const eb=document.getElementById('a-eb').value;if(eb)window.open('/api/berichte/auslagerungsbeleg?eb='+eb)"><i class="fas fa-file-pdf"></i> Beleg</button></div></form>
    </div></div>`;
    document.body.appendChild(d);
    d.onclick = (e) => { if(e.target===d) d.remove(); };
    document.getElementById('af').onsubmit = async(e) => {
      e.preventDefault();
      const eb = document.getElementById('a-eb').value.trim();
      const r = await this.api('/api/auslagerung', { method:'POST', body: JSON.stringify({ eb_nummer:eb, bemerkung:document.getElementById('a-bem').value.trim() })});
      if (r?.success) { document.querySelector('.modal-bg').remove(); this.toast(`${eb} ausgelagert`,'success'); this.pgAuslagern(document.getElementById('content')); }
      else this.toast(r?.error||'Nicht gefunden','error');
    };
  },

  // ═══════ LAGERPLAN ═══════
  async pgLagerplan(el) {
    const bereiche = await this.api('/api/dashboard/belegung-bereiche');
    const regale = ['A','B','C','D','E','F'];
    
    el.innerHTML = `
      <div class="page-header"><h1>Lagerplan</h1></div>
      <div class="stats-row">
        ${(bereiche||[]).filter(b=>b.bereich.startsWith('Regal')).map(b => {
          const p = Math.round(b.belegt/b.gesamt*100);
          const cls = p>95?'crit':p>80?'warn':'ok';
          return `<div class="stat-card"><div class="stat-icon ${cls}"><i class="fas fa-grip-vertical"></i></div><div><div class="stat-val">${p}%</div><div class="stat-label">${b.bereich} (${b.belegt}/${b.gesamt})</div></div></div>`;
        }).join('')}
      </div>
      <div class="card" style="margin-bottom:16px"><div class="card-h"><h3>Regal auswählen</h3></div><div class="card-b" style="display:flex;gap:8px;flex-wrap:wrap">
        ${regale.map(r=>`<button class="btn btn-outline regal-btn" data-r="${r}" style="min-width:60px">Regal ${r}</button>`).join('')}
        <button class="btn btn-outline regal-btn" data-r="Block" style="min-width:80px">Blocklager</button>
      </div></div>
      <div id="lp-grid"></div>
    `;
    el.querySelectorAll('.regal-btn').forEach(b => {
      b.onclick = () => {
        el.querySelectorAll('.regal-btn').forEach(x=>x.classList.remove('btn-primary','btn-outline'));
        b.classList.remove('btn-outline'); b.classList.add('btn-primary');
        this.loadRegalGrid(b.dataset.r);
      };
    });
    el.querySelector('.regal-btn').click();
  },

  async loadRegalGrid(regal) {
    const grid = document.getElementById('lp-grid');
    grid.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Laden...</div>';
    
    let data;
    if (regal === 'Block') {
      data = await this.api('/api/lagerplaetze?bereich=Blocklager Halle 1&limit=300');
      const data2 = await this.api('/api/lagerplaetze?bereich=Blocklager Halle 2&limit=300');
      if (data2) data = (data||[]).concat(data2);
    } else {
      data = await this.api(`/api/lagerplaetze?regal=${regal}&limit=500`);
    }
    if (!data||!data.length) { grid.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Keine Plätze</div>'; return; }

    const positions = {};
    for (const p of data) {
      const key = p.position;
      if (!positions[key]) positions[key] = [];
      positions[key].push(p);
    }

    const posKeys = Object.keys(positions).map(Number).sort((a,b)=>a-b);
    const belegt = data.filter(d=>d.belegt).length;
    const frei = data.length - belegt;
    const pct = Math.round(belegt/data.length*100);

    grid.innerHTML = `
      <div class="card"><div class="card-h"><h3>${regal==='Block'?'Blocklager':'Regal '+regal}</h3><span style="font-size:12px;color:var(--text-muted)">${belegt} belegt / ${frei} frei (${pct}%)</span></div>
      <div class="card-b">
        <div style="display:flex;gap:6px;margin-bottom:12px;font-size:11px;color:var(--text-muted)">
          <span><span style="display:inline-block;width:12px;height:12px;background:var(--danger);border-radius:3px;vertical-align:middle"></span> Belegt (EB)</span>
          <span><span style="display:inline-block;width:12px;height:12px;background:var(--accent);border-radius:3px;vertical-align:middle"></span> Belegt (ohne EB)</span>
          <span><span style="display:inline-block;width:12px;height:12px;background:var(--success);border-radius:3px;vertical-align:middle"></span> Frei</span>
        </div>
        <div class="lp-visual" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(36px,1fr));gap:3px;">
          ${posKeys.map(pos => {
            const slots = positions[pos];
            return slots.map(s => {
              let color = 'var(--success)';
              let title = s.bezeichnung + ' – FREI';
              if (s.belegt && s.eb_nummer) { color = '#c0392b'; title = s.bezeichnung + ' – ' + s.eb_nummer; }
              else if (s.belegt) { color = 'var(--accent)'; title = s.bezeichnung + ' – belegt'; }
              return `<div class="lp-cell" data-id="${s.id}" style="width:100%;aspect-ratio:1;background:${color};border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:600;opacity:0.9;transition:opacity 0.1s" title="${title}">${s.position}${s.unter_position||''}</div>`;
            }).join('');
          }).join('')}
        </div>
      </div></div>
    `;

    grid.querySelectorAll('.lp-cell').forEach(cell => {
      cell.onmouseenter = () => cell.style.opacity='1';
      cell.onmouseleave = () => cell.style.opacity='0.9';
      cell.onclick = () => this.showPlatzDetail(parseInt(cell.dataset.id));
    });
  },

  async showPlatzDetail(id) {
    const resp = await this.api(`/api/lagerplaetze/${id}`);
    if (!resp) return;
    const platz = resp;

    let content = `
      <div class="field-row"><div class="field"><label>Platz</label><input value="${platz.bezeichnung}" readonly></div><div class="field"><label>Regal / Bereich</label><input value="${platz.bereich}" readonly></div></div>
      <div class="field-row"><div class="field"><label>Ebene</label><input value="${platz.ebene}" readonly></div><div class="field"><label>Status</label><input value="${platz.belegt?'Belegt':'Frei'}" readonly></div></div>
    `;

    if (platz.eb_nummer) {
      content += `<div class="field-row"><div class="field"><label>EB-Nummer</label><input value="${platz.eb_nummer}" readonly style="font-weight:700;background:#fef9e7"></div><div class="field"><label>Kunde</label><input value="${platz.kunde_name||'Panpharma'}" readonly></div></div>`;
      
      const paletten = await this.api(`/api/paletten/suche?q=${platz.eb_nummer}`);
      const pal = paletten?.[0];
      if (pal?.artikel_nr) content += `<div class="field"><label>Artikel-Nr.</label><input value="${pal.artikel_nr}" readonly></div>`;
      if (pal?.chargen_nr) content += `<div class="field"><label>Chargen-Nr.</label><input value="${pal.chargen_nr}" readonly></div>`;
      if (pal?.eingelagert_am) content += `<div class="field"><label>Eingelagert am</label><input value="${new Date(pal.eingelagert_am).toLocaleDateString('de')}" readonly></div>`;
    }

    const d = document.createElement('div');
    d.className = 'modal-bg';
    d.innerHTML = `<div class="modal-box"><div class="modal-top"><h3>Platz ${platz.bezeichnung}</h3><button class="modal-close" onclick="this.closest('.modal-bg').remove()">&times;</button></div><div class="modal-body">${content}</div>
    ${platz.eb_nummer?`<div class="modal-footer"><button class="btn btn-primary" onclick="window.open('/api/berichte/auslagerungsbeleg?eb=${platz.eb_nummer}&platz=${encodeURIComponent(platz.bezeichnung)}&kunde=${encodeURIComponent(platz.kunde_name||'Panpharma')}');this.closest('.modal-bg').remove()"><i class="fas fa-file-pdf"></i> Auslagerungsbeleg</button></div>`:''}</div>`;
    document.body.appendChild(d);
    d.onclick = (e) => { if(e.target===d) d.remove(); };
  },

  // ═══════ BERICHTE ═══════
  async pgBerichte(el) {
    const [stats, kont] = await Promise.all([
      this.api('/api/dashboard/stats'),
      this.api('/api/dashboard/kontingent-verlauf')
    ]);
    el.innerHTML = `
      <div class="page-header"><h1>Berichte</h1></div>
      <div class="stats-row">
        <div class="stat-card"><div class="stat-icon info"><i class="fas fa-file-alt"></i></div><div><div class="stat-val">${stats?.kontingent?.kontingent_plaetze||642}</div><div class="stat-label">Kontingent</div></div></div>
        <div class="stat-card"><div class="stat-icon warn"><i class="fas fa-warehouse"></i></div><div><div class="stat-val">${stats?.kontingent?.lagerbestand||'-'}</div><div class="stat-label">Bestand</div></div></div>
        <div class="stat-card"><div class="stat-icon ok"><i class="fas fa-plus"></i></div><div><div class="stat-val">${stats?.kontingent?.verfuegbar||'-'}</div><div class="stat-label">Verfügbar</div></div></div>
        <div class="stat-card"><div class="stat-icon crit"><i class="fas fa-exchange-alt"></i></div><div><div class="stat-val">${stats?.kontingent?.bewegungen_gesamt||'-'}</div><div class="stat-label">Bewegungen</div></div></div>
      </div>
      <div class="card"><div class="card-h"><h3>Kontingent-Verlauf</h3></div><div style="overflow-x:auto;max-height:450px;overflow-y:auto">
        ${kont?.length?`<table class="tbl"><thead><tr><th>Monat</th><th>Bestand</th><th>Kontingent</th><th>Einlag.</th><th>Auslag.</th><th>Bew.</th></tr></thead><tbody>${kont.slice().reverse().map(k=>`<tr><td><strong>${k.monat}</strong></td><td>${k.lagerbestand||'-'}</td><td>${k.kontingent_plaetze||'-'}</td><td>${k.einlagerungen||'-'}</td><td>${k.auslagerungen||'-'}</td><td>${k.bewegungen_gesamt||'-'}</td></tr>`).join('')}</tbody></table>`:'<p style="padding:20px;color:var(--text-muted)">Keine Daten</p>'}
      </div></div>`;
  },

  // ═══════ PROTOKOLL ═══════
  async pgProtokoll(el) {
    const data = await this.api('/api/protokoll?limit=100');
    const log = data?.rows || data || [];
    el.innerHTML = `
      <div class="page-header"><h1>Protokoll</h1></div>
      <div class="card"><div style="overflow-x:auto;max-height:600px;overflow-y:auto">
        <table class="tbl"><thead><tr><th>Zeit</th><th>Aktion</th><th>Details</th><th>Benutzer</th></tr></thead><tbody>
        ${log.map(l=>`<tr><td style="white-space:nowrap;font-size:12px">${l.zeitstempel?new Date(l.zeitstempel).toLocaleString('de'):'-'}</td><td><strong>${l.aktion}</strong></td><td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.details||'-'}</td><td>${l.benutzer||'-'}</td></tr>`).join('')}
        </tbody></table>
      </div></div>`;
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
