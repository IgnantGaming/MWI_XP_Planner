// ==UserScript==
// @name         MWI → XP Planner
// @author       IgnantGaming
// @namespace    ignantgaming.mwi
// @version      1.1.0
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

  /** ---------------- Site-specific behaviors ---------------- */
  const onMWI = location.hostname === 'www.milkywayidle.com';
  const onPlanner = location.hostname === 'ignantgaming.github.io' &&
                    location.pathname.startsWith('/MWI_XP_Planner/');

  if (onMWI) {
    GM_addStyle(`
      .mwixp-fab { position: fixed; right: 16px; z-index: 999999; border: 0; cursor: pointer;
                   padding: 9px 12px; border-radius: 10px; color: #fff; font: 13px/1 system-ui, sans-serif;
                   box-shadow: 0 2px 10px rgba(0,0,0,.25); }
      /* Move buttons to top-right to avoid covering inventory */
      #mwixp-save { top: 16px; background: #4f46e5; }
      #mwixp-open { top: 60px; background: #2d6cdf; }
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
      const url = buildPlannerUrlWithCs(snap.wanted);
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
      const cs = encodeURIComponent(JSON.stringify(snap.wanted));
      const newHash = '#cs=' + cs;
      if (location.hash !== newHash) {
        history.replaceState(null, '', location.pathname + newHash);
        // If your site only reads hash at load, uncomment:
        // location.reload();
      }
      log('Injected snapshot for tag:', tag, snap.meta || {});
    }
  }
})();
