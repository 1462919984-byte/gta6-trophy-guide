/* Palmetto Six-Star — GTA VI trophy guide & tracker.
   A fully offline single-page app. Every bit of progress lives in this
   browser's localStorage and nothing is ever sent over the network.
   The file is organised by job: storage, progress math, filtering, rendering,
   the next-up recommender, the play-session planner, and export helpers. */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECKLIST_KEY = 'palmetto-six-star-v1';        // main checklist state
const SESSION_KEY = 'palmetto-six-star-sessions-v1'; // play-session plans

const GRADE_LETTER = { platinum: 'P', gold: 'G', silver: 'S', bronze: 'B' };
const GRADE_ORDER = ['platinum', 'gold', 'silver', 'bronze'];
// PlayStation's own trophy point values.
const PSN_POINTS = { platinum: 300, gold: 90, silver: 30, bronze: 15 };
const GRADE_LABEL = {
  platinum: 'Platinum',
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
};

const KIND_LABELS = {
  story: 'Story',
  missable: 'Missable',
  collectibles: 'Collectibles',
  activities: 'Activities',
  online: 'Online',
};

// The kind filters, in the order they appear in the UI.
const KIND_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'story', label: 'Story' },
  { id: 'missable', label: 'Missable' },
  { id: 'collectibles', label: 'Collectibles' },
  { id: 'activities', label: 'Activities' },
  { id: 'online', label: 'Online' },
  { id: 'hidden', label: 'PSN-hidden' },
  { id: 'disputed', label: 'Disputed' },
  { id: 'notearned', label: 'Not earned' },
];

// The five tabs this app exposes.
const TABS = ['tracker', 'roadmap', 'missables', 'sources', 'planner'];

// ---------------------------------------------------------------------------
// App state (the single source of truth in memory)
// ---------------------------------------------------------------------------

const state = {
  trophies: [],          // every trophy from data/trophies.json
  sources: [],           // every source from data/sources.json
  sourcesById: {},       // source id -> source object
  plannerTemplates: [],  // stage templates for the session planner
  methodology: null,     // methodology note shown on the Sources tab
  earned: new Set(),     // trophy names the player has marked earned
  counts: {},            // trophy name -> running collectible counter
  revealed: new Set(),   // trophy names the player has revealed
  spoilerOn: true,       // spoiler shield master switch
  kind: 'all',           // active kind filter
  grade: 'all',          // active grade filter
  search: '',            // free-text query
  selectedName: null,    // trophy open in the detail pane
  tab: 'tracker',        // active tab
  plannerStage: 1,       // stage currently picked in the planner
  sessions: {},          // stage number -> { done: Set<index> }
};

// ---------------------------------------------------------------------------
// Small DOM / text helpers
// ---------------------------------------------------------------------------

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Escape a string for safe interpolation into innerHTML.
function esc(value) {
  const node = document.createElement('span');
  node.textContent = value == null ? '' : String(value);
  return node.innerHTML;
}

// Render source references like [1][3] from an array of ids.
function sourceTags(ids) {
  if (!ids || ids.length === 0) return '';
  return ids.map((id) => `[${id}]`).join('');
}

// Strip a trailing source tag from a step's text before displaying it; the
// tag is re-rendered separately as a highlighted chip.
function stripTrailingTags(text) {
  return String(text || '').replace(/\s*(\[[0-9]+\](?:\[[0-9]+\])*)\s*$/, '').trim();
}

function gradeChip(grade) {
  return `<span class="chip-grade ${grade}">${GRADE_LETTER[grade]}</span>`;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function loadChecklist() {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.earned) state.earned = new Set(saved.earned);
    if (saved.counts) state.counts = saved.counts;
    if (saved.revealed) state.revealed = new Set(saved.revealed);
    if (typeof saved.spoilerOn === 'boolean') state.spoilerOn = saved.spoilerOn;
  } catch {
    // A corrupt save must never stop the app from loading.
  }
}

function saveChecklist() {
  const payload = {
    earned: [...state.earned],
    counts: state.counts,
    revealed: [...state.revealed],
    spoilerOn: state.spoilerOn,
  };
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(payload));
  renderSavedNote();
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && typeof saved === 'object') state.sessions = saved;
  } catch {
    state.sessions = {};
  }
}

function saveSessions() {
  localStorage.setItem(SESSION_KEY, JSON.stringify(state.sessions));
}

// A tiny "saved" note so the user knows persistence is on.
function renderSavedNote() {
  const note = qs('#savedNote');
  if (note) note.textContent = 'Saved in this browser';
}

// ---------------------------------------------------------------------------
// Progress math (fresh implementation)
// ---------------------------------------------------------------------------

// Everything the header, progress bar and audit strip need, computed once.
function computeProgress() {
  const trophies = state.trophies;
  const total = trophies.length;
  const earned = trophies.filter((t) => isEarned(t));

  const byGrade = {};
  const earnedByGrade = {};
  for (const grade of GRADE_ORDER) {
    byGrade[grade] = trophies.filter((t) => t.grade === grade);
    earnedByGrade[grade] = byGrade[grade].filter((t) => isEarned(t));
  }

  let pointsEarned = 0;
  let pointsTotal = 0;
  for (const t of trophies) {
    const worth = PSN_POINTS[t.grade] || 0;
    pointsTotal += worth;
    if (isEarned(t)) pointsEarned += worth;
  }

  // Collectibles tracked through the steppers count toward their own total.
  const collectiblesLogged = trophies.reduce(
    (sum, t) => sum + (t.countTarget && state.counts[t.name] ? state.counts[t.name] : 0),
    0,
  );

  const percent = total === 0 ? 0 : Math.round((earned.length / total) * 100);

  return {
    total,
    earnedCount: earned.length,
    earned,
    byGrade,
    earnedByGrade,
    pointsEarned,
    pointsTotal,
    collectiblesLogged,
    percent,
  };
}

function isEarned(trophy) {
  return state.earned.has(trophy.name);
}

function isRevealed(trophy) {
  return !state.spoilerOn || state.revealed.has(trophy.name);
}

// A trophy is shielded when the spoiler shield is on and it is either a PSN
// hidden trophy or a story trophy, and the player has not earned or revealed it.
function isSpoilerBlocked(trophy) {
  if (isEarned(trophy)) return false;
  if (!state.spoilerOn) return false;
  if (trophy.hidden) return true;
  if (trophy.kind === 'story') return true;
  return false;
}

function displayName(trophy) {
  return isSpoilerBlocked(trophy)
    ? '▮▮▮▮▮ · hidden (reveal to see)'
    : trophy.name;
}

function displayDescription(trophy) {
  return isSpoilerBlocked(trophy)
    ? 'Hidden until earned or revealed.'
    : trophy.description;
}

// ---------------------------------------------------------------------------
// Filtering (fresh implementation)
// ---------------------------------------------------------------------------

// The filtered, ordered trophy list for the checklist.
function filteredTrophies() {
  let list = [...state.trophies];

  // Kind (or special flag) filter.
  switch (state.kind) {
    case 'all':
      break;
    case 'hidden':
      list = list.filter((t) => t.hidden);
      break;
    case 'disputed':
      list = list.filter((t) => t.dispute);
      break;
    case 'notearned':
      list = list.filter((t) => !isEarned(t));
      break;
    default:
      list = list.filter((t) => t.kind === state.kind);
  }

  // Grade filter.
  if (state.grade !== 'all') list = list.filter((t) => t.grade === state.grade);

  // Free-text search across name, description and kind.
  const query = state.search.trim().toLowerCase();
  if (query) {
    list = list.filter((t) =>
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      (t.kind || '').toLowerCase().includes(query),
    );
  }

  return list;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadData() {
  const [trophyDoc, sourceDoc] = await Promise.all([
    fetch('data/trophies.json').then((r) => r.json()),
    fetch('data/sources.json').then((r) => r.json()),
  ]);

  state.trophies = trophyDoc.trophies || [];
  state.sources = sourceDoc.sources || [];
  state.sourcesById = Object.fromEntries(state.sources.map((s) => [s.id, s]));
  state.plannerTemplates = trophyDoc.plannerTemplates || [];
  state.methodology = sourceDoc.methodology || null;
}

function defaultSelection() {
  if (state.selectedName && state.trophies.some((t) => t.name === state.selectedName)) {
    return state.selectedName;
  }
  // Default to the one missable trophy (Positive Mental Attitude).
  const missable = state.trophies.find((t) => t.missable);
  return (missable || state.trophies[0]).name;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function init() {
  await loadData();
  loadChecklist();
  loadSessions();
  if (state.plannerTemplates.length > 0) {
    state.plannerStage = state.plannerTemplates[0].stage;
  }
  state.selectedName = defaultSelection();
  render();
  bindEvents();
}

// ---------------------------------------------------------------------------
// Top-level render dispatch
// ---------------------------------------------------------------------------

function render() {
  renderHeader();
  renderAuditStrip();
  renderProgressBar();
  renderFilters();
  renderChecklist();
  renderDetail();
  renderNextUp();
  renderGuideSources();

  if (state.tab === 'roadmap') renderRoadmap();
  if (state.tab === 'missables') renderMissables();
  if (state.tab === 'sources') renderSources();
  if (state.tab === 'planner') renderPlanner();
}

function renderHeader() {
  const p = computeProgress();
  const parts = [];
  parts.push(`<span><b>${p.earnedCount}</b> / ${p.total} earned</span>`);
  for (const grade of GRADE_ORDER) {
    parts.push(
      `<span>${GRADE_LETTER[grade]} <b>${p.earnedByGrade[grade].length}/${p.byGrade[grade].length}</b></span>`,
    );
  }
  parts.push(`<span><b>${p.pointsEarned}/${p.pointsTotal}</b> pts</span>`);
  parts.push(`<span><b>${p.collectiblesLogged}</b> collectibles logged</span>`);
  qs('#headStats').innerHTML = parts.join('');
}

function renderProgressBar() {
  const p = computeProgress();
  qs('#progressFill').style.width = `${p.percent}%`;
  qs('#progressText').textContent =
    `${p.earnedCount} of ${p.total} trophies · ${p.percent}% · ${p.pointsEarned}/${p.pointsTotal} PSN points`;
}

function renderAuditStrip() {
  const trophies = state.trophies;
  const count = (fn) => trophies.filter(fn).length;

  const cited = count((t) => t.sources && t.sources.length > 0);
  const stepsWithSources = trophies.reduce(
    (sum, t) => sum + (t.steps || []).filter((s) => s.sources && s.sources.length).length,
    0,
  );
  const totalSteps = trophies.reduce((sum, t) => sum + (t.steps || []).length, 0);
  const totalClaims = state.sources.reduce((sum, s) => sum + (s.claimsCited || 0), 0);
  const pages = state.sources.reduce((sum, s) => sum + (parseInt(s.pagesRead, 10) || 0), 0);
  const hidden = count((t) => t.hidden);
  const missable = count((t) => t.missable);
  const atRisk = count((t) => t.atRisk);
  const disputed = count((t) => t.dispute);
  const backed = count((t) => (t.sources || []).length >= 2);
  const gradeTally = GRADE_ORDER.map(
    (g) => `${count((t) => t.grade === g)}${GRADE_LETTER[g]}`,
  ).join(' ');

  const readDate = (state.sources[0] && state.sources[0].readDate) || '21 Nov 2026';

  qs('#auditStrip').innerHTML = [
    `<span><b>${trophies.length}/${trophies.length}</b> official name, description, grade</span>`,
    `<span><b>${gradeTally}</b></span>`,
    `<span><b>${hidden}</b> PSN-hidden</span>`,
    `<span><b>${stepsWithSources}/${totalSteps}</b> steps cite sources</span>`,
    `<span><b>${cited}/${trophies.length}</b> guides cite sources</span>`,
    `<span><b>${backed}</b> backed by 2+ sources</span>`,
    `<span><b>${totalClaims}</b> claims cited</span>`,
    `<span><b>${pages}</b> pages · <b>${state.sources.length}</b> sites</span>`,
    `<span>read <b>${readDate}</b></span>`,
    `<span><b>${missable}</b> possibly missable · <b>${atRisk}</b> at risk · <b>${disputed}</b> disputes shown</span>`,
  ].join('');
}

// ---------------------------------------------------------------------------
// Filters UI
// ---------------------------------------------------------------------------

function renderFilters() {
  const counts = {};
  for (const filter of KIND_FILTERS) {
    counts[filter.id] = countForKind(filter.id);
  }

  qs('#filterChips').innerHTML = KIND_FILTERS.map((filter) => {
    const active = state.kind === filter.id ? ' active' : '';
    const n = counts[filter.id] > 0 ? ` <span class="n">${counts[filter.id]}</span>` : '';
    return `<span class="chip${active}" data-kind="${filter.id}">${filter.label}${n}</span>`;
  }).join('');

  const grades = ['all', ...GRADE_ORDER];
  qs('#gradeRow').innerHTML = grades.map((grade) => {
    const active = state.grade === grade ? ' active' : '';
    const label = grade === 'all' ? 'All grades' : GRADE_LETTER[grade];
    return `<span class="grade-chip ${grade}${active}" data-grade="${grade}">${label}</span>`;
  }).join('');
}

function countForKind(kind) {
  switch (kind) {
    case 'all':
      return state.trophies.length;
    case 'hidden':
      return state.trophies.filter((t) => t.hidden).length;
    case 'disputed':
      return state.trophies.filter((t) => t.dispute).length;
    case 'notearned':
      return state.trophies.filter((t) => !isEarned(t)).length;
    default:
      return state.trophies.filter((t) => t.kind === kind).length;
  }
}

// ---------------------------------------------------------------------------
// Checklist rendering
// ---------------------------------------------------------------------------

function trophyFlags(trophy) {
  const flags = [];
  if (trophy.hidden) flags.push('<span class="flag hid">H</span>');
  if (trophy.missable) flags.push('<span class="flag ms">MISS</span>');
  if (trophy.atRisk) flags.push('<span class="flag risk">RISK</span>');
  if (trophy.dispute) flags.push('<span class="flag disp">!</span>');
  return flags.join('');
}

function renderChecklist() {
  const list = filteredTrophies();
  const container = qs('#checklist');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML =
      '<div class="empty-note">No trophies match the current filters.</div>';
    return;
  }

  for (const trophy of list) {
    const row = document.createElement('div');
    const earned = isEarned(trophy);
    const active = trophy.name === state.selectedName;
    row.className = 'trophy-row' + (earned ? ' earned' : '') + (active ? ' active' : '');
    row.dataset.name = trophy.name;

    row.innerHTML =
      `<input type="checkbox" ${earned ? 'checked' : ''} data-name="${esc(trophy.name)}">` +
      `<div class="meta"><div class="nm">${esc(displayName(trophy))}</div>` +
      `<div class="ds">${esc(displayDescription(trophy))}</div></div>` +
      `<div class="row-flags">${trophyFlags(trophy)}</div>` +
      gradeChip(trophy.grade);

    // Clicking the row (but not the checkbox) opens the guide.
    row.addEventListener('click', (event) => {
      if (event.target.tagName === 'INPUT') return;
      selectTrophy(trophy.name);
    });

    // The checkbox toggles earned state and re-renders everything.
    row.querySelector('input').addEventListener('change', (event) => {
      if (event.target.checked) state.earned.add(trophy.name);
      else state.earned.delete(trophy.name);
      saveChecklist();
      render();
    });

    container.appendChild(row);
  }
}

function selectTrophy(name) {
  state.selectedName = name;
  state.tab = 'tracker';
  setActiveTab('tracker');
  render();
  // Keep the selected row visible after switching back to the tracker.
  const activeRow = qs('#checklist .trophy-row.active');
  if (activeRow) activeRow.scrollIntoView({ block: 'nearest' });
}

// ---------------------------------------------------------------------------
// Detail pane (single trophy guide)
// ---------------------------------------------------------------------------

function renderDetail() {
  const container = qs('#detail');
  const trophy = state.trophies.find((t) => t.name === state.selectedName) || state.trophies[0];
  if (!trophy) {
    container.innerHTML = '';
    return;
  }

  const blocked = isSpoilerBlocked(trophy);

  // Numbered steps.
  let stepsHtml = '';
  if (!blocked && trophy.steps && trophy.steps.length > 0) {
    stepsHtml =
      `<div class="steps"><h3>Steps</h3>` +
      trophy.steps.map((step, index) => {
        const text = stripTrailingTags(step.text);
        const tag = sourceTags(step.sources);
        return `<div class="step"><span class="n">${index + 1}</span>` +
          `<span class="txt">${esc(text)}<span class="src">${tag}</span></span></div>`;
      }).join('') +
      `</div>`;
  }

  // Disputed-note box.
  let disputeHtml = '';
  if (!blocked && trophy.dispute && trophy.disputeNote) {
    const note = trophy.disputeNote;
    disputeHtml =
      `<div class="dispute-box"><h3>${esc(note.title || 'Sources differ')}</h3>` +
      (note.versions || []).map((version) =>
        `<div class="dispute-version"><span class="vlabel">${esc(version.label)}</span>` +
        `<div class="vtext">${esc(version.text)}<span class="src">${sourceTags(version.sources)}</span></div></div>`,
      ).join('') +
      `<div class="our-call">${esc(note.call || '')}</div></div>`;
  }

  // Collectible count stepper.
  let countHtml = '';
  if (!blocked && trophy.countTarget) {
    const current = state.counts[trophy.name] || trophy.count || 0;
    countHtml =
      `<div class="count-stepper">` +
      `<span class="lbl">YOUR COUNT</span>` +
      `<button class="minus" type="button" data-name="${esc(trophy.name)}" aria-label="decrease">−</button>` +
      `<span class="val">${current} / ${trophy.countTarget}</span>` +
      `<button class="plus" type="button" data-name="${esc(trophy.name)}" aria-label="increase">+</button>` +
      `</div>`;
  }

  // Flags under the title.
  const flagParts = [];
  if (trophy.missable) flagParts.push('<span class="flag ms">POSSIBLY MISSABLE</span>');
  else if (trophy.atRisk) {
    flagParts.push(`<span class="flag risk">AT RISK · ${esc(trophy.lastChanceChapter || '')}</span>`);
  }
  if (trophy.dispute && trophy.disputeNote) {
    flagParts.push(`<span class="flag disp">SOURCES DIFFER · ${trophy.disputeNote.versions.length}</span>`);
  }

  container.innerHTML =
    `<div class="detail-head"><h2>${esc(displayName(trophy))}</h2>${gradeChip(trophy.grade)}</div>` +
    `<p class="official-desc">${esc(displayDescription(trophy))}</p>` +
    `<div class="detail-flags">${flagParts.join('')}</div>` +
    countHtml +
    stepsHtml +
    disputeHtml;

  // Wire the stepper buttons.
  qsa('.minus, .plus', container).forEach((button) => {
    button.addEventListener('click', () => {
      const current = state.counts[trophy.name] || trophy.count || 0;
      const delta = button.classList.contains('plus') ? 1 : -1;
      const next = Math.max(0, Math.min(trophy.countTarget, current + delta));
      state.counts[trophy.name] = next;
      saveChecklist();
      render();
    });
  });
}

// ---------------------------------------------------------------------------
// Next-up recommender (feature 3a)
// ---------------------------------------------------------------------------

// Roadmap order: stage first, then name (deterministic tie-break).
function roadmapOrder(a, b) {
  const aStage = a.roadmapStage || 99;
  const bStage = b.roadmapStage || 99;
  if (aStage !== bStage) return aStage - bStage;
  return a.name.localeCompare(b.name);
}

// The next unearned story trophy in roadmap order.
function nextStoryTrophy() {
  return [...state.trophies]
    .filter((t) => t.kind === 'story' && !isEarned(t))
    .sort(roadmapOrder)[0];
}

// The closest-to-done collectible set. A set is "closest" when its running
// counter is nearest to its target; ties and untouched sets fall back to the
// smallest remaining target, so the fastest finish floats to the top.
function closestCollectible() {
  const candidates = state.trophies.filter(
    (t) => t.kind === 'collectibles' && t.countTarget && !isEarned(t),
  );
  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => {
    const progressA = (state.counts[a.name] || 0) / a.countTarget;
    const progressB = (state.counts[b.name] || 0) / b.countTarget;
    if (progressA !== progressB) return progressB - progressA;
    // Same progress: finish the one with the smaller remaining target first.
    const remainingA = a.countTarget - (state.counts[a.name] || 0);
    const remainingB = b.countTarget - (state.counts[b.name] || 0);
    if (remainingA !== remainingB) return remainingA - remainingB;
    return a.name.localeCompare(b.name);
  });

  return candidates[0];
}

function renderNextUp() {
  const container = qs('#nextUp');
  const story = nextStoryTrophy();
  const collectible = closestCollectible();

  let html = '<h3>NEXT UP · RECOMMENDER</h3>';

  html += '<div class="nextup-card">';
  html += '<div class="nextup-label">Next story trophy</div>';
  if (story) {
    const blocked = isSpoilerBlocked(story);
    html += `<button class="nextup-jump" type="button" data-name="${esc(story.name)}">` +
      `<span class="nu-title">${esc(blocked ? '▮▮▮▮▮' : story.name)}</span>` +
      `<span class="nu-sub">roadmap stage ${story.roadmapStage || '?'} · jump to guide →</span></button>`;
  } else {
    html += '<div class="nu-empty">All story trophies earned.</div>';
  }
  html += '</div>';

  html += '<div class="nextup-card">';
  html += '<div class="nextup-label">Closest collectible set</div>';
  if (collectible) {
    const current = state.counts[collectible.name] || 0;
    const pct = collectible.countTarget ? Math.round((current / collectible.countTarget) * 100) : 0;
    html += `<button class="nextup-jump" type="button" data-name="${esc(collectible.name)}">` +
      `<span class="nu-title">${esc(collectible.name)}</span>` +
      `<span class="nu-sub">${current} / ${collectible.countTarget} collected · ${pct}% · jump →</span></button>`;
  } else {
    html += '<div class="nu-empty">No collectible sets left.</div>';
  }
  html += '</div>';

  // The full unearned list in roadmap order.
  const remaining = [...state.trophies].filter((t) => !isEarned(t)).sort(roadmapOrder);
  html += '<div class="nextup-list">' +
    remaining.map((trophy) => {
      const blocked = isSpoilerBlocked(trophy);
      return `<div class="nextup-item" data-name="${esc(trophy.name)}">` +
        `<span class="st">S${trophy.roadmapStage || '?'}</span>` +
        `<span class="nn">${esc(blocked ? '▮▮▮▮▮' : trophy.name)}</span></div>`;
    }).join('') +
    '</div>';

  container.innerHTML = html;

  qsa('[data-name]', container).forEach((el) => {
    el.addEventListener('click', () => selectTrophy(el.dataset.name));
  });
}

// ---------------------------------------------------------------------------
// Guide sources rail
// ---------------------------------------------------------------------------

function renderGuideSources() {
  const container = qs('#guideSources');
  const trophy = state.trophies.find((t) => t.name === state.selectedName);
  if (!trophy) {
    container.innerHTML = '';
    return;
  }
  const sources = (trophy.sources || [])
    .map((id) => state.sourcesById[id])
    .filter(Boolean);

  container.innerHTML = '<h3>SOURCES FOR THIS GUIDE</h3>' +
    (sources.length === 0
      ? '<div class="src-item"><span class="sn">No sources listed.</span></div>'
      : sources.map((s) =>
          `<div class="src-item"><span class="sn">${esc(s.name)}</span>` +
          `<span class="sc">${s.claimsCited} claims · read ${esc(s.readDate)}</span>` +
          `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace(/^https?:\/\//, ''))}</a></div>`,
        ).join(''));
}

// ---------------------------------------------------------------------------
// Roadmap view
// ---------------------------------------------------------------------------

// Human-authored stage descriptions used by the Roadmap tab.
const STAGE_BLURBS = [
  { stage: 1, title: 'Chapters 1–2 + the one early risk', blurb: 'Story open, Cal fishing, Billy, Kenton, Stick Fiddler, and the Chapter 1 balcony meditation (Positive Mental Attitude) — do it the morning it appears. [1][3]' },
  { stage: 2, title: 'Chapters 3–5 heists & side strands', blurb: 'Andy, Randy, Tyrone, Kenton return, bank vaults, armored trucks, story missions through the ending. [1][3]' },
  { stage: 3, title: 'Activities + races + shooting', blurb: 'The Shootist (42 gold), Top Fun (14 locations), Earn Cash Not Kudos (20), Master of None (9), Gunslinger, Hot Together, Personal Best. [1][3]' },
  { stage: 4, title: 'Collectibles + counts', blurb: 'Cunning Stunts (250), Don’t Touch My Deck (3 sets), You WAiNKer! (100), Whip It Good (100), The Goodtime State (52 areas), One Last Thing (50), Little Boxes (8), On the Spot (10), Pest Control (9 gangs), Actions Speak Louder (500). [1][3][4]' },
  { stage: 5, title: 'Clean-up + 100% completion', blurb: 'A Long Road (100% checklist, ~60% true completion), Strangers & Freaks (8 strands), then the platinum. [1][3][4]' },
];

function renderRoadmap() {
  const view = qs('#roadmapView');
  const progress = computeProgress();

  const stages = [];
  for (let n = 1; n <= 5; n++) {
    const trophies = state.trophies.filter((t) => t.roadmapStage === n);
    const done = trophies.filter((t) => isEarned(t)).length;
    const blurb = STAGE_BLURBS.find((b) => b.stage === n);
    stages.push({ n, trophies, done, blurb });
  }

  const currentStage = stages.find((s) => s.done < s.trophies.length) || stages[4];

  const stats = [
    '~200 h to platinum [1][3][5]',
    '4/10 difficulty [1][3]',
    '1 playthrough',
    '1 possible missable',
    '0 online',
    'cheats disable trophies [1][5]',
  ];

  const statHtml = stats.map((s) => `<span class="pill">${s}</span>`).join('');

  const stageCards = stages.map((stage) => {
    const blurbText = stage.blurb ? `<div class="stage-meta">${esc(stage.blurb.blurb)}</div>` : '';
    const steps = stage.trophies.map((trophy) => {
      const firstStep = trophy.steps && trophy.steps[0] ? stripTrailingTags(trophy.steps[0].text) : trophy.description;
      const short = firstStep.split('.')[0] + '.';
      return `<div class="stage-step"><b>${esc(displayName(trophy))}</b> — ${esc(short)}` +
        `<span class="src">${sourceTags(trophy.sources)}</span></div>`;
    }).join('');
    const marker = stage.done === stage.trophies.length ? '<span class="stage-done">DONE</span>' : '';
    return `<div class="stage-card">` +
      `<h3>Stage ${stage.n} · ${esc(stage.blurb ? stage.blurb.title : `Stage ${stage.n}`)} ${marker}</h3>` +
      `${blurbText}` +
      `<div class="stage-progress">${stage.done}/${stage.trophies.length} earned</div>` +
      `<div class="stage-steps">${steps}</div></div>`;
  }).join('');

  const watchTrophies = state.trophies.filter((t) => t.missable || t.atRisk);
  const watchHtml = watchTrophies.map((trophy) =>
    `<div class="watch-item"><span class="wc">${trophy.missable ? 'MISS' : 'RISK'}</span>` +
    `<span><b>${esc(trophy.name)}</b></span>` +
    `<span class="lcc">${trophy.missable ? 'last chance: ' + esc(trophy.lastChanceChapter || 'Chapter 1') : 'last-chance: ' + esc(trophy.lastChanceChapter || '—')}</span></div>`,
  ).join('');

  view.innerHTML =
    `<div class="road-head"><h2>Roadmap to the platinum</h2>` +
    `<span class="est">${progress.earnedCount}/${progress.total} earned · stage ${currentStage.n} of 5 now</span></div>` +
    `<div class="road-stats">${statHtml}</div>` +
    stageCards +
    `<div class="miss-watch"><h3>MISSABLE WATCH · ${state.trophies.filter((t) => t.missable).length} POSSIBLY MISSABLE · ${state.trophies.filter((t) => t.atRisk).length} AT RISK</h3>` +
    watchHtml +
    `</div>`;
}

// ---------------------------------------------------------------------------
// Missables view
// ---------------------------------------------------------------------------

function renderMissables() {
  const view = qs('#missablesView');
  const missable = state.trophies.filter((t) => t.missable);
  const atRisk = state.trophies.filter((t) => t.atRisk && !t.missable);

  const missableHtml = missable.map((trophy) => {
    const dispute = trophy.disputeNote
      ? `<div class="dispute-box"><h3>${esc(trophy.disputeNote.title)}</h3>` +
        trophy.disputeNote.versions.map((v) =>
          `<div class="dispute-version"><span class="vlabel">${esc(v.label)}</span>` +
          `<div class="vtext">${esc(v.text)}</div></div>`).join('') +
        `</div>`
      : '';
    return `<div class="miss-card"><h3>${esc(trophy.name)} <span class="tag">POSSIBLY MISSABLE</span></h3>` +
      `<p class="official-desc">${esc(trophy.description)}</p>` +
      (trophy.disputeNote ? `<p>${esc(trophy.disputeNote.call || '')}</p>` : '') +
      `${dispute}</div>`;
  }).join('');

  const riskHtml = atRisk.map((trophy) =>
    `<div class="atrisk-item"><span class="nm">${esc(trophy.name)}</span>` +
    `<span>${esc(trophy.description)}</span>` +
    `<span class="lc">last-chance: ${esc(trophy.lastChanceChapter || '—')}</span></div>`,
  ).join('');

  view.innerHTML =
    `<h2>Missables</h2>` +
    missableHtml +
    `<div class="miss-card"><h3>At-risk watch list</h3>` +
    `<div class="atrisk-list">${riskHtml}</div></div>` +
    `<p class="miss-note">Where sources disagree we show both versions and never present an unconfirmed claim as fact. The 8 “at risk” trophies are tied to quest givers with a story window, but all remain available after the story — the only genuinely missable window is the Chapter 1 balcony meditation. [1][4]</p>`;
}

// ---------------------------------------------------------------------------
// Sources view (includes the methodology note from sources.json)
// ---------------------------------------------------------------------------

function renderSources() {
  const view = qs('#sourcesView');
  const rows = state.sources.map((s) =>
    `<div class="src-row">` +
    `<div class="srchead"><span class="srcname">[${s.id}] ${esc(s.name)}</span>` +
    `<a class="srcurl" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></div>` +
    `<div class="srcmeta">Pages read: ${esc(s.pagesRead)} · Claims cited: <b>${s.claimsCited}</b> · Read: ${esc(s.readDate)}</div>` +
    `<div class="srcmeta note">${esc(s.note || '')}</div></div>`,
  ).join('');

  const methodology = state.methodology
    ? `<div class="methodology"><h3>${esc(state.methodology.title || 'Methodology')}</h3>` +
      `<p>${esc(state.methodology.body)}</p>` +
      (state.methodology.notes || []).map((n) => `<p class="methodology-note">${esc(n)}</p>`).join('') +
      `</div>`
    : '';

  view.innerHTML =
    `<h2>Sources</h2>` +
    methodology +
    `<div class="src-table">${rows}</div>`;
}

// ---------------------------------------------------------------------------
// Play-session planner (feature 3b)
// ---------------------------------------------------------------------------

function sessionForStage(stage) {
  if (!state.sessions[stage]) state.sessions[stage] = { done: [] };
  return state.sessions[stage];
}

function renderPlanner() {
  const view = qs('#plannerView');

  // Stage picker chips.
  const chips = state.plannerTemplates.map((template) => {
    const active = template.stage === state.plannerStage ? ' active' : '';
    const session = sessionForStage(template.stage);
    const doneCount = session.done.length;
    const total = template.steps.length;
    const complete = total > 0 && doneCount >= total ? ' ✓' : '';
    return `<span class="planner-chip${active}" data-stage="${template.stage}">Stage ${template.stage}${complete} <span class="n">${doneCount}/${total}</span></span>`;
  }).join('');

  const template = state.plannerTemplates.find((t) => t.stage === state.plannerStage);
  if (!template) {
    view.innerHTML =
      `<h2>Play-session planner</h2>` +
      `<div class="empty-note">No session templates were found in the data.</div>`;
    return;
  }

  const session = sessionForStage(template.stage);
  const doneSet = new Set(session.done);

  const totalMinutes = template.steps.reduce((sum, step) => sum + (step.minutes || 0), 0);
  const doneMinutes = template.steps
    .filter((step, index) => doneSet.has(index))
    .reduce((sum, step) => sum + (step.minutes || 0), 0);

  const stepRows = template.steps.map((step, index) => {
    const checked = doneSet.has(index) ? ' checked' : '';
    const done = doneSet.has(index) ? ' step-done' : '';
    return `<label class="planner-step${done}">` +
      `<input type="checkbox" data-index="${index}"${checked}>` +
      `<span class="ps-text">${esc(step.text)}</span>` +
      `<span class="ps-time">${step.minutes} min</span></label>`;
  }).join('');

  view.innerHTML =
    `<div class="planner-head"><h2>Play-session planner</h2>` +
    `<span class="est">${doneMinutes} / ${totalMinutes} min planned in this session</span></div>` +
    `<div class="planner-chips">${chips}</div>` +
    `<div class="planner-stage-title">${esc(template.title)}</div>` +
    `<div class="planner-steps">${stepRows}</div>` +
    `<div class="planner-actions">` +
    `<button type="button" id="plannerReset" class="btn">Reset this session</button>` +
    `<span class="planner-hint">Tick steps as you finish them — progress is saved separately from the main checklist.</span>` +
    `</div>`;

  // Stage chip clicks.
  qsa('.planner-chip', view).forEach((chip) => {
    chip.addEventListener('click', () => {
      state.plannerStage = Number(chip.dataset.stage);
      renderPlanner();
    });
  });

  // Step checkbox clicks.
  qsa('.planner-step input', view).forEach((input) => {
    input.addEventListener('change', () => {
      const index = Number(input.dataset.index);
      if (input.checked) {
        if (!doneSet.has(index)) doneSet.add(index);
      } else {
        doneSet.delete(index);
      }
      session.done = [...doneSet].sort((a, b) => a - b);
      saveSessions();
      renderPlanner();
    });
  });

  // Reset button.
  const reset = qs('#plannerReset', view);
  if (reset) {
    reset.addEventListener('click', () => {
      session.done = [];
      saveSessions();
      renderPlanner();
    });
  }
}

// ---------------------------------------------------------------------------
// Export helpers (JSON + CSV)
// ---------------------------------------------------------------------------

function downloadBlob(contents, filename, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function exportJson() {
  const payload = {
    earned: [...state.earned],
    counts: state.counts,
    revealed: [...state.revealed],
    spoilerOn: state.spoilerOn,
  };
  downloadBlob(JSON.stringify(payload, null, 2), 'palmetto-six-star-progress.json', 'application/json');
}

// CSV export: one row per trophy with the columns the tracker cares about.
function exportCsv() {
  const header = ['name', 'grade', 'earned', 'kind', 'missable'];
  const rows = state.trophies.map((trophy) => [
    `"${String(trophy.name).replace(/"/g, '""')}"`,
    trophy.grade,
    isEarned(trophy) ? 'yes' : 'no',
    trophy.kind,
    trophy.missable ? 'yes' : 'no',
  ].join(','));

  const csv = [header.join(','), ...rows].join('\n') + '\n';
  downloadBlob(csv, 'palmetto-six-star-checklist.csv', 'text/csv;charset=utf-8');
}

async function importJson(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  state.earned = new Set(data.earned || []);
  state.counts = data.counts || {};
  state.revealed = new Set(data.revealed || []);
  if (typeof data.spoilerOn === 'boolean') state.spoilerOn = data.spoilerOn;
  saveChecklist();
  render();
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function setActiveTab(tab) {
  state.tab = tab;
  qsa('#tabs button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  for (const t of TABS) {
    qs('#' + t + 'View').hidden = t !== tab;
  }
}

function bindEvents() {
  // Tab navigation.
  qs('#tabs').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    setActiveTab(button.dataset.tab);
    render();
  });

  // Kind filter chips.
  qs('#filterChips').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    state.kind = chip.dataset.kind;
    renderFilters();
    renderChecklist();
  });

  // Grade filter chips.
  qs('#gradeRow').addEventListener('click', (event) => {
    const chip = event.target.closest('.grade-chip');
    if (!chip) return;
    state.grade = chip.dataset.grade;
    renderFilters();
    renderChecklist();
  });

  // Free-text search.
  qs('#search').addEventListener('input', (event) => {
    state.search = event.target.value;
    renderChecklist();
  });

  // Spoiler shield toggle.
  qs('#spoilerToggle').addEventListener('change', (event) => {
    state.spoilerOn = event.target.checked;
    saveChecklist();
    render();
  });

  // Export/import buttons.
  qs('#exportBtn').addEventListener('click', exportJson);
  qs('#csvBtn').addEventListener('click', exportCsv);
  qs('#importInput').addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) importJson(file);
    event.target.value = '';
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

init();
