// ==UserScript==
// @name         MWI → XP Planner
// @author       IgnantGaming
// @namespace    ignantgaming.mwi
// @version      1.1.7
// @description  Save combat-skill snapshots with tags; open them on your GitHub planner.
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://test.milkywayidlecn.com/*
// @match        https://ignantgaming.github.io/MWI_XP_Planner/*
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @license      CC-BY-NC-SA-4.0
// @downloadURL https://update.greasyfork.org/scripts/555252/MWI%20%E2%86%92%20XP%20Planner.user.js
// @updateURL https://update.greasyfork.org/scripts/555252/MWI%20%E2%86%92%20XP%20Planner.meta.js
// ==/UserScript==

(function () {
  'use strict';
  // Keep in sync with userscript header @version
  const USERSCRIPT_VERSION = '1.1.7';

  /** ---------------- Config ---------------- */
  const PLANNER_URL = 'https://ignantgaming.github.io/MWI_XP_Planner/';
  const SNAP_KEY = 'mwi:snapshots:v1'; // GM storage key for all snapshots
  const WANTED_HRIDS = new Set([
    '/skills/melee',
    '/skills/stamina',
    '/skills/defense',
    '/skills/intelligence',
    '/skills/ranged',
    '/skills/attack',
    '/skills/magic'
  ]);

  /** ---------------- Utilities ---------------- */
  const log = (...a) => console.log('[MWI→Planner]', ...a);
  const warn = (...a) => console.warn('[MWI→Planner]', ...a);

  function safeParse(str) {
    try {
      const x = JSON.parse(str);
      if (typeof x === 'string' && /^[\[{]/.test(x)) {
        try { return JSON.parse(x); } catch {}
      }
      return x;
    } catch { return null; }
  }
  function loadAll() { return GM_getValue(SNAP_KEY, { byTag: {} }); }
  function saveAll(obj) { GM_setValue(SNAP_KEY, obj); }
  function setSnapshot(tag, payload) { const all = loadAll(); all.byTag[tag] = payload; saveAll(all); }
  function getSnapshot(tag) { return loadAll().byTag[tag] || null; }
  function deleteSnapshot(tag) { const all = loadAll(); delete all.byTag[tag]; saveAll(all); }
  function listTags() { return Object.keys(loadAll().byTag).sort(); }

  function extractFromInitCharacterData() {
    const raw = localStorage.getItem('init_character_data');
    if (!raw) return null;
    const obj = safeParse(raw);
    if (!obj || !Array.isArray(obj.characterSkills)) return null;
    const wanted = obj.characterSkills.filter(s => WANTED_HRIDS.has(s.skillHrid));
    const meta = {
      characterID: obj.character?.id || null,
      characterName: obj.character?.name || null,
      timestamp: obj.currentTimestamp || obj.announcementTimestamp || new Date().toISOString()
    };
    return { wanted, meta };
  }
  function extractLegacyCharacterSkills() {
    const raw = localStorage.getItem('characterSkills');
    if (!raw) return null;
    const arr = safeParse(raw);
    if (!Array.isArray(arr)) return null;
    const wanted = arr.filter(s => WANTED_HRIDS.has(s.skillHrid));
    const meta = { characterID: null, characterName: null, timestamp: new Date().toISOString() };
    return { wanted, meta };
  }
  function buildPlannerUrlWithCs(arr) {
    return PLANNER_URL + '#cs=' + encodeURIComponent(JSON.stringify(arr));
  }

  // Live EXP/hour capture (via WS); fallback-friendly if Edible Tools is present
  const mwixpRates = { staminaPerHour: null, totalPerHour: null, primaryPerHour: null, lastAt: 0 };
  let wsHooked = false;
  let currentCharId = null;
  let perSkillRates = {};
  function getCurrentCharId() {
    try {
      const raw = localStorage.getItem('init_character_data');
      const obj = raw ? JSON.parse(raw) : null;
      return obj?.character?.id || null;
    } catch { return null; }
  }
  function updateRatesFromBattle(obj) {
    if (!obj || !obj.combatStartTime || !Array.isArray(obj.players)) return;
    const durationSec = Math.max(1, (new Date() - new Date(obj.combatStartTime)) / 1000);
    const myId = currentCharId || (currentCharId = getCurrentCharId());
    const me = obj.players.find(p => p?.character?.id === myId) || obj.players[0];
    if (!me || !me.totalSkillExperienceMap) return;
    const xpMap = me.totalSkillExperienceMap;
    let total = 0, stamina = 0;
    const factor = 3600 / durationSec;
    perSkillRates = {};
    for (const k in xpMap) {
      const v = Number(xpMap[k] || 0);
      total += v;
      const key = k.replace('/skills/','');
      const perHour = Math.max(0, Math.round(v * factor));
      perSkillRates[key] = perHour;
      if (key === 'stamina') stamina += v;
    }
    const totalPerHour = Math.max(0, Math.round(total * factor));
    const staminaPerHour = Math.max(0, Math.round(stamina * factor));
    const primaryPerHour = Math.max(0, totalPerHour - staminaPerHour);
    mwixpRates.staminaPerHour = staminaPerHour;
    mwixpRates.totalPerHour = totalPerHour;
    mwixpRates.primaryPerHour = primaryPerHour;
    mwixpRates.lastAt = Date.now();
  }
  function hookWebSocketOnce() {
    if (wsHooked || typeof WebSocket === 'undefined') return;
    wsHooked = true;
    const _add = WebSocket.prototype.addEventListener;
    WebSocket.prototype.addEventListener = function(type, listener, options) {
      if (type === 'message') {
        const wrapped = (ev) => { try { if (typeof ev.data === 'string') { const o = JSON.parse(ev.data); if (o?.type === 'new_battle') updateRatesFromBattle(o); if (o?.type === 'init_character_data') currentCharId = o?.character?.id || currentCharId; } } catch {} return listener.call(this, ev); };
        return _add.call(this, type, wrapped, options);
      }
      return _add.call(this, type, listener, options);
    };
  }
  function getLiveRates() {
    hookWebSocketOnce();
    return { ...mwixpRates };
  }
  function buildPlannerUrlWithExport(arr, rates) {
    // Prefer embedding rates inside the #cs payload so imports from file/hash carry them.
    if (rates && Number.isFinite(rates.staminaPerHour) && Number.isFinite(rates.primaryPerHour)) {
      const payload = {
        skills: arr,
        meta: {
          rates: {
            cType: 'Stamina',
            cRate: Math.max(0, Math.round(rates.staminaPerHour)),
            pRate: Math.max(0, Math.round(rates.primaryPerHour)),
            total: Number.isFinite(rates.totalPerHour) ? Math.max(0, Math.round(rates.totalPerHour)) : undefined,
            attack: perSkillRates.attack,
            defense: perSkillRates.defense,
            intelligence: perSkillRates.intelligence,
            stamina: perSkillRates.stamina,
            magic: perSkillRates.magic,
            ranged: perSkillRates.ranged,
            melee: perSkillRates.melee
          }
        }
      };
      return PLANNER_URL + '#cs=' + encodeURIComponent(JSON.stringify(payload));
    }
    // Fallback: skills array only (no rates)
    return buildPlannerUrlWithCs(arr);
  }

  // Equipment extraction from init_character_data
  function getEquipmentMeta() {
    try {
      const raw = localStorage.getItem('init_character_data');
      const obj = raw ? JSON.parse(raw) : null;
      const items = obj?.characterInfo?.characterItems || [];
      const byLoc = Object.create(null);
      for (const it of items) {
        if (it?.itemLocationHrid) byLoc[it.itemLocationHrid] = it;
      }
      const main = byLoc['/item_locations/main_hand'] || null;
      const charm = byLoc['/item_locations/charm'] || null;
      const mainHrid = main?.itemHrid || null;
      const charmHrid = charm?.itemHrid || null;
      const primary = derivePrimaryFromMain(mainHrid);
      const charmType = deriveCharmType(charmHrid);
      return {
        mainHand: { itemHrid: mainHrid },
        charm: { itemHrid: charmHrid },
        primaryClassFromMainHand: primary,
        charmTypeFromCharm: charmType
      };
    } catch { return null; }
  }
  function derivePrimaryFromMain(itemHrid) {
    if (!itemHrid || typeof itemHrid !== 'string') return null;
    const id = itemHrid.split('/').pop();
    const has = (s) => id.includes(s);
    if (has('gobo_boomstick') || /_trident$/.test(id) || /_trident_/.test(id) || /_staff$/.test(id) || /_staff_/.test(id)) return 'Magic';
    if (has('gobo_slasher') || has('gobo_smasher') || has('werewolf_slasher') || has('chaotic_flail') || has('granite_bludgeon') || /_mace$/.test(id) || /_mace_/.test(id) || /_sword$/.test(id) || /_sword_/.test(id)) return 'Melee';
    if (/_bulwark$/.test(id) || /_bulwark_/.test(id)) return 'Defense';
    if (has('gobo_stabber') || /_spear$/.test(id) || /_spear_/.test(id)) return 'Attack';
    if (has('gobo_shooter') || /_bow$/.test(id) || /_bow_/.test(id) || /_crossbow$/.test(id) || /_crossbow_/.test(id)) return 'Range';
    return null;
  }
  function deriveCharmType(itemHrid) {
    if (!itemHrid || typeof itemHrid !== 'string') return null;
    const id = itemHrid.split('/').pop();
    // patterns like advanced_stamina_charm
    const m = /(trainee|basic|advanced|expert|master|grandmaster)_([a-z]+)_charm/.exec(id);
    if (m && m[2]) {
      const t = m[2];
      const map = { attack:'Attack', magic:'Magic', melee:'Melee', defense:'Defense', stamina:'Stamina', intelligence:'Intelligence', ranged:'Range' };
      return map[t] || null;
    }
    return null;
  }

  function hasFiniteRates(r) {
    return !!(r && Number.isFinite(r.staminaPerHour) && Number.isFinite(r.primaryPerHour));
  }

  /** ---------------- Site-specific behaviors ---------------- */
  const onMWI = location.hostname === 'www.milkywayidle.com';
  const onPlanner = location.hostname === 'ignantgaming.github.io' &&
                    location.pathname.startsWith('/MWI_XP_Planner/');

  if (onMWI) {
    GM_addStyle(`
      .mwixp-fab { position: fixed; z-index: 999999; border: 0; cursor: pointer;
                   padding: 4px 8px; border-radius: 8px; color: #fff; font: 12px/1 system-ui, sans-serif;
                   box-shadow: 0 1px 6px rgba(0,0,0,.18); text-align: center; min-width: 160px; height: 26px; }
      /* Move buttons further left from the right edge; overlap to consume the same space */
      #mwixp-save { top: 6px; right: 20%; background: #4f46e5; }
      #mwixp-open { top: 6px; right: 20%; background: #2d6cdf; }
      .mwixp-fab:hover { filter: brightness(1.06); }
    `);

    // Temporary action state: after saving, show Open button for 5 minutes
    const ACTION_STATE_KEY = 'mwixp:lastActionState'; // { mode: 'open'|'save', tag?: string, until?: number }
    let mwixpRevertTimerId = null;
    function getActionState() { return GM_getValue(ACTION_STATE_KEY, { mode: 'save' }); }
    function setActionState(state) { GM_setValue(ACTION_STATE_KEY, state); }
    function clearActionState() { GM_setValue(ACTION_STATE_KEY, { mode: 'save' }); }
    function updateActionButtonsFromState() {
      const saveBtn = document.getElementById('mwixp-save');
      const openBtn = document.getElementById('mwixp-open');
      if (!saveBtn || !openBtn) return;
      if (mwixpRevertTimerId) { clearTimeout(mwixpRevertTimerId); mwixpRevertTimerId = null; }
      const st = getActionState();
      if (st.mode === 'open' && st.tag && typeof st.until === 'number' && Date.now() < st.until) {
        saveBtn.style.display = 'none';
        openBtn.style.display = '';
        openBtn.textContent = `Open ${st.tag} in Planner`;
        const ms = Math.max(0, st.until - Date.now());
        mwixpRevertTimerId = setTimeout(() => { clearActionState(); updateActionButtonsFromState(); }, ms);
      } else {
        clearActionState();
        saveBtn.style.display = '';
        openBtn.style.display = 'none';
        openBtn.textContent = 'Open Tag in Planner';
      }
    }

    function ensureButtons(payload) {
      if (!payload) return;
      if (!document.getElementById('mwixp-save')) {
        const b = document.createElement('button');
        b.id = 'mwixp-save'; b.className = 'mwixp-fab';
        b.textContent = 'Save MWI → Tag';
        b.title = 'Save current combat skills to a named tag';
        b.onclick = () => doSaveSnapshot(payload);
        document.body.appendChild(b);
      }
      if (!document.getElementById('mwixp-open')) {
        const b = document.createElement('button');
        b.id = 'mwixp-open'; b.className = 'mwixp-fab';
        b.textContent = 'Open Tag in Planner';
        b.title = 'Open the last saved tag in the planner';
        b.style.display = 'none';
        b.onclick = () => doOpenTag();
        document.body.appendChild(b);
      }
      updateActionButtonsFromState();
    }

    function doSaveSnapshot(payload) {
      const defaultTag = payload.meta.characterName
        ? `${payload.meta.characterName}-${new Date().toISOString().slice(0,10)}`
        : 'snapshot-' + Date.now();
      const tag = prompt('Save snapshot under tag name:', defaultTag);
      if (!tag) return;
      // attach latest EXP/hour rates for planner autofill
      const live = getLiveRates();
      payload.meta = payload.meta || {};
      payload.meta.rates = {
        staminaPerHour: Number.isFinite(live.staminaPerHour) ? live.staminaPerHour : null,
        totalPerHour: Number.isFinite(live.totalPerHour) ? live.totalPerHour : null,
        primaryPerHour: Number.isFinite(live.primaryPerHour) ? live.primaryPerHour : null,
        lastAt: live.lastAt || Date.now()
      };
      payload.meta.scriptVersion = USERSCRIPT_VERSION;
      // Add equipment snapshot
      payload.meta.equipment = getEquipmentMeta();
      setSnapshot(tag, payload);
      alert(`Saved snapshot: "${tag}"`);
      setActionState({ mode: 'open', tag, until: Date.now() + 5 * 60 * 1000 });
      updateActionButtonsFromState();
    }
    function doOpenTag() {
      const st = getActionState();
      let tag = (st && st.mode === 'open') ? st.tag : null;
      if (!tag) {
        const tags = listTags();
        if (!tags.length) { alert('No saved tags yet. Save one first.'); return; }
        tag = prompt('Enter a tag to open:\n' + tags.join('\n'), tags[0]);
        if (!tag) return;
      }
      const snap = getSnapshot(tag);
      if (!snap) { alert('Tag not found.'); return; }
      const metaRates = snap?.meta?.rates;
      const live = getLiveRates();
      const chosen = hasFiniteRates(metaRates) ? metaRates : (hasFiniteRates(live) ? live : null);
      const url = buildPlannerUrlWithExport(snap.wanted, chosen);
      window.open(url, '_blank');
    }

    let payload = extractFromInitCharacterData();
    if (!payload) {
      payload = extractLegacyCharacterSkills();
      if (!payload) warn('No init_character_data or characterSkills found.');
    }

    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('Save snapshot (tag)…', () => payload && doSaveSnapshot(payload));
      GM_registerMenuCommand('Open snapshot in planner…', doOpenTag);
      GM_registerMenuCommand('Copy current skills JSON', () => {
        if (!payload) return alert('No skills available.');
        const json = JSON.stringify(payload.wanted, null, 2);
        if (typeof GM_setClipboard === 'function') GM_setClipboard(json);
        else navigator.clipboard?.writeText(json);
        alert('Copied current combat skills JSON.');
      });
      GM_registerMenuCommand('List tags', () => alert(listTags().join('\n') || '(none)'));
      GM_registerMenuCommand('Delete tag…', () => {
        const tag = prompt('Tag to delete:', listTags()[0] || '');
        if (!tag) return;
        deleteSnapshot(tag);
        alert(`Deleted: ${tag}`);
      });
    }

    ensureButtons(payload);
    updateActionButtonsFromState();

    if (payload) {
      log('Snapshot candidate:', {
        meta: payload.meta,
        sample: payload.wanted.reduce((m, s) => (m[s.skillHrid] = { lvl: s.level, xp: s.experience }, m), {})
      });
    }
  }

  // On your GitHub Page: #tag loader -> #cs
  if (onPlanner) {
    const hash = location.hash || '';
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
    const tag = params.get('tag');

    if (tag) {
      const snap = getSnapshot(tag);
      if (!snap) {
        alert(`No saved snapshot for tag "${tag}". Open the planner from milkywayidle.com after saving.`);
        return;
      }
      const r = snap?.meta?.rates;
      // Embed rates inside #cs payload if present
      let payload = snap.wanted;
      if (r && Number.isFinite(r.staminaPerHour) && Number.isFinite(r.primaryPerHour)) {
        payload = {
          skills: snap.wanted,
          meta: {
            rates: {
              cType: 'Stamina',
              cRate: Math.max(0, Math.round(r.staminaPerHour)),
              pRate: Math.max(0, Math.round(r.primaryPerHour))
            },
            scriptVersion: USERSCRIPT_VERSION,
            equipment: getEquipmentMeta()
          }
        };
      }
      const newHash = '#cs=' + encodeURIComponent(JSON.stringify(payload));
      if (location.hash !== newHash) {
        history.replaceState(null, '', location.pathname + newHash);
        // If your site only reads hash at load, uncomment:
        // location.reload();
      }
      log('Injected snapshot for tag:', tag, snap.meta || {});
    }
  }
})();
