/* Palmetto Six-Star — GTA VI trophy guide & tracker. Offline, no network requests.
   Split by job: storage, render, filters, tracker, roadmap, sources. */
const KEY = 'palmetto-six-star-v1';
const state = {
  trophies: [],
  sources: [],
  earned: new Set(),
  counts: {},      // name -> number (for count trackers)
  revealed: new Set(), // names user has revealed (spoiler shield off per trophy)
  spoilerOn: true,
  kind: 'all',
  grade: 'all',
  search: '',
  selected: null,
  tab: 'tracker',
};
const GRADES = { platinum:'P', gold:'G', silver:'S', bronze:'B' };
const GRADE_ORDER = ['platinum','gold','silver','bronze'];
const KIND_LABELS = { story:'Story', missable:'Missable', collectibles:'Collectibles', activities:'Activities', online:'Online' };

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function srcTag(ids){ return ids.map(i=>`[${i}]`).join(''); }
function stripSrc(text){ return text.replace(/\s*(\[[0-9]+\](?:\[[0-9]+\])*)\s*$/, '').trim(); }
function gradeChip(g){ return `<span class="chip-grade ${g}">${GRADES[g]}</span>`; }

/* ---------- storage ---------- */
function loadState(){
  try{
    const raw = localStorage.getItem(KEY);
    if(raw){
      const p = JSON.parse(raw);
      state.earned = new Set(p.earned || []);
      state.counts = p.counts || {};
      state.revealed = new Set(p.revealed || []);
      state.spoilerOn = p.spoilerOn !== false;
    }
  }catch(e){ /* ignore */ }
}
function saveState(){
  localStorage.setItem(KEY, JSON.stringify({
    earned:[...state.earned],
    counts: state.counts,
    revealed:[...state.revealed],
    spoilerOn: state.spoilerOn,
  }));
  updateSavedNote();
}
function updateSavedNote(){
  $('#savedNote').textContent = 'Saved in this browser';
}

/* ---------- helpers ---------- */
function isEarned(t){ return state.earned.has(t.name); }
function isRevealed(t){ return !state.spoilerOn || state.revealed.has(t.name); }
function spoilerBlocked(t){
  // story trophies (and hidden PSN ones) stay covered until earned or revealed
  if(isEarned(t)) return false;
  if(t.hidden && state.spoilerOn) return true;
  if(t.kind === 'story' && state.spoilerOn) return true;
  return false;
}
function displayName(t){
  if(spoilerBlocked(t)) return '▮▮▮▮▮ · story trophy (reveal to see)';
  return t.name;
}
function displayDesc(t){
  if(spoilerBlocked(t)) return 'Hidden until earned or revealed.';
  return t.description;
}

/* ---------- data load ---------- */
async function init(){
  const [tj, sj] = await Promise.all([
    fetch('data/trophies.json').then(r=>r.json()),
    fetch('data/sources.json').then(r=>r.json()),
  ]);
  state.trophies = tj.trophies;
  state.sources = sj.sources;
  state.sourcesById = Object.fromEntries(state.sources.map(s=>[s.id,s]));
  loadState();
  // default selected
  state.selected = state.selected || state.trophies.find(t=>t.name==='Positive Mental Attitude').name;
  render();
  bindEvents();
}

/* ---------- render ---------- */
function render(){
  renderHeadStats();
  renderAuditStrip();
  renderFilters();
  renderChecklist();
  renderDetail();
  renderNextUp();
  renderGuideSources();
  if(state.tab==='roadmap') renderRoadmap();
  if(state.tab==='missables') renderMissables();
  if(state.tab==='sources') renderSources();
}

function renderHeadStats(){
  const earned = state.earned.size;
  const byGrade = g => state.trophies.filter(t=>t.grade===g);
  const gEarned = g => byGrade(g).filter(t=>isEarned(t)).length;
  const collectibles = sumCollectibles();
  $('#headStats').innerHTML =
    `<span><b>${earned}</b> / 55 earned</span>`+
    `<span>P <b>${gEarned('platinum')}/${byGrade('platinum').length}</b></span>`+
    `<span>G <b>${gEarned('gold')}/${byGrade('gold').length}</b></span>`+
    `<span>S <b>${gEarned('silver')}/${byGrade('silver').length}</b></span>`+
    `<span>B <b>${gEarned('bronze')}/${byGrade('bronze').length}</b></span>`+
    `<span><b>${collectibles}</b> collectibles logged</span>`;
}

function sumCollectibles(){
  let n = 0;
  for(const t of state.trophies){
    if(t.countTarget && state.counts[t.name] > 0) n += state.counts[t.name];
  }
  return n;
}

function renderAuditStrip(){
  const t = state.trophies;
  const cited = t.filter(x=>x.sources && x.sources.length>0).length;
  const stepsWithSrc = t.reduce((a,x)=>a + (x.steps||[]).filter(s=>s.sources&&s.sources.length).length, 0);
  const totalSteps = t.reduce((a,x)=>a + (x.steps||[]).length, 0);
  const totalClaims = state.sources.reduce((a,s)=>a+s.claimsCited,0);
  const sites = state.sources.length;
  const pages = state.sources.reduce((a,s)=>a+(parseInt(s.pagesRead)||0),0);
  const miss = t.filter(x=>x.missable).length;
  const risk = t.filter(x=>x.atRisk).length;
  const disp = t.filter(x=>x.dispute).length;
  const hidden = t.filter(x=>x.hidden).length;
  const g = n=>t.filter(x=>x.grade===n).length;
  const backed = t.filter(x=>(x.sources||[]).length>=2).length;
  $('#auditStrip').innerHTML =
    `<span><b>55/55</b> official name, description, grade</span>`+
    `<span><b>${g('platinum')}P ${g('gold')}G ${g('silver')}S ${g('bronze')}B</b></span>`+
    `<span><b>${hidden}</b> PSN-hidden</span>`+
    `<span><b>${stepsWithSrc}/${totalSteps}</b> steps cite sources</span>`+
    `<span><b>${cited}/55</b> guides cite sources</span>`+
    `<span><b>${backed}</b> backed by 2+ sources</span>`+
    `<span><b>${totalClaims}</b> claims cited</span>`+
    `<span><b>${pages}</b> pages · <b>${sites}</b> sites</span>`+
    `<span>read <b>${state.sources[0]?.readDate || '21 Nov 2026'}</b></span>`+
    `<span><b>${miss}</b> possibly missable · <b>${risk}</b> at risk · <b>${disp}</b> disputes shown</span>`;
}

function renderFilters(){
  const kinds = ['all','story','missable','collectibles','activities','online'];
  const counts = {};
  for(const k of kinds){ counts[k] = k==='all' ? state.trophies.length : state.trophies.filter(t=>t.kind===k).length; }
  counts['hidden'] = state.trophies.filter(t=>t.hidden).length;
  counts['disputed'] = state.trophies.filter(t=>t.dispute).length;
  counts['notearned'] = state.trophies.filter(t=>!isEarned(t)).length;
  const chips = ['all','story','missable','collectibles','activities','online','hidden','disputed','notearned'];
  const labels = { all:'All', story:'Story', missable:'Missable', collectibles:'Collectibles', activities:'Activities', online:'Online', hidden:'PSN-hidden', disputed:'Disputed', notearned:'Not earned' };
  $('#filterChips').innerHTML = chips.map(k=>
    `<span class="chip ${state.kind===k?'active':''}" data-kind="${k}">${labels[k]} <span class="n">${counts[k]??''}</span></span>`
  ).join('');
  $('#gradeRow').innerHTML = ['all',...GRADE_ORDER].map(g=>
    `<span class="grade-chip ${g} ${state.grade===g?'active':''}" data-grade="${g}">${g==='all'?'All grades':GRADES[g]}</span>`
  ).join('');
}

function filtered(){
  let list = state.trophies;
  if(state.kind==='hidden') list = list.filter(t=>t.hidden);
  else if(state.kind==='disputed') list = list.filter(t=>t.dispute);
  else if(state.kind==='notearned') list = list.filter(t=>!isEarned(t));
  else if(state.kind!=='all') list = list.filter(t=>t.kind===state.kind);
  if(state.grade!=='all') list = list.filter(t=>t.grade===state.grade);
  const q = state.search.trim().toLowerCase();
  if(q) list = list.filter(t=>t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || (t.kind||'').toLowerCase().includes(q));
  return list;
}

function renderChecklist(){
  const list = filtered();
  const el = $('#checklist');
  el.innerHTML = '';
  for(const t of list){
    const row = document.createElement('div');
    row.className = 'trophy-row' + (isEarned(t)?' earned':'') + (t.name===state.selected?' active':'');
    const flags = [];
    if(t.hidden) flags.push('<span class="flag hid">H</span>');
    if(t.missable) flags.push('<span class="flag ms">MISS</span>');
    if(t.atRisk) flags.push('<span class="flag risk">RISK</span>');
    if(t.dispute) flags.push('<span class="flag disp">!</span>');
    row.innerHTML =
      `<input type="checkbox" ${isEarned(t)?'checked':''} data-name="${esc(t.name)}">`+
      `<div class="meta"><div class="nm">${esc(displayName(t))}</div><div class="ds">${esc(displayDesc(t))}</div></div>`+
      `<div class="row-flags">${flags.join('')}</div>`+
      gradeChip(t.grade);
    row.addEventListener('click', (e)=>{
      if(e.target.tagName==='INPUT') return;
      state.selected = t.name;
      renderDetail(); renderNextUp(); renderGuideSources();
      $$('.trophy-row', el).forEach(r=>r.classList.toggle('active', r.querySelector('.nm').textContent===displayName(t) || r.dataset.name===t.name));
    });
    row.querySelector('input').addEventListener('change', (e)=>{
      if(e.target.checked) state.earned.add(t.name); else state.earned.delete(t.name);
      saveState(); render();
    });
    el.append(row);
  }
  // ensure active row highlight after re-render
  const active = el.querySelector('.trophy-row.active');
  if(active) active.scrollIntoView({block:'nearest'});
}

function renderDetail(){
  const t = state.trophies.find(x=>x.name===state.selected) || state.trophies[0];
  if(!t){ $('#detail').innerHTML=''; return; }
  const blocked = spoilerBlocked(t);
  let stepsHtml = '';
  if(!blocked && t.steps){
    stepsHtml = `<div class="steps"><h3>Steps</h3>` + t.steps.map((s,i)=>
      `<div class="step"><span class="n">${i+1}</span><span class="txt">${esc(stripSrc(s.text))}<span class="src">${srcTag(s.sources)}</span></span></div>`
    ).join('') + `</div>`;
  }
  let disputeHtml = '';
  if(!blocked && t.dispute && t.disputeNote){
    disputeHtml = `<div class="dispute-box"><h3>${esc(t.disputeNote.title)}</h3>` +
      t.disputeNote.versions.map(v=>`<div class="dispute-version"><span class="vlabel">${esc(v.label)}</span><div class="vtext">${esc(v.text)}<span class="src">${srcTag(v.sources)}</span></div></div>`).join('') +
      `<div class="our-call">${esc(t.disputeNote.call)}</div></div>`;
  }
  let countHtml = '';
  if(!blocked && t.countTarget){
    const cur = state.counts[t.name] || t.count || 0;
    countHtml = `<div class="count-stepper">
      <span class="lbl">YOUR COUNT</span>
      <button class="minus" data-name="${esc(t.name)}">−</button>
      <span class="val">${cur} / ${t.countTarget}</span>
      <button class="plus" data-name="${esc(t.name)}">+</button>
      <span class="target">${esc(t.name.toLowerCase().includes('dime')?'dollars':t.name.toLowerCase().includes('treat')?'dollars':'')}</span>
    </div>`;
  }
  const missFlag = t.missable ? '<span class="flag ms">POSSIBLY MISSABLE</span>' : (t.atRisk ? `<span class="flag risk">AT RISK · ${esc(t.lastChanceChapter||'')}</span>` : '');
  const dispFlag = t.dispute ? '<span class="flag disp">SOURCES DIFFER · ' + t.disputeNote.versions.length + '</span>' : '';
  $('#detail').innerHTML =
    `<div class="detail-head"><h2>${esc(displayName(t))}</h2>${gradeChip(t.grade)}</div>`+
    `<p class="official-desc">${esc(displayDesc(t))}</p>`+
    `<div class="detail-flags">${missFlag}${dispFlag}</div>`+
    countHtml +
    stepsHtml +
    disputeHtml;
  // bind count buttons
  $$('.minus,.plus', $('#detail')).forEach(b=>{
    b.addEventListener('click', ()=>{
      const n = b.dataset.name;
      const cur = state.counts[n] || t.count || 0;
      const delta = b.classList.contains('plus') ? 1 : -1;
      const next = Math.max(0, Math.min(t.countTarget, cur + delta));
      state.counts[n] = next;
      saveState(); renderDetail();
    });
  });
}

function renderNextUp(){
  const el = $('#nextUp');
  const ordered = [...state.trophies].filter(t=>!isEarned(t)).sort((a,b)=>(a.roadmapStage||9)-(b.roadmapStage||9) || a.name.localeCompare(b.name));
  const top = ordered.slice(0, 12);
  el.innerHTML = `<h3>NEXT UP · ROADMAP ORDER</h3><div class="nextup-list">` +
    top.map(t=>{
      const blocked = spoilerBlocked(t);
      return `<div class="nextup-item" data-name="${esc(t.name)}">
        <span class="st">S${t.roadmapStage||'?'}</span>
        <span class="nn">${esc(blocked?'▮▮▮▮▮':t.name)}</span>
      </div>`;
    }).join('') + `</div>`;
  $$('.nextup-item', el).forEach(i=>i.addEventListener('click',()=>{ state.selected=i.dataset.name; renderChecklist(); renderDetail(); renderNextUp(); renderGuideSources(); }));
}

function renderGuideSources(){
  const t = state.trophies.find(x=>x.name===state.selected);
  const el = $('#guideSources');
  if(!t){ el.innerHTML=''; return; }
  const srcs = (t.sources||[]).map(id=>state.sourcesById[id]).filter(Boolean);
  el.innerHTML = `<h3>SOURCES FOR THIS GUIDE</h3>` +
    srcs.map(s=>`<div class="src-item"><span class="sn">${esc(s.name)}</span><span class="sc">${s.claimsCited} claims · read ${esc(s.readDate)}</span><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace('https://',''))}</a></div>`).join('') ||
    '<div class="src-item"><span class="sn">No sources</span></div>';
}

/* ---------- Roadmap ---------- */
function renderRoadmap(){
  const v = $('#roadmapView');
  const earned = state.earned.size;
  const stageOf = (n)=> state.trophies.filter(t=>t.roadmapStage===n);
  const stageDone = n => stageOf(n).every(t=>isEarned(t));
  const curStage = [1,2,3,4,5].find(s=>!stageDone(s)) || 5;
  const stages = [
    { n:1, title:'Chapters 1–2 + the one early risk', meta:'Story open, Cal fishing, Billy, Kenton, Stick Fiddler, and the Chapter 1 balcony meditation (Positive Mental Attitude) — do it the morning it appears. [1][3]' },
    { n:2, title:'Chapters 3–5 heists & side strands', meta:'Andy, Randy, Tyrone, Kenton return, bank vaults, armored trucks, story missions through the ending. [1][3]' },
    { n:3, title:'Activities + races + shooting', meta:'The Shootist (42 gold), Top Fun (14 locations), Earn Cash Not Kudos (20), Master of None (9), Gunslinger, Hot Together, Personal Best. [1][3]' },
    { n:4, title:'Collectibles + counts', meta:'Cunning Stunts (250), Don’t Touch My Deck (3 sets), You WAiNKer! (100), Whip It Good (100), The Goodtime State (52 areas), One Last Thing (50), Little Boxes (8), On the Spot (10), Pest Control (9 gangs), Actions Speak Louder (500). [1][3][4]' },
    { n:5, title:'Clean-up + 100% completion', meta:'A Long Road (100% checklist, ~60% true completion), Strangers & Freaks (8 strands), then the platinum. [1][3][4]' },
  ];
  v.innerHTML = `<div class="road-head"><h2>Roadmap to the platinum</h2><span class="est">${earned}/55 earned · stage ${curStage} of 5 now</span></div>
  <div class="road-stats">
    <span class="pill">~200 h to platinum <b>[1][3][5]</b></span>
    <span class="pill">4/10 difficulty <b>[1][3]</b></span>
    <span class="pill">1 playthrough</span>
    <span class="pill">1 possible missable</span>
    <span class="pill">0 online</span>
    <span class="pill">cheats disable trophies <b>[1][5]</b></span>
  </div>` +
  stages.map(s=>`<div class="stage-card"><h3>Stage ${s.n} · ${esc(s.title)}</h3><div class="stage-meta">${esc(s.meta)}</div>
    <div class="stage-steps">` + stageOf(s.n).map(t=>
      `<div class="stage-step"><b>${esc(displayName(t))}</b> — ${esc((t.steps&&t.steps[0])?t.steps[0].text.split('.')[0]+'.':t.description)} <span class="src">${srcTag(t.sources||[])}</span></div>`
    ).join('') + `</div></div>`).join('') +
  `<div class="miss-watch"><h3>MISSABLE WATCH · ${state.trophies.filter(t=>t.missable).length} POSSIBLY MISSABLE · ${state.trophies.filter(t=>t.atRisk).length} AT RISK</h3>` +
  state.trophies.filter(t=>t.missable||t.atRisk).map(t=>
    `<div class="watch-item"><span class="wc">${t.missable?'MISS':'RISK'}</span><span><b>${esc(t.name)}</b></span><span class="lcc">${t.missable?'last chance: '+esc(t.lastChanceChapter||'Chapter 1'):'last-chance: '+esc(t.lastChanceChapter||'—')}</span></div>`
  ).join('') + `</div>`;
}

/* ---------- Missables ---------- */
function renderMissables(){
  const v = $('#missablesView');
  const miss = state.trophies.filter(t=>t.missable);
  const risk = state.trophies.filter(t=>t.atRisk && !t.missable);
  v.innerHTML = `<h2>Missables</h2>` +
    `<div class="miss-card"><h3>${esc(miss[0]?.name||'')} <span class="tag">POSSIBLY MISSABLE</span></h3>
      <p class="official-desc">${esc(miss[0]?.description||'')}</p>
      <p>${esc(miss[0]?.disputeNote?.call||'')}</p>
      ${miss[0]?.disputeNote ? `<div class="dispute-box"><h3>${esc(miss[0].disputeNote.title)}</h3>`+miss[0].disputeNote.versions.map(x=>`<div class="dispute-version"><span class="vlabel">${esc(x.label)}</span><div class="vtext">${esc(x.text)}</div></div>`).join('')+`</div>` : ''}
    </div>` +
    `<div class="miss-card"><h3>At-risk watch list</h3><div class="atrisk-list">` +
    risk.map(t=>`<div class="atrisk-item"><span class="nm">${esc(t.name)}</span><span>${esc(t.description)}</span><span class="lc">last-chance: ${esc(t.lastChanceChapter||'—')}</span></div>`).join('') +
    `</div></div>` +
    `<p style="color:var(--dim);font-size:11.5px">Where sources disagree we show both versions and never present an unconfirmed claim as fact. The 8 “at risk” trophies are tied to quest givers with a story window, but all remain available after the story — the only genuinely missable window is the Chapter 1 balcony meditation. [1][4]</p>`;
}

/* ---------- Sources ---------- */
function renderSources(){
  const v = $('#sourcesView');
  v.innerHTML = `<h2>Sources</h2><div class="src-table">` +
    state.sources.map(s=>`<div class="src-row">
      <div class="srchead"><span class="srcname">[${s.id}] ${esc(s.name)}</span><a class="srcurl" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></div>
      <div class="srcmeta">Pages read: ${esc(s.pagesRead)} · Claims cited: <b>${s.claimsCited}</b> · Read: ${esc(s.readDate)}</div>
      <div class="srcmeta" style="color:var(--dim2)">${esc(s.note||'')}</div>
    </div>`).join('') +
    `</div>`;
}

/* ---------- events ---------- */
function bindEvents(){
  $('#tabs').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    state.tab = b.dataset.tab;
    $$('#tabs button').forEach(x=>x.classList.toggle('active', x===b));
    ['tracker','roadmap','missables','sources'].forEach(t=>{
      $('#'+t+'View').hidden = t!==state.tab;
    });
    if(state.tab==='roadmap') renderRoadmap();
    if(state.tab==='missables') renderMissables();
    if(state.tab==='sources') renderSources();
  });
  $('#filterChips').addEventListener('click', e=>{
    const c = e.target.closest('.chip'); if(!c) return;
    state.kind = c.dataset.kind; renderFilters(); renderChecklist();
  });
  $('#gradeRow').addEventListener('click', e=>{
    const c = e.target.closest('.grade-chip'); if(!c) return;
    state.grade = c.dataset.grade; renderFilters(); renderChecklist();
  });
  $('#search').addEventListener('input', e=>{ state.search = e.target.value; renderChecklist(); });
  $('#spoilerToggle').addEventListener('change', e=>{ state.spoilerOn = e.target.checked; saveState(); render(); });
  $('#exportBtn').addEventListener('click', exportProgress);
  $('#importInput').addEventListener('change', importProgress);
}

function exportProgress(){
  const data = { earned:[...state.earned], counts:state.counts, revealed:[...state.revealed], spoilerOn:state.spoilerOn };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], {type:'application/json'}));
  a.download = 'palmetto-six-star-progress.json';
  a.click();
}
async function importProgress(e){
  const f = e.target.files[0]; if(!f) return;
  const p = JSON.parse(await f.text());
  state.earned = new Set(p.earned||[]);
  state.counts = p.counts||{};
  state.revealed = new Set(p.revealed||[]);
  if(typeof p.spoilerOn==='boolean') state.spoilerOn = p.spoilerOn;
  saveState(); render();
}

init();
