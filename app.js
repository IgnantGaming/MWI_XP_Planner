// ---------- THEME ----------
const APP_VERSION = '1.2.3';
const USERSCRIPT_GREASYFORK_META = 'https://update.greasyfork.org/scripts/555252/MWI%20%E2%86%92%20XP%20Planner.meta.js';
const USERSCRIPT_GREASYFORK_PAGE = 'https://greasyfork.org/en/scripts/555252-mwi-xp-planner';

(function themeInit() {
  const THEME_KEY = 'xp-planner-theme';
  const btn = document.getElementById('themeBtn');
  const root = document.documentElement;

  function apply(mode) {
    root.setAttribute('data-theme', mode);
    btn.textContent = (mode === 'dark') ? '☀️ Light' : '🌙 Dark';
  }
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  const saved = localStorage.getItem(THEME_KEY);
  const start = saved || (systemPrefersDark() ? 'dark' : 'light');
  apply(start);
  btn.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    apply(next);
  });
})();

/* ---------- Import constants & state ---------- */
const HRID_TO_NAME = {
  '/skills/melee': 'Melee',
  '/skills/stamina': 'Stamina',
  '/skills/defense': 'Defense',
  '/skills/intelligence': 'Intelligence',
  '/skills/ranged': 'Range',
  '/skills/attack': 'Attack',
  '/skills/magic': 'Magic',
};
const NAME_TO_HRID = Object.fromEntries(Object.entries(HRID_TO_NAME).map(([h,n]) => [n, h]));
let importedSkills = null;
let importedMeta = null;
const STORAGE_IMPORT_KEY = 'planner:cs_import';

// ---------- DOM ----------
const els = {
  // primary
  primaryType: document.getElementById('primaryType'),
  primaryLevel: document.getElementById('primaryLevel'),
  primaryRemaining: document.getElementById('primaryRemaining'),
  primaryRate: document.getElementById('primaryRate'),
  // charm
  charmType: document.getElementById('charmType'),
  charmLevel: document.getElementById('charmLevel'),
  charmRemaining: document.getElementById('charmRemaining'),
  charmRate: document.getElementById('charmRate'),
  // global
  simHours: document.getElementById('simHours'),
  targetLevel: document.getElementById('targetLevel'),
  targetApplies: document.getElementById('targetApplies'),
  calcBtn: document.getElementById('calcBtn'),
  resetBtn: document.getElementById('resetBtn'),
  status: document.getElementById('status'),
  tableInfo: document.getElementById('tableInfo'),
  // outputs — primary
  p_timeNext: document.getElementById('p_timeNext'),
  p_details: document.getElementById('p_details'),
  p_projection: document.getElementById('p_projection'),
  p_hoursEcho: document.getElementById('p_hoursEcho'),
  p_timeTarget: document.getElementById('p_timeTarget'),
  p_targetDetails: document.getElementById('p_targetDetails'),
  p_crossNote: document.getElementById('p_crossNote'),
  primaryPanel: document.getElementById('primaryPanel'),
  // outputs — charm
  c_timeNext: document.getElementById('c_timeNext'),
  c_details: document.getElementById('c_details'),
  c_projection: document.getElementById('c_projection'),
  c_hoursEcho: document.getElementById('c_hoursEcho'),
  c_timeTarget: document.getElementById('c_timeTarget'),
  c_targetDetails: document.getElementById('c_targetDetails'),
  c_crossNote: document.getElementById('c_crossNote'),
  charmPanel: document.getElementById('charmPanel'),
  // file
  fileBanner: document.getElementById('fileBanner'),
  fileInput: document.getElementById('fileInput'),
  fileStatus: document.getElementById('fileStatus'),
};
// Imported skills UI
const skillsCard = document.getElementById('skillsCard');
const skillsMeta = document.getElementById('skillsMeta');
const skillsStatus = document.getElementById('skillsStatus');
const skillsTable = document.getElementById('skillsTable')?.querySelector('tbody');

let xpTable = null;
let sortedLevels = [];

// ---------- Load experience.json (with local-file fallback) ----------
function setTable(data, source='fetch') {
  xpTable = data;
  sortedLevels = Object.keys(xpTable)
    .map(k => parseInt(k,10))
    .filter(Number.isInteger)
    .sort((a,b)=>a-b);
  els.status.textContent = `experience.json loaded (${source})`;
  els.tableInfo.textContent = 'Enter values above to see per-level deltas.';

  // If imports exist, render and then apply equipment/rates before autofill
  if (importedSkills) {
    renderImportedTable();
    applyImportedEquipment();
    applyImportedRates();
    autofillFromImported();
    calculate();
  }
  // footer versions
  const av = document.getElementById('appVer'); if (av) av.textContent = APP_VERSION;
  const uv = document.getElementById('usVer'); if (uv) {
    if (importedMeta?.scriptVersion) uv.textContent = importedMeta.scriptVersion;
    else fetchUserscriptVersion().then(v => { if (v && uv.textContent === 'n/a') uv.textContent = v; }).catch(() => {});
  }
}
fetch('experience.json')
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(data => setTable(data, 'fetch'))
  .catch(() => {
    els.fileBanner.style.display = 'block';
    els.fileStatus.textContent = 'Choose your experience.json to load it locally.';
  });
els.fileInput?.addEventListener('change', e => {
  const file = e.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { setTable(JSON.parse(reader.result), 'file'); els.fileStatus.textContent = `Loaded: ${file.name}`; }
    catch(err){ els.fileStatus.textContent = `Invalid JSON: ${err.message}`; }
  };
  reader.onerror = () => els.fileStatus.textContent = 'Failed to read file.';
  reader.readAsText(file);
});

// ---------- Import from URL hash (#cs=...) or localStorage ----------
function getHashParam(k) {
  const h = location.hash || '';
  const q = new URLSearchParams(h.startsWith('#') ? h.slice(1) : h);
  return q.get(k);
}
function getQueryParam(k) {
  const s = location.search || '';
  const q = new URLSearchParams(s.startsWith('?') ? s.slice(1) : s);
  return q.get(k);
}
function tryImportFromHash() {
  const cs = getHashParam('cs');
  if (!cs) return false;
  try {
    const text = decodeURIComponent(cs);
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      // Legacy: array-of-skills only
      importedSkills = parsed;
      const cType = getHashParam('cType') || null;
      const cRate = getHashParam('cRate');
      const pRate = getHashParam('pRate');
      const rates = {};
      if (cType) rates.cType = cType;
      if (cRate != null && !isNaN(parseFloat(cRate))) rates.cRate = parseFloat(cRate);
      if (pRate != null && !isNaN(parseFloat(pRate))) rates.pRate = parseFloat(pRate);
      importedMeta = { source: 'hash', rates };
    } else if (parsed && Array.isArray(parsed.skills)) {
      // New: object with skills + meta.rates (+ meta.equipment)
      importedSkills = parsed.skills;
      const rates = (parsed.meta && parsed.meta.rates) || parsed.rates || {};
      const norm = {};
      if (typeof rates.cType === 'string') norm.cType = rates.cType;
      if (rates.cRate != null && !isNaN(parseFloat(rates.cRate))) norm.cRate = parseFloat(rates.cRate);
      if (rates.pRate != null && !isNaN(parseFloat(rates.pRate))) norm.pRate = parseFloat(rates.pRate);
      const equipment = (parsed.meta && parsed.meta.equipment) || parsed.equipment || null;
      importedMeta = { source: 'hash', rates: norm, scriptVersion: parsed?.meta?.scriptVersion, equipment };
    } else {
      throw new Error('Unexpected #cs payload');
    }
    localStorage.setItem(STORAGE_IMPORT_KEY, JSON.stringify({ skills: importedSkills, meta: importedMeta }));
    // Debug aid: keep hash if keepHash=1 in hash or debug=1 in hash or query
    const keep = (getHashParam('keepHash') === '1') || (getHashParam('debug') === '1') || (getQueryParam('debug') === '1');
    // Log the normalized payload for inspection
    try { console.log('XP Planner imported from #cs:', { skills: importedSkills, meta: importedMeta }); } catch {}
    if (!keep) history.replaceState(null, '', location.pathname);
    return true;
  } catch (e) {
    console.warn('Failed to import from #cs:', e);
    return false;
  }
}
function loadImportFromStorage() {
  const raw = localStorage.getItem(STORAGE_IMPORT_KEY);
  if (!raw) return false;
  try {
    const obj = JSON.parse(raw);
    if (obj && Array.isArray(obj.skills)) {
      importedSkills = obj.skills;
      importedMeta = obj.meta || { source: 'storage' };
      return true;
    }
  } catch {}
  return false;
}

// Apply imported xp/hour rates and charm type
function applyImportedRates() {
  const rates = importedMeta?.rates || {};
  if (!rates) return;
  // 1) Apply explicit charm type and rate if present
  if (rates.cType && els.charmType) {
    // set only if it exists in the dropdown
    const opt = Array.from(els.charmType.options || []).some(o => o.value === rates.cType);
    els.charmType.value = opt ? rates.cType : els.charmType.value;
  }
  if (rates.cRate != null && !isNaN(parseFloat(rates.cRate))) {
    els.charmRate.value = String(parseFloat(rates.cRate));
  }
  if (rates.pRate != null && !isNaN(parseFloat(rates.pRate))) {
    els.primaryRate.value = String(parseFloat(rates.pRate));
  }

  // 2) Flexible payloads: support named skill rates (total, stamina, intelligence, defense, attack)
  // If explicit cType/cRate not provided, infer from specific skill keys
  const lowerKeys = Object.create(null);
  for (const k in rates) lowerKeys[k.toLowerCase()] = rates[k];

  // Charm inference
  if ((!rates.cType || rates.cRate == null) && els.charmType && els.charmRate) {
    const candidates = [
      ['stamina','Stamina'],
      ['intelligence','Intelligence'],
      ['defense','Defense'],
      ['attack','Attack']
    ];
    for (const [key, label] of candidates) {
      if (lowerKeys[key] != null && !isNaN(parseFloat(lowerKeys[key]))) {
        const exists = Array.from(els.charmType.options || []).some(o => o.value === label);
        if (exists) {
          els.charmType.value = label;
          els.charmRate.value = String(parseFloat(lowerKeys[key]));
          break;
        }
      }
    }
  }

  // Primary inference
  if (els.primaryRate) {
    // If pRate missing, compute from total - chosen charm if possible
    const total = lowerKeys['total'];
    const cVal = parseFloat(els.charmRate.value);
    if ((rates.pRate == null || isNaN(parseFloat(rates.pRate))) && total != null && isFinite(cVal)) {
      const p = Math.max(0, parseFloat(total) - cVal);
      if (isFinite(p)) els.primaryRate.value = String(Math.round(p));
    }
    // If still missing and attack is provided, prefer Attack as primary
    if ((!isFinite(parseFloat(els.primaryRate.value)) || parseFloat(els.primaryRate.value) <= 0) && lowerKeys['attack'] != null) {
      els.primaryRate.value = String(parseFloat(lowerKeys['attack']));
      // Set Primary class to Attack if available
      if (els.primaryType) {
        const exists = Array.from(els.primaryType.options || []).some(o => o.value === 'Attack' || o.textContent === 'Attack');
        if (exists) els.primaryType.value = 'Attack';
      }
    }
  }
}

// Apply equipment-derived defaults if provided
function applyImportedEquipment() {
  const eq = importedMeta?.equipment;
  if (!eq) return;
  // Primary type from main hand
  const prim = eq.primaryClassFromMainHand;
  if (prim && els.primaryType) {
    const exists = Array.from(els.primaryType.options || []).some(o => o.value === prim || o.textContent === prim);
    if (exists) els.primaryType.value = prim;
  }
  // Charm type from charm
  const charmT = eq.charmTypeFromCharm;
  if (charmT && els.charmType) {
    const exists = Array.from(els.charmType.options || []).some(o => o.value === charmT || o.textContent === charmT);
    if (exists) els.charmType.value = charmT;
  }
}

// Footer helpers: attempt to show userscript version even without import meta
async function fetchUserscriptVersion() {
  try {
    const r = await fetch(USERSCRIPT_GREASYFORK_META, { mode: 'cors' });
    if (r.ok) {
      const t = await r.text();
      const m = t.match(/^\s*\/\/\s*@version\s+(.+)$/m);
      if (m && m[1]) return m[1].trim();
    }
  } catch {}
  try {
    const r2 = await fetch(USERSCRIPT_GREASYFORK_PAGE, { mode: 'cors' });
    if (r2.ok) {
      const h = await r2.text();
      const m2 = h.match(/class=\"script-show-version\"[^>]*>\s*<span>([^<]+)<\/span>/i);
      if (m2 && m2[1]) return m2[1].trim();
    }
  } catch {}
  return null;
}

// Initialize footer eagerly in case experience.json fetch is delayed
(function initFooterVersionsEarly(){
  const av = document.getElementById('appVer'); if (av) av.textContent = APP_VERSION;
  const uv = document.getElementById('usVer'); if (uv && uv.textContent === 'n/a') {
    fetchUserscriptVersion().then(v => { if (v) uv.textContent = v; }).catch(() => {});
  }
})();

// ---------- Helpers ----------
function formatDuration(hoursFloat) {
  if (!isFinite(hoursFloat) || hoursFloat < 0) return '—';
  const totalSeconds = Math.round(hoursFloat * 3600);
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (d) parts.push(d + 'd');
  if (h) parts.push(h + 'h');
  if (m) parts.push(m + 'm');
  if (s || parts.length === 0) parts.push(s + 's');
  return parts.join(' ');
}
const req = lvl => xpTable?.[String(lvl)];
function delta(lvl){
  const a = req(lvl), b = req(lvl+1);
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  return Math.max(0, b - a);
}
function currentTotalXP(level, remaining) {
  const d = delta(level);
  const base = req(level);
  if (typeof base !== 'number' || d == null) return null;
  const progress = Math.max(0, d - remaining);
  return base + progress;
}
function findLevelForTotalXP(totalXP) {
  if (!xpTable || !sortedLevels.length) return null;
  let lo=0, hi=sortedLevels.length-1, ans=sortedLevels[0];
  while (lo<=hi) {
    const mid=(lo+hi)>>1, lvl=sortedLevels[mid], need=req(lvl);
    if (need<=totalXP){ ans=lvl; lo=mid+1; } else { hi=mid-1; }
  }
  return ans;
}
function projectAfterHours(level, remaining, rate, hours) {
  const cur = currentTotalXP(level, remaining);
  if (cur == null) return null;
  const gained = Math.max(0, rate) * Math.max(0, hours);
  const tot = cur + gained;
  const pl = findLevelForTotalXP(tot);
  if (pl == null) return null;
  const nextReq = req(pl + 1);
  const remToNext = (typeof nextReq === 'number') ? Math.max(0, Math.ceil(nextReq - tot)) : null;
  return { projectedLevel: pl, totalXP: tot, remainingToNext: remToNext, gained };
}
function hoursToTarget(level, remaining, rate, targetLevel) {
  const cur = currentTotalXP(level, remaining);
  const targetTotal = req(targetLevel);
  if (cur == null || typeof targetTotal !== 'number' || rate <= 0) return null;
  const xpNeeded = Math.max(0, targetTotal - cur);
  return { hours: xpNeeded / rate, xpNeeded };
}

// ---------- Imported skills → table + autofill ----------
function computeRemainingToNext(totalXP, level) {
  if (!xpTable) return null;
  const next = req(level + 1);
  if (typeof next !== 'number') return null;
  return Math.max(0, Math.ceil(next - totalXP));
}
function buildDisplayRows() {
  if (!Array.isArray(importedSkills)) return [];
  const wantedHrids = new Set(Object.keys(HRID_TO_NAME));
  const rows = importedSkills
    .filter(s => wantedHrids.has(s.skillHrid))
    .map(s => ({
      name: HRID_TO_NAME[s.skillHrid],
      hrid: s.skillHrid,
      level: s.level,
      xp: s.experience
    }))
    .sort((a, b) => {
      const order = ['Melee','Stamina','Defense','Intelligence','Range','Attack','Magic'];
      return order.indexOf(a.name) - order.indexOf(b.name);
    });
  return rows;
}
function renderImportedTable() {
  if (!skillsTable || !skillsCard) return;
  if (!importedSkills) { skillsCard.style.display = 'none'; return; }
  const rows = buildDisplayRows();
  if (!rows.length) { skillsCard.style.display = 'none'; return; }
  skillsTable.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    const remain = (xpTable) ? computeRemainingToNext(r.xp, r.level) : null;
    tr.innerHTML = `
      <td>${r.name}</td>
      <td style="text-align:right;">${r.level}</td>
      <td style="text-align:right;">${Math.round(r.xp).toLocaleString()}</td>
      <td style="text-align:right;">${remain == null ? '—' : remain.toLocaleString()}</td>
    `;
    skillsTable.appendChild(tr);
  }
  skillsCard.style.display = '';
  const src = importedMeta?.source || 'unknown';
  skillsMeta.textContent = `Loaded from ${src}. Change the dropdowns below to auto-fill from these values.`;
  skillsStatus.textContent = xpTable ? '' : 'Waiting for experience.json to compute XP-to-next…';
}
function applyImportedToSide(side) {
  if (!importedSkills || !xpTable) return false;
  const isP = side === 'p';
  const typeSel = isP ? els.primaryType : els.charmType;
  const levelInp = isP ? els.primaryLevel : els.charmLevel;
  const remainInp = isP ? els.primaryRemaining : els.charmRemaining;
  const name = typeSel.value;
  const hrid = NAME_TO_HRID[name] || null;
  if (!hrid) return false;
  const found = importedSkills.find(s => s.skillHrid === hrid);
  if (!found) return false;
  levelInp.value = found.level;
  const rem = computeRemainingToNext(found.experience, found.level);
  if (rem != null) remainInp.value = rem;
  return true;
}
function autofillFromImported() {
  applyImportedToSide('p');
  applyImportedToSide('c');
}

// ---------- Side calculators ----------
function calcSide(side) {
  const isP = side === 'p';
  const level = parseInt(isP ? els.primaryLevel.value : els.charmLevel.value, 10);
  const remaining = parseFloat(isP ? els.primaryRemaining.value : els.charmRemaining.value);
  const rate = parseFloat(isP ? els.primaryRate.value : els.charmRate.value);
  const simHrs = parseFloat(els.simHours.value);

  const outTimeNext = isP ? els.p_timeNext : els.c_timeNext;
  const details = isP ? els.p_details : els.c_details;
  const proj = isP ? els.p_projection : els.c_projection;
  const hoursEcho = isP ? els.p_hoursEcho : els.c_hoursEcho;
  const timeTarget = isP ? els.p_timeTarget : els.c_timeTarget;
  const targetDetails = isP ? els.p_targetDetails : els.c_targetDetails;

  if (!Number.isInteger(level) || level < 1) {
    outTimeNext.textContent = '—';
    details.innerHTML = '<span class="err">Enter a valid level (>= 1).</span>';
    proj.innerHTML = '<span class="warn">Projection requires a valid level.</span>';
    timeTarget.textContent = '—';
    targetDetails.innerHTML = '<span class="warn">Target requires a valid level.</span>';
    return { ok:false };
  }
  if (!isFinite(remaining) || remaining < 0) {
    outTimeNext.textContent = '—';
    details.innerHTML = '<span class="err">Enter a non-negative “XP Needed”.</span>';
    proj.innerHTML = '<span class="warn">Projection requires a valid “XP Needed”.</span>';
    timeTarget.textContent = '—';
    targetDetails.innerHTML = '<span class="warn">Target requires a valid “XP Needed”.</span>';
    return { ok:false };
  }
  if (!isFinite(rate) || rate <= 0) {
    outTimeNext.textContent = '—';
    details.innerHTML = '<span class="warn">Enter XP/hour > 0.</span>';
    proj.innerHTML = '<span class="warn">Projection requires XP/hour > 0.</span>';
    timeTarget.textContent = '—';
    targetDetails.innerHTML = '<span class="warn">Target requires XP/hour > 0.</span>';
    return { ok:false };
  }

  // Time to next
  const hNext = remaining / rate;
  outTimeNext.textContent = formatDuration(hNext);
  details.innerHTML = `
    At <strong>${rate.toLocaleString()}</strong> XP/hour, it takes
    <strong>${hNext.toFixed(2)}</strong> hours (${formatDuration(hNext)})
    to gain <strong>${remaining.toLocaleString()}</strong> XP.
  `;

  if (!xpTable || delta(level) == null) {
    proj.innerHTML = '<span class="warn">Projection requires experience.json with contiguous levels.</span>';
    timeTarget.textContent = '—';
    targetDetails.innerHTML = '<span class="warn">Target requires experience.json.</span>';
    return { ok:false };
  }

  // Projection after N hours
  hoursEcho.textContent = (isFinite(simHrs) && simHrs >= 0) ? simHrs : '—';
  if (isFinite(simHrs) && simHrs >= 0) {
    const p = projectAfterHours(level, remaining, rate, simHrs);
    if (!p) {
      proj.innerHTML = '<span class="err">Could not project (table missing).</span>';
    } else {
      const { projectedLevel, gained, remainingToNext } = p;
      const levelsGained = Math.max(0, projectedLevel - level);
      proj.innerHTML = `
        After <strong>${simHrs}</strong> hour(s) at <strong>${rate.toLocaleString()}</strong> XP/hour:<br/>
        • Projected level: <strong>${projectedLevel}</strong> (${levelsGained} level${levelsGained === 1 ? '' : 's'} gained)<br/>
        • Total XP gained: <strong>${Math.round(gained).toLocaleString()}</strong><br/>
        ${remainingToNext != null
          ? `• XP remaining to level ${projectedLevel + 1}: <strong>${remainingToNext.toLocaleString()}</strong>`
          : '• You are at or beyond the highest level in the table.'}
      `;
    }
  } else {
    proj.innerHTML = '<span class="warn">Enter a non-negative number of hours to simulate.</span>';
  }

  // Own time-to-target
  const target = parseInt(els.targetLevel.value, 10);
  const h2t = Number.isInteger(target) ? hoursToTarget(level, remaining, rate, target) : null;
  if (!Number.isInteger(target)) {
    timeTarget.textContent = '—';
    targetDetails.innerHTML = '<span class="warn">Enter a target level.</span>';
  } else if (!h2t) {
    timeTarget.textContent = '—';
    if (target <= level) {
      targetDetails.innerHTML = `Already level <strong>${level}</strong> (target: ${target}).`;
    } else {
      targetDetails.innerHTML = '<span class="warn">Cannot compute time to target (check table & XP/hour).</span>';
    }
  } else {
    timeTarget.textContent = formatDuration(h2t.hours);
    targetDetails.innerHTML = `
      From your current progress in level <strong>${level}</strong>, you need
      <strong>${h2t.xpNeeded.toLocaleString()}</strong> XP to reach level <strong>${target}</strong>.<br/>
      At <strong>${rate.toLocaleString()}</strong> XP/hour, that’s
      <strong>${h2t.hours.toFixed(2)}</strong> hours (${formatDuration(h2t.hours)}).
    `;
  }

  return { ok:true, level, remaining, rate, hNext, h2t };
}

// ---------- Calculate + cross-target ----------
function calculate() {
  els.primaryPanel.classList.remove('panel-focus');
  els.charmPanel.classList.remove('panel-focus');
  els.p_crossNote.textContent = '';
  els.c_crossNote.textContent = '';

  if (xpTable) {
    const pl = parseInt(els.primaryLevel.value, 10);
    const cl = parseInt(els.charmLevel.value, 10);
    const pd = Number.isInteger(pl) ? delta(pl) : null;
    const cd = Number.isInteger(cl) ? delta(cl) : null;
    let html = '';
    if (Number.isInteger(pl) && pd != null) {
      html += `Primary next level (${pl+1}) requires <strong>${pd.toLocaleString()}</strong> XP.<br/>`;
    }
    if (Number.isInteger(cl) && cd != null) {
      html += `Charm next level (${cl+1}) requires <strong>${cd.toLocaleString()}</strong> XP.`;
    }
    els.tableInfo.innerHTML = html || 'Enter levels to see per-level deltas.';
  } else {
    els.tableInfo.textContent = 'experience.json not loaded.';
  }

  const P = calcSide('p');
  const C = calcSide('c');

  const applies = els.targetApplies.value;
  const target = parseInt(els.targetLevel.value, 10);
  if (!xpTable || !Number.isInteger(target)) return;

  if (applies === 'primary' && P?.ok && P?.h2t?.hours != null) {
    els.primaryPanel.classList.add('panel-focus');
    const hoursForPrimaryGoal = P.h2t.hours;
    const charmL = parseInt(els.charmLevel.value, 10);
    const charmRem = parseFloat(els.charmRemaining.value);
    const charmRate = parseFloat(els.charmRate.value);
    const projC = projectAfterHours(charmL, charmRem, charmRate, hoursForPrimaryGoal);
    if (projC) {
      const { projectedLevel, remainingToNext } = projC;
      els.c_crossNote.innerHTML =
        `By the time <strong>Primary</strong> reaches level <strong>${target}</strong> (${formatDuration(hoursForPrimaryGoal)}), ` +
        `your <strong>Charm</strong> will be about level <strong>${projectedLevel}</strong>` +
        (remainingToNext != null ? ` (then <strong>${remainingToNext.toLocaleString()}</strong> XP to the next level).` : '.');
    } else {
      els.c_crossNote.innerHTML = `<span class="warn">Couldn’t project Charm at Primary’s target time (check Charm inputs).</span>`;
    }
  } else if (applies === 'charm' && C?.ok && C?.h2t?.hours != null) {
    els.charmPanel.classList.add('panel-focus');
    const hoursForCharmGoal = C.h2t.hours;
    const pL = parseInt(els.primaryLevel.value, 10);
    const pRem = parseFloat(els.primaryRemaining.value);
    const pRate = parseFloat(els.primaryRate.value);
    const projP = projectAfterHours(pL, pRem, pRate, hoursForCharmGoal);
    if (projP) {
      const { projectedLevel, remainingToNext } = projP;
      els.p_crossNote.innerHTML =
        `By the time <strong>Charm</strong> reaches level <strong>${target}</strong> (${formatDuration(hoursForCharmGoal)}), ` +
        `your <strong>Primary</strong> will be about level <strong>${projectedLevel}</strong>` +
        (remainingToNext != null ? ` (then <strong>${remainingToNext.toLocaleString()}</strong> XP to the next level).` : '.');
    } else {
      els.p_crossNote.innerHTML = `<span class="warn">Couldn’t project Primary at Charm’s target time (check Primary inputs).</span>`;
    }
  }
}

// ---------- Events ----------
els.calcBtn.addEventListener('click', calculate);
[
  'primaryLevel','primaryRemaining','primaryRate',
  'charmLevel','charmRemaining','charmRate',
  'simHours','targetLevel','targetApplies'
].forEach(id => document.getElementById(id).addEventListener('change', calculate));
[
  'primaryLevel','primaryRemaining','primaryRate',
  'charmLevel','charmRemaining','charmRate',
  'simHours','targetLevel'
].forEach(id => document.getElementById(id).addEventListener('keydown', e => {
  if (e.key === 'Enter') calculate();
}));
['primaryType','charmType'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    if (importedSkills && xpTable) {
      autofillFromImported();
      calculate();
    }
  });
});

// Import buttons: apply imported snapshot to the current class selections
document.getElementById('primaryImportBtn')?.addEventListener('click', () => {
  if (!importedSkills) { alert('No imported skills found. Open planner via the userscript or load #cs.'); return; }
  if (!xpTable) { alert('experience.json not loaded yet.'); return; }
  const ok = applyImportedToSide('p');
  if (!ok) { alert('Could not match imported skill to current Primary selection.'); return; }
  calculate();
});
document.getElementById('charmImportBtn')?.addEventListener('click', () => {
  if (!importedSkills) { alert('No imported skills found. Open planner via the userscript or load #cs.'); return; }
  if (!xpTable) { alert('experience.json not loaded yet.'); return; }
  const ok = applyImportedToSide('c');
  if (!ok) { alert('Could not match imported skill to current Charm selection.'); return; }
  calculate();
});

els.resetBtn.addEventListener('click', () => {
  els.primaryType.value = 'Magic';
  els.primaryLevel.value = 1;
  els.primaryRemaining.value = 1;
  els.primaryRate.value = 1;
  els.charmType.value = 'Stamina';
  els.charmLevel.value = 1;
  els.charmRemaining.value = 1;
  els.charmRate.value = 1;
  els.simHours.value = 24;
  els.targetLevel.value = 2;
  els.targetApplies.value = 'primary';
  [
    els.p_timeNext, els.c_timeNext, els.p_timeTarget, els.c_timeTarget
  ].forEach(el => el.textContent = '—');
  els.p_details.textContent = 'Enter Primary rate and remaining XP.';
  els.c_details.textContent = 'Enter Charm rate and remaining XP.';
  els.p_projection.textContent = 'Enter hours and click Calculate.';
  els.c_projection.textContent = 'Enter hours and click Calculate.';
  els.p_hoursEcho.textContent = '—';
  els.c_hoursEcho.textContent = '—';
  els.p_targetDetails.textContent = 'Set Target Level and click Calculate.';
  els.c_targetDetails.textContent = 'Set Target Level and click Calculate.';
  els.p_crossNote.textContent = '';
  els.c_crossNote.textContent = '';
  els.primaryPanel.classList.remove('panel-focus');
  els.charmPanel.classList.remove('panel-focus');
  els.tableInfo.textContent = 'Waiting for file load…';
});

// Try to import data from hash or prior session before first calculate
const didHashImport = tryImportFromHash();
if (!didHashImport) loadImportFromStorage();

// Calculate once after load
window.addEventListener('load', () => {
  if (importedSkills && xpTable) {
    renderImportedTable();
    applyImportedEquipment();
    applyImportedRates();
    autofillFromImported();
  }
  setTimeout(calculate, 50);
});
