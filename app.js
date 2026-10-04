'use strict';

// ───────────────────────── Datum & Formate ─────────────────────────

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mondayOf = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const sameDay = (a, b) => isoDate(a) === isoDate(b);

/** 14.09.26 */
const fmtShort = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
/** 14.09. */
const fmtDayMonth = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
/** Minuten als Dezimalstunden: 90 → 1,50 */
const fmtDec = (minutes) => (minutes / 60).toFixed(2).replace('.', ',');
/** Stunden im eingestellten Format: „8,00“ oder „8h 0m“ (für PDF, ohne Einheit) */
const fmtHours = (minutes) =>
  settings.hourFormat === 'hm' ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : fmtDec(minutes);
/** Wie fmtHours, mit Einheit für die App: „8,00 h“ oder „8h 0m“ */
const fmtH = (minutes) => (settings.hourFormat === 'hm' ? fmtHours(minutes) : `${fmtDec(minutes)} h`);
/** Minuten seit Mitternacht: 480 → 08:00 */
const fmtTime = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

function isoWeek(date) {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

const uid = () =>
  globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ───────────────────────── Datenmodell ─────────────────────────
// Zettel: { id, weekStart: 'YYYY-MM-DD' (Montag), year, month, name, days[7], sentAt, createdAt, updatedAt }
// Tag:    { pause: Minuten (null = noch nicht eingetragen), status?: 'krank'|'urlaub'|'feiertag'|'frei', rows: [{ id, start, end, site, work }] }
//         (start/end: Minuten seit 00:00; bei gesetztem status werden die Zeilen ignoriert, bleiben aber erhalten)

const DAY_STATUS = {
  krank: 'Krankheitstag',
  urlaub: 'Urlaubstag',
  feiertag: 'Gesetzlicher Feiertag',
  frei: 'Frei',
};
const DAY_STATUS_SHORT = { krank: 'Krank', urlaub: 'Urlaub', feiertag: 'Feiertag', frei: 'Frei' };

const emptyRow = () => ({ id: uid(), start: null, end: null, site: '', work: '' });
const rowIsEmpty = (r) => r.start == null && r.end == null && !r.site && !r.work;
const rowMinutes = (r) => (r.start == null || r.end == null ? null : r.end >= r.start ? r.end - r.start : r.end + 1440 - r.start);
const dayWorked = (d) => d.rows.reduce((s, r) => s + (rowMinutes(r) || 0), 0);
/** Gutgeschriebene Minuten für Krankheit, Urlaub usw. laut Einstellungen */
const statusCredit = (status) => (settings.credit[status] ? Math.round(settings.hoursPerDay * 60) : 0);
const dayTotal = (d) => (d.status ? statusCredit(d.status) : Math.max(0, dayWorked(d) - (d.pause || 0)));
const dayHasTimes = (d) => d.rows.some((r) => r.start != null || r.end != null);
/** Am Tag wurde schon etwas eingetragen, aber noch keine Pause (nur neue Zettel haben pause: null) */
const pauseMissing = (d) => !d.status && d.pause == null && d.rows.some((r) => !rowIsEmpty(r));
/** Mindestanzahl Zeilen im PDF: Mo–Fr 5, Sa/So 1 */
const pdfMinRows = (i) => (i < 5 ? 5 : 1);

/** Neuer Zettel für die Woche des angetippten Tages; dessen Monat bestimmt den Zettel. */
function newSheet(anchor, name) {
  const a = startOfDay(anchor);
  return {
    id: uid(),
    weekStart: isoDate(mondayOf(a)),
    year: a.getFullYear(),
    month: a.getMonth() + 1,
    name,
    days: WEEKDAYS.map(() => ({ pause: null, rows: [emptyRow()] })),
    sentAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const sheetDate = (s, i) => addDays(parseDate(s.weekStart), i);
const sheetIsActive = (s, i) => {
  const d = sheetDate(s, i);
  return d.getFullYear() === s.year && d.getMonth() + 1 === s.month;
};
const sheetActiveDays = (s) => [0, 1, 2, 3, 4, 5, 6].filter((i) => sheetIsActive(s, i));
const sheetFirstDate = (s) => sheetDate(s, sheetActiveDays(s)[0] ?? 0);
const sheetLastDate = (s) => sheetDate(s, sheetActiveDays(s).at(-1) ?? 6);
const sheetTitle = (s) => `Stundenzettel ${fmtShort(sheetFirstDate(s))} - ${fmtShort(sheetLastDate(s))}`;
const sheetTotal = (s) => sheetActiveDays(s).reduce((t, i) => t + dayTotal(s.days[i]), 0);
const sheetOvertime = (s, targetHours) => Math.max(0, sheetTotal(s) - Math.round(targetHours * 60));
/** Soll des Zettels in Stunden: anteilig je Werktag Mo–Fr des Monats oder das volle Wochen-Soll */
const sheetTarget = (s) =>
  settings.prorateTarget ? (settings.target / 5) * sheetActiveDays(s).filter((i) => i < 5).length : settings.target;
const sheetMatches = (s, anchor) => {
  const n = newSheet(anchor, '');
  return n.weekStart === s.weekStart && n.year === s.year && n.month === s.month;
};

// ───────────────────────── Speicher ─────────────────────────

const STORE_KEY = 'stundenzettel.sheets.v1';
const SETTINGS_KEY = 'stundenzettel.settings.v1';
const DEFAULT_SETTINGS = {
  name: '',
  overtime: true,
  target: 40,
  hoursPerDay: 8,
  minuteStep: 30,
  hourFormat: 'dec',
  state: 'NI',
  credit: { krank: true, urlaub: true, feiertag: true, frei: false },
  prorateTarget: false,
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

let sheets = readJson(STORE_KEY, []);
let settings = { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}) };
settings.credit = { ...DEFAULT_SETTINGS.credit, ...settings.credit };
delete settings.recipient; // frühere Einstellungen, werden nicht mehr verwendet
delete settings.pdfFrame;
delete settings.accountStart;
delete settings.dayBar;

/** Urlaubs- und Krankheitstage je Jahr (nach Datum des Tages) */
function absenceStats() {
  const years = new Map();
  for (const s of sheets) {
    s.days.forEach((d, i) => {
      if ((d.status !== 'urlaub' && d.status !== 'krank') || !sheetIsActive(s, i)) return;
      const y = sheetDate(s, i).getFullYear();
      if (!years.has(y)) years.set(y, { urlaub: 0, krank: 0 });
      years.get(y)[d.status]++;
    });
  }
  return years;
}

/**
 * Überstunden-Konto je Monat: Ist − Soll, Tag für Tag – nur Tage, für die es einen Stundenzettel gibt.
 * Wochen ohne Zettel kommen in der Rechnung nicht vor.
 * Soll: jeder Werktag Mo–Fr mit Wochen-Soll ÷ 5; Tage nach heute zählen noch nicht.
 * Ist: „Stunden Gesamt“ des Tages (inkl. gutgeschriebener Stunden für Urlaub, Krankheit, Feiertag).
 * Ergebnis: Map Jahr → Map Monat (1–12) → Saldo in Minuten
 */
function overtimeAccount() {
  const result = new Map();
  const dailySoll = Math.round((settings.target * 60) / 5);
  const today = startOfDay(new Date());
  for (const s of sheets) {
    s.days.forEach((d, i) => {
      const date = sheetDate(s, i);
      if (!sheetIsActive(s, i) || date > today) return;
      const soll = i < 5 ? dailySoll : 0;
      const y = date.getFullYear();
      const m = date.getMonth() + 1;
      if (!result.has(y)) result.set(y, new Map());
      const months = result.get(y);
      months.set(m, (months.get(m) || 0) + dayTotal(d) - soll);
    });
  }
  return result;
}

const yearBalance = (months) => [...months.values()].reduce((a, b) => a + b, 0);
/** „+3,50 h“ / „−2,00 h“ */
const fmtSigned = (min) => (min > 0 ? '+' : min < 0 ? '−' : '') + fmtH(Math.abs(min));

/** Feiertage (Mo–Fr) eines Zettels als „Feiertag“ markieren, nur an Tagen ohne Einträge */
function markHolidays(s) {
  s.days.forEach((d, i) => {
    if (i > 4 || !sheetIsActive(s, i) || d.status || dayHasTimes(d) || d.rows.some((r) => r.site || r.work)) return;
    if (holidayName(sheetDate(s, i))) d.status = 'feiertag';
  });
}

/** Hinweise vor dem Senden: unvollständige Zeilen, Überschneidungen, fehlende Angaben, leere Werktage */
function sheetProblems(s) {
  const problems = [];
  s.days.forEach((d, i) => {
    if (!sheetIsActive(s, i) || d.status) return;
    const day = WEEKDAYS[i];
    const timed = [];
    d.rows.forEach((r) => {
      const range = `${r.start != null ? fmtTime(r.start) : '?'}–${r.end != null ? fmtTime(r.end) : '?'}`;
      if (r.start != null && r.end == null) problems.push(`${day}: Zeile ab ${fmtTime(r.start)} hat kein Ende`);
      if (r.start == null && r.end != null) problems.push(`${day}: Zeile bis ${fmtTime(r.end)} hat keinen Beginn`);
      if (r.start != null || r.end != null) {
        if (!r.site.trim()) problems.push(`${day} ${range}: Baustelle fehlt`);
        if (!r.work.trim()) problems.push(`${day} ${range}: Art der Arbeit fehlt`);
      }
      if (r.start != null && r.end != null && r.end > r.start) timed.push(r);
    });
    timed.sort((a, b) => a.start - b.start);
    for (let k = 1; k < timed.length; k++) {
      const a = timed[k - 1];
      const b = timed[k];
      if (b.start < a.end) {
        problems.push(`${day}: ${fmtTime(a.start)}–${fmtTime(a.end)} und ${fmtTime(b.start)}–${fmtTime(b.end)} überschneiden sich`);
      } else if (b.start > a.end) {
        problems.push(`${day}: Lücke von ${fmtTime(a.end)} bis ${fmtTime(b.start)}`);
      }
    }
    if (pauseMissing(d)) problems.push(`${day}: Pause fehlt`);
    if (i < 5 && !dayHasTimes(d)) problems.push(`${day}: kein Eintrag`);
  });
  return problems;
}

/** Speichert alle Zettel; ein geänderter Zettel bekommt den Zeitstempel „zuletzt geändert“. */
function saveSheets(changed) {
  if (changed) changed.updatedAt = Date.now();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(sheets));
  } catch {
    toast('Speichern fehlgeschlagen!');
  }
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    toast('Speichern fehlgeschlagen!');
  }
}

// Speicher als dauerhaft markieren, damit iOS ihn nicht aufräumt
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const findSheet = (id) => sheets.find((s) => s.id === id);
const existingSheet = (anchor, excludeId) => sheets.find((s) => s.id !== excludeId && sheetMatches(s, anchor));

function openOrCreate(anchor) {
  const found = existingSheet(anchor);
  if (found) return found.id;
  const s = newSheet(anchor, settings.name);
  markHolidays(s);
  sheets.push(s);
  saveSheets();
  return s.id;
}

/** Bisher verwendete Einträge, die häufigsten zuerst. */
function collectSuggestions(field) {
  const counts = new Map();
  for (const s of sheets)
    for (const d of s.days)
      for (const r of d.rows) {
        // Art der Arbeit: „Spachteln, Schleifen“ ergibt zwei Vorschläge
        const parts = field === 'work' ? (r[field] || '').split(',') : [r[field] || ''];
        for (const part of parts) {
          const v = part.trim();
          if (v) counts.set(v, (counts.get(v) || 0) + 1);
        }
      }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de')).map(([v]) => v);
}

// ───────────────────────── Icons ─────────────────────────

const svg = (path, size = 22) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const ICON = {
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 20),
  back: svg('<path d="M15 18l-6-6 6-6"/>', 24),
  more: svg('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', 18),
  send: svg('<path d="M4 4h16v16H4z" stroke="none"/><path d="M22 6l-10 7L2 6"/><rect x="2" y="4" width="20" height="16" rx="2"/>', 20),
  check: svg('<path d="M20 6L9 17l-5-5"/>', 14),
  close: svg('<path d="M18 6L6 18M6 6l12 12"/>', 16),
  chevronLeft: svg('<path d="M15 18l-6-6 6-6"/>', 20),
  chevronRight: svg('<path d="M9 18l6-6-6-6"/>', 20),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  share: svg('<path d="M12 3v12M8 7l4-4 4 4"/><path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/>'),
  up: svg('<path d="M12 19V5M5 12l7-7 7 7"/>', 22),
  pin: svg('<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>', 15),
  tool: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.6 17.4a1.4 1.4 0 0 0 2 2l5.7-5.7a4 4 0 0 0 5.4-5.4l-2.4 2.4-2-2z"/>', 15),
};

// ───────────────────────── Routing ─────────────────────────

const app = document.getElementById('app');
let listScroll = 0;
let currentView = '';
/** Monat (JJJJMM), zu dem die Liste nach dem Öffnen scrollen soll */
let pendingMonth = null;
/** Suchbegriff in der Liste; null = Suche geschlossen */
let searchQuery = null;

function route() {
  const hash = location.hash;
  const m = hash.match(/^#\/zettel\/(.+)$/);
  if (currentView === 'list') listScroll = window.scrollY;
  closeModal(true);
  hideChips();
  if (m) {
    currentView = 'editor';
    renderEditor(decodeURIComponent(m[1]));
    window.scrollTo(0, 0);
  } else if (hash === '#/einstellungen') {
    currentView = 'settings';
    renderSettings();
    window.scrollTo(0, 0);
  } else if (hash === '#/uebersicht') {
    currentView = 'stats';
    renderStats();
    window.scrollTo(0, 0);
  } else {
    currentView = 'list';
    renderList();
    if (pendingMonth) {
      const key = pendingMonth;
      pendingMonth = null;
      scrollToMonth(key);
      // iOS setzt die Scroll-Position nach dem Seitenwechsel teils noch einmal zurück
      requestAnimationFrame(() => scrollToMonth(key));
      setTimeout(() => scrollToMonth(key), 120);
    } else {
      window.scrollTo(0, listScroll);
    }
  }
  updateTopButton();
}
window.addEventListener('hashchange', route);

function goBack() {
  if (history.length > 1 && history.state !== 'root') history.back();
  else location.hash = '#/';
}

// ───────────────────────── Liste ─────────────────────────

function renderList() {
  const searching = searchQuery != null;
  app.innerHTML = `
    <header class="nav">
      ${
        searching
          ? `<div class="search-bar">
              <span class="search-field">${ICON.search}<input type="search" data-search placeholder="Baustelle oder Datum" value="${escapeHtml(searchQuery)}" autocomplete="off" enterkeyhint="search"></span>
              <button class="nav-btn" data-act="search-close">Abbrechen</button>
            </div>`
          : `<button class="nav-btn" data-act="settings" aria-label="Einstellungen">${ICON.gear}</button>
            <span class="nav-title"></span>
            ${sheets.length ? `<button class="nav-btn" data-act="search" aria-label="Suchen">${ICON.search}</button>` : '<span class="nav-btn"></span>'}`
      }
    </header>
    ${!searching && sheets.length ? statsCardHTML() : ''}
    ${searching ? '' : '<h1 class="large-title">Stundenzettel</h1>'}
    <div id="list-body">${listBodyHTML()}</div>
    ${
      searching
        ? `<button class="to-top floating" data-act="to-top" aria-label="Nach oben">${ICON.up}</button>`
        : `<div class="bottom-bar">
            <button class="to-top" data-act="to-top" aria-label="Nach oben">${ICON.up}</button>
            <button class="primary" data-act="new">${ICON.plus} Neuer Stundenzettel</button>
          </div>`
    }`;
}

function listBodyHTML() {
  const searching = searchQuery != null;
  const query = searching ? parseQuery(searchQuery) : null;
  const groups = new Map();
  const hits = new Map();
  for (const s of sheets) {
    if (query) {
      const hit = searchSheet(s, query);
      if (!hit) continue;
      hits.set(s.id, hit);
    }
    const key = s.year * 100 + s.month;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const keys = [...groups.keys()].sort((a, b) => b - a);

  if (keys.length) {
    return keys
      .map((k) => {
        const list = groups.get(k).sort((a, b) => sheetFirstDate(b) - sheetFirstDate(a));
        const monthTotal = list.reduce((t, sh) => t + sheetTotal(sh), 0);
        return `<h2 class="section-title month-head" id="m-${k}"><span>${MONTHS[(k % 100) - 1]} ${Math.floor(k / 100)}</span>${searching ? '' : `<span class="month-total">Gesamt ${fmtH(monthTotal)}</span>`}</h2>
        <div class="card list">${list.map((sh) => listRowHTML(sh, hits.get(sh.id))).join('')}</div>`;
      })
      .join('');
  }
  if (searching) {
    return query
      ? `<p class="search-empty muted">Keine Stundenzettel gefunden</p>`
      : `<p class="search-empty muted">Suche nach einer Baustelle (z. B. „Lindenstraße“) oder einem Datum (z. B. „15.09.“ oder „15.09.26“).</p>`;
  }
  return `<div class="empty">
      <div class="empty-icon">${svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>', 44)}</div>
      <p><b>Noch keine Stundenzettel</b></p>
      <p class="muted">${settings.name.trim() ? 'Tippe unten auf „Neuer Stundenzettel“ und wähle eine Woche.' : 'Trage zuerst oben links unter Einstellungen deinen Namen ein. Danach tippst du unten auf „Neuer Stundenzettel“.'}</p>
    </div>`;
}

/** Suchbegriff deuten: Datum „15.09.“ / „15.9.26“ / „15.09.2026“ oder Text */
function parseQuery(raw) {
  const q = raw.trim();
  if (!q) return null;
  const m = q.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2}|\d{4})?$/);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    return { day: Number(m[1]), month: Number(m[2]), year };
  }
  return { text: q.toLowerCase() };
}

/** Treffer in einem Zettel: { label } für die Zeile in der Liste, sonst null */
function searchSheet(s, query) {
  const days = sheetActiveDays(s);
  if (query.text) {
    const found = new Set();
    const dayNames = [];
    for (const i of days) {
      let dayHit = false;
      for (const r of s.days[i].rows) {
        for (const v of [r.site, r.work]) {
          if (v && v.toLowerCase().includes(query.text)) {
            found.add(v.trim());
            dayHit = true;
          }
        }
      }
      if (dayHit) dayNames.push(WEEKDAYS_SHORT[i]);
    }
    return found.size ? { label: `${dayNames.join(', ')} · ${[...found].join(', ')}` } : null;
  }
  for (const i of days) {
    const d = sheetDate(s, i);
    if (d.getDate() === query.day && d.getMonth() + 1 === query.month && (query.year == null || d.getFullYear() === query.year)) {
      return { label: `${WEEKDAYS[i]}, ${fmtShort(d)}` };
    }
  }
  return null;
}

function refreshListBody() {
  const body = document.getElementById('list-body');
  if (body) body.innerHTML = listBodyHTML();
}

/** Höhe der festen Kopfzeile, damit Sprungziele nicht darunter verschwinden */
const navHeight = () => document.querySelector('.nav')?.offsetHeight || 0;

function scrollToMonth(key) {
  const el = document.getElementById(`m-${key}`);
  if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - navHeight() - 4);
}

/** Knopf „nach oben“ erst zeigen, wenn weit genug gescrollt wurde */
function updateTopButton() {
  const btn = document.querySelector('.to-top');
  if (btn) btn.classList.toggle('show', window.scrollY > 300);
}
window.addEventListener('scroll', () => requestAnimationFrame(updateTopButton), { passive: true });

const fmtDays = (n) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`;

function statsCardHTML() {
  const year = new Date().getFullYear();
  const st = absenceStats().get(year) || { urlaub: 0, krank: 0 };
  return `<a class="card stats-card" href="#/uebersicht">
    <span class="stats-year">${year}</span>
    <span class="stats-item"><span class="stats-num">${st.urlaub}</span><span class="stats-label">${st.urlaub === 1 ? 'Urlaubstag' : 'Urlaubstage'}</span></span>
    <span class="stats-item"><span class="stats-num">${st.krank}</span><span class="stats-label">${st.krank === 1 ? 'Krankheitstag' : 'Krankheitstage'}</span></span>
    <span class="list-chevron">${ICON.chevronRight}</span>
  </a>`;
}

const balanceClass = (min) => (min > 0 ? 'plus' : min < 0 ? 'minus' : '');

function renderStats() {
  const stats = absenceStats();
  const account = settings.overtime ? overtimeAccount() : new Map();
  const current = new Date().getFullYear();
  if (!stats.has(current)) stats.set(current, { urlaub: 0, krank: 0 });
  account.forEach((_, y) => { if (!stats.has(y)) stats.set(y, { urlaub: 0, krank: 0 }); });
  const years = [...stats.keys()].sort((a, b) => b - a);
  app.innerHTML = `
    <header class="nav">
      <button class="nav-btn back" data-act="back">${ICON.back}<span>Zettel</span></button>
      <span class="nav-title">Übersicht</span>
      <span class="nav-btn"></span>
    </header>
    ${years
      .map((y) => {
        const st = stats.get(y);
        return `<h2 class="section-title">${y}${y === current ? ' (laufendes Jahr)' : ''}</h2>
        <div class="card form">
          <div class="field"><span>Urlaubstage</span><b>${fmtDays(st.urlaub)}</b></div>
          <div class="field"><span>Krankheitstage</span><b>${fmtDays(st.krank)}</b></div>
        </div>
        ${account.has(y) ? overtimeYearHTML(y, account.get(y)) : ''}`;
      })
      .join('')}
    <p class="footnote">Gezählt werden alle Tage, die du als Urlaub oder Krankheit markiert hast.</p>
    ${settings.overtime && sheets.length ? `<p class="footnote">Überstunden: Pro Werktag zählt alles über ${fmtH(Math.round((settings.target * 60) / 5))}. Nur Tage mit Stundenzettel zählen. Plus und Minus werden verrechnet.</p>` : ''}`;
}

function overtimeYearHTML(year, months) {
  const rows = [...months.keys()]
    .sort((a, b) => b - a)
    .map(
      (m) => `<button class="field month-link" data-act="goto-month" data-month="${year * 100 + m}">
        <span>${MONTHS[m - 1]}</span>
        <span class="month-link-value"><b class="${balanceClass(months.get(m))}">${fmtSigned(months.get(m))}</b><span class="list-chevron">${ICON.chevronRight}</span></span>
      </button>`
    )
    .join('');
  const total = yearBalance(months);
  return `<div class="card form overtime-card">
    <div class="field year-total"><span>Überstunden ${year}</span><b class="${balanceClass(total)}">${fmtSigned(total)}</b></div>
    ${rows}
  </div>`;
}

function listRowHTML(s, hit) {
  const sent = !!s.sentAt;
  return `<div class="swipe">
    <div class="swipe-track">
      <a class="list-row" href="#/zettel/${encodeURIComponent(s.id)}">
        <span class="status ${sent ? 'sent' : 'open'}">${sent ? ICON.check : ''}</span>
        <span class="list-main">
          <span class="list-title">${fmtShort(sheetFirstDate(s))} – ${fmtShort(sheetLastDate(s))}</span>
          <span class="list-sub">KW ${isoWeek(parseDate(s.weekStart))} · ${sent ? 'gesendet' : 'offen'}</span>
          ${hit ? `<span class="list-hit">${escapeHtml(hit.label)}</span>` : ''}
        </span>
        <span class="list-hours">${fmtH(sheetTotal(s))}</span>
        <span class="list-chevron">${ICON.chevronRight}</span>
      </a>
      <button class="swipe-del" data-act="delete" data-id="${s.id}">Löschen</button>
    </div>
  </div>`;
}

// ───────────────────────── Editor ─────────────────────────

let editorId = null;
let suggestions = { site: [], work: [] };
/** Aufgeklappte leere Wochenendtage („Zettel-ID:Tag“), nur solange die App offen ist */
const expandedDays = new Set();

function renderEditor(id) {
  const s = findSheet(id);
  if (!s) {
    location.replace('#/');
    return;
  }
  editorId = id;
  suggestions = { site: collectSuggestions('site'), work: collectSuggestions('work') };

  app.innerHTML = `
    <header class="nav">
      <button class="nav-btn back" data-act="back">${ICON.back}<span>Zettel</span></button>
      <button class="nav-title" data-act="week" id="nav-title">${fmtShort(sheetFirstDate(s))} – ${fmtShort(sheetLastDate(s))}</button>
      <span class="nav-actions">
        <button class="nav-btn" data-act="share" aria-label="Als PDF senden">${ICON.share}</button>
        <button class="nav-btn" data-act="more" aria-label="Weitere Aktionen">${ICON.more}</button>
      </span>
      <div class="daybar" id="daybar">${dayBarHTML(s)}</div>
    </header>
    <div id="days">${daysHTML(s)}</div>
    <div class="card summary" id="summary">${summaryHTML(s)}</div>`;
}

/** Kurze Stundenangabe für die Tagesleiste: „9,5“ bzw. „9:30“ */
const fmtTiny = (min) =>
  settings.hourFormat === 'hm'
    ? `${Math.floor(min / 60)}:${pad(min % 60)}`
    : String(Math.round((min / 60) * 100) / 100).replace('.', ',');

/** Tagesleiste: Mo–So mit Stunden, heute markiert */
function dayBarHTML(s) {
  const today = new Date();
  return `${s.days
    .map((d, i) => {
      if (!sheetIsActive(s, i)) return `<span class="db-day off"><span class="db-name">${WEEKDAYS_SHORT[i]}</span><span class="db-h"></span></span>`;
      const total = dayTotal(d);
      const cls = ['db-day', sameDay(sheetDate(s, i), today) ? 'today' : '', d.status ? `status-${d.status} has-status` : ''].join(' ');
      return `<button class="${cls}" data-act="jump" data-day="${i}">
        <span class="db-name">${WEEKDAYS_SHORT[i]}</span>
        <span class="db-h">${d.status ? DAY_STATUS_SHORT[d.status].slice(0, 2) + '.' : total ? fmtTiny(total) : '–'}</span>
      </button>`;
    })
    .join('')}`;
}

/** Alle Tage; zusammenhängende Tage des anderen Monats werden zu einer schmalen Zeile */
function daysHTML(s) {
  let html = '';
  for (let i = 0; i < 7; ) {
    if (sheetIsActive(s, i)) {
      html += dayHTML(s, i);
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < 7 && !sheetIsActive(s, j + 1)) j++;
    const range = i === j ? WEEKDAYS_SHORT[i] : `${WEEKDAYS_SHORT[i]} – ${WEEKDAYS_SHORT[j]}`;
    html += `<div class="other-month">${range} ${i === 0 ? 'vorheriger' : 'nächster'} Monat</div>`;
    i = j + 1;
  }
  return html;
}

/** Leerer Sa/So ohne Tagesart wird eingeklappt angezeigt */
const dayCollapsed = (s, i) => {
  const d = s.days[i];
  return i >= 5 && !d.status && !d.pause && d.rows.every(rowIsEmpty) && !expandedDays.has(`${s.id}:${i}`);
};

function dayHTML(s, i) {
  const day = s.days[i];
  const date = sheetDate(s, i);
  const head = `<div class="day-head">
      <div><b>${WEEKDAYS[i]}</b> <span class="muted">${fmtDayMonth(date)}</span></div>
      <div class="day-actions">
        <button class="chip-btn status-btn ${day.status ? 'set status-' + day.status : ''}" data-act="status">${day.status ? DAY_STATUS_SHORT[day.status] : 'Arbeit'} ▾</button>
      </div>
    </div>`;
  if (dayCollapsed(s, i)) {
    return `<section class="day collapsed" data-day="${i}">
      ${head}
      <button class="link-btn expand-btn" data-act="expand">${ICON.plus} Arbeit eintragen</button>
    </section>`;
  }
  if (day.status) {
    const credit = dayTotal(day);
    return `<section class="day status-day status-${day.status}" data-day="${i}">
      ${head}
      <div class="status-body">
        <b>${DAY_STATUS[day.status]}</b>
        ${day.status === 'feiertag' && holidayName(date) ? `<span>${holidayName(date)}</span>` : ''}
        <span class="muted">${credit ? `${fmtH(credit)} gutgeschrieben` : 'keine Stunden gutgeschrieben'}</span>
      </div>
      <div class="day-foot"><span class="day-total">Gesamt <b>${fmtH(credit)}</b></span></div>
    </section>`;
  }
  return `<section class="day" data-day="${i}">
    ${head}
    ${day.rows.map((r) => rowHTML(r, day.rows.length)).join('')}
    <div class="day-foot">
      <button class="link-btn" data-act="addrow">${ICON.plus} Zeile</button>
      <button class="pill ${day.pause == null ? 'empty' : ''}" data-act="pause">Pause${day.pause == null ? '' : ` ${fmtH(day.pause)}`}${pauseMissing(day) ? ' ⚠️' : ''}</button>
      <span class="day-total">Gesamt <b>${fmtH(dayTotal(day))}</b></span>
    </div>
  </section>`;
}

function chooseStatus(btn) {
  const { s, dayIndex, day } = rowContext(btn);
  const set = (status) => {
    if (status) day.status = status;
    else delete day.status;
    saveSheets(s);
    refreshDay(dayIndex);
  };
  actionSheet([
    { label: `${day.status ? '' : '✓ '}Arbeitstag`, run: () => set(null) },
    ...Object.entries(DAY_STATUS).map(([key, label]) => ({
      label: `${day.status === key ? '✓ ' : ''}${label}`,
      run: () => set(key),
    })),
  ]);
}

/** Zeit eingetragen, aber Baustelle bzw. Art der Arbeit noch leer → Warnsymbol */
const fieldMissing = (r, field) => (r.start != null || r.end != null) && !String(r[field] || '').trim();

function rowHTML(r, rowCount) {
  const m = rowMinutes(r);
  const timeBtn = (which, label) => {
    const v = r[which];
    return `<button class="time ${v == null ? 'empty' : ''}" data-act="time" data-which="${which}">${v == null ? label : fmtTime(v)}</button>`;
  };
  return `<div class="row" data-row="${r.id}">
    <div class="row-times">
      ${timeBtn('start', 'Beginn')}
      <span class="arrow">–</span>
      ${timeBtn('end', 'Ende')}
      <span class="row-hours">${m == null ? '' : fmtH(m)}</span>
      ${rowCount > 1 ? `<button class="row-del" data-act="delrow" aria-label="Zeile löschen">${ICON.close}</button>` : '<span class="row-del-space"></span>'}
    </div>
    <div class="suggest-wrap ${fieldMissing(r, 'site') ? 'missing' : ''}"><span class="field-icon">${ICON.pin}</span><span class="warn" aria-label="fehlt">⚠️</span><input class="txt" data-f="site" placeholder="Baustelle" value="${escapeHtml(r.site)}" autocomplete="off" autocapitalize="sentences" enterkeyhint="next"></div>
    <div class="suggest-wrap ${fieldMissing(r, 'work') ? 'missing' : ''}"><span class="field-icon">${ICON.tool}</span><span class="warn" aria-label="fehlt">⚠️</span><input class="txt" data-f="work" placeholder="Art der Arbeit" value="${escapeHtml(r.work)}" autocomplete="off" autocapitalize="sentences" enterkeyhint="done"></div>
  </div>`;
}

function summaryHTML(s) {
  let html = `<div class="sum-row"><span>Stunden Gesamt</span><b>${fmtH(sheetTotal(s))}</b></div>`;
  if (settings.overtime) {
    const target = sheetTarget(s);
    html += `<div class="sum-row"><span>Überstunden <span class="muted">(ab ${fmtH(Math.round(target * 60))})</span></span><b>${fmtH(sheetOvertime(s, target))}</b></div>`;
  }
  return html;
}

const currentSheet = () => findSheet(editorId);

function refreshDay(i) {
  const s = currentSheet();
  const el = document.querySelector(`.day[data-day="${i}"]`);
  if (el) el.outerHTML = dayHTML(s, i);
  refreshSummary();
}
function refreshSummary() {
  const s = currentSheet();
  const el = document.getElementById('summary');
  if (el) el.innerHTML = summaryHTML(s);
  const bar = document.getElementById('daybar');
  if (bar) bar.innerHTML = dayBarHTML(s);
}

/** Zum Tag scrollen, ohne dass er unter der festen Kopfzeile verschwindet */
function jumpToDay(i) {
  const el = document.querySelector(`.day[data-day="${i}"]`);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - navHeight() - 8, behavior: 'smooth' });
}
function refreshAll() {
  const y = window.scrollY;
  renderEditor(editorId);
  window.scrollTo(0, y);
}

function rowContext(el) {
  const s = currentSheet();
  const dayEl = el.closest('.day');
  const rowEl = el.closest('.row');
  const dayIndex = dayEl ? Number(dayEl.dataset.day) : null;
  const day = dayIndex != null ? s.days[dayIndex] : null;
  const rowIndex = rowEl && day ? day.rows.findIndex((r) => r.id === rowEl.dataset.row) : -1;
  return { s, dayIndex, day, rowIndex, row: rowIndex >= 0 ? day.rows[rowIndex] : null };
}

function editTime(btn) {
  const { s, dayIndex, day, rowIndex, row } = rowContext(btn);
  const which = btn.dataset.which;
  let initial = row[which];
  if (initial == null) {
    if (which === 'start') {
      const prev = day.rows.slice(0, rowIndex).reverse().find((r) => r.end != null);
      initial = prev ? prev.end : 8 * 60;
    } else {
      initial = row.start != null ? Math.min(row.start + 60, 23 * 60 + 45) : 17 * 60;
    }
  }
  timePicker(which === 'start' ? 'Arbeitsbeginn' : 'Arbeitsende', initial, row[which] != null, (value) => {
    row[which] = value;
    // Ende übernimmt die nächste Zeile automatisch als Beginn
    if (which === 'end' && value != null) {
      const next = day.rows[rowIndex + 1];
      if (next && next.start == null) next.start = value;
    }
    saveSheets(s);
    refreshDay(dayIndex);
  });
  return s;
}

function editPause(btn) {
  const { s, dayIndex, day } = rowContext(btn);
  const step = settings.minuteStep;
  const values = Array.from({ length: 240 / step + 1 }, (_, i) => i * step);
  wheelPicker('Pause', [{ values, label: (v) => `${fmtH(v)}` }], [day.pause], ([v]) => {
    day.pause = v;
    saveSheets(s);
    refreshDay(dayIndex);
  });
}

function changeWeek() {
  const s = currentSheet();
  weekPicker(sheetFirstDate(s), s.id, (anchor) => {
    if (existingSheet(anchor, s.id)) {
      toast('Für diese Woche gibt es schon einen Stundenzettel');
      return;
    }
    const n = newSheet(anchor, '');
    s.weekStart = n.weekStart;
    s.year = n.year;
    s.month = n.month;
    markHolidays(s);
    saveSheets(s);
    refreshAll();
  });
}

function moreMenu() {
  const s = currentSheet();
  actionSheet([
    { label: 'Als PDF senden', run: () => sendWithCheck(s) },
    s.sentAt
      ? { label: 'Als offen markieren', run: () => { s.sentAt = null; saveSheets(s); toast('Als offen markiert'); } }
      : { label: 'Als gesendet markieren', run: () => { s.sentAt = Date.now(); saveSheets(s); toast('Als gesendet markiert'); } },
    { label: 'Stundenzettel löschen', destructive: true, run: () => askDelete(s.id, true) },
  ]);
}

function sendWithCheck(s) {
  const problems = sheetProblems(s);
  if (!problems.length) return sharePdf(s, true);
  // „Trotzdem senden“ ist ein eigenes Antippen – nötig für Zwischenablage und Teilen-Menü
  confirmDialog(
    'Bitte prüfen',
    `<ul class="problem-list">${problems.slice(0, 12).map((p) => `<li>${escapeHtml(p)}</li>`).join('')}${problems.length > 12 ? `<li>… und ${problems.length - 12} weitere</li>` : ''}</ul>`,
    'Trotzdem senden',
    () => sharePdf(s, true),
    false,
    'Zurück'
  );
}

function askDelete(id, leave) {
  const s = findSheet(id);
  if (!s) return;
  confirmDialog('Stundenzettel löschen?', `${sheetTitle(s)} wird endgültig gelöscht.`, 'Löschen', () => {
    sheets = sheets.filter((x) => x.id !== id);
    saveSheets();
    if (leave) goBack();
    else renderList();
  }, true);
}

// ───────────────────────── PDF & Senden ─────────────────────────

function pdfFileFor(s) {
  const blob = buildTimesheetPdf(s, settings.overtime ? sheetTarget(s) : null);
  return new File([blob], `${sheetTitle(s)}.pdf`, { type: 'application/pdf' });
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function sharePdf(s, isSend) {
  let file;
  try {
    file = pdfFileFor(s);
  } catch (e) {
    toast('PDF konnte nicht erstellt werden');
    return;
  }
  // Eine Web-App kann den Mail-Betreff nicht direkt setzen; der Titel kommt in die Zwischenablage.
  if (isSend && navigator.clipboard) {
    navigator.clipboard.writeText(sheetTitle(s)).then(
      () => toast('Betreff kopiert – in Mail bei „Betreff“ einsetzen', 4000),
      () => {}
    );
  }
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      // Ohne title/text, damit in der Mail nur der Anhang steht
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      downloadFile(file);
    }
  } else {
    downloadFile(file);
  }
  if (isSend && !s.sentAt) {
    confirmDialog('Wurde der Stundenzettel gesendet?', 'Dann wird er in der Liste mit einem Haken markiert.', 'Ja, gesendet', () => {
      s.sentAt = Date.now();
      saveSheets(s);
    });
  }
}

// ───────────────────────── Einstellungen ─────────────────────────

function renderSettings() {
  app.innerHTML = `
    <header class="nav">
      <button class="nav-btn back" data-act="back">${ICON.back}<span>Zettel</span></button>
      <span class="nav-title">Einstellungen</span>
      <span class="nav-btn"></span>
    </header>
    <h2 class="section-title">Stundenzettel</h2>
    <div class="card form">
      <label class="field"><span>Name</span><input data-s="name" placeholder="Vor- und Nachname" value="${escapeHtml(settings.name)}" autocomplete="name" enterkeyhint="done"></label>
    </div>
    <p class="footnote">Steht auf jedem neuen Stundenzettel.</p>

    <h2 class="section-title">Eingabe &amp; Anzeige</h2>
    <div class="card form">
      <label class="field"><span>Zeitschritte</span>
        <select data-s="minuteStep">
          <option value="15" ${settings.minuteStep === 15 ? 'selected' : ''}>15 Minuten</option>
          <option value="30" ${settings.minuteStep === 30 ? 'selected' : ''}>30 Minuten</option>
        </select></label>
      <label class="field"><span>Stundenformat</span>
        <select data-s="hourFormat">
          <option value="dec" ${settings.hourFormat !== 'hm' ? 'selected' : ''}>Dezimal (8,50)</option>
          <option value="hm" ${settings.hourFormat === 'hm' ? 'selected' : ''}>Stunden/Min. (8h 30m)</option>
        </select></label>
    </div>
    <p class="footnote">Gilt in der App und im PDF.</p>

    <h2 class="section-title">Überstunden</h2>
    <div class="card form">
      <label class="field toggle-field"><span>Überstunden berechnen</span><input type="checkbox" class="toggle" data-s="overtime" ${settings.overtime ? 'checked' : ''}></label>
      <label class="field ${settings.overtime ? '' : 'disabled'}" id="target-field"><span>Überstunden ab (h pro Woche)</span><input data-s="target" type="text" inputmode="decimal" value="${String(settings.target).replace('.', ',')}" ${settings.overtime ? '' : 'disabled'} enterkeyhint="done"></label>
      <label class="field toggle-field ${settings.overtime ? '' : 'disabled'}" id="prorate-field"><span>Überstunden bei Teilwochen anteilig</span><input type="checkbox" class="toggle" data-s="prorateTarget" ${settings.prorateTarget ? 'checked' : ''} ${settings.overtime ? '' : 'disabled'}></label>
    </div>
    <p class="footnote">Alles über dieser Stundenzahl sind Überstunden. „Anteilig“: Bei einer halben Woche am Monatsende zählt nur der Anteil, z. B. 24 h für 3 Tage.</p>

    <h2 class="section-title">Krankheit, Urlaub, Feiertage</h2>
    <div class="card form">
      <label class="field"><span>Bundesland</span>
        <select data-s="state">${Object.entries(STATES)
          .map(([code, name]) => `<option value="${code}" ${settings.state === code ? 'selected' : ''}>${name}</option>`)
          .join('')}</select></label>
      <label class="field"><span>Stunden pro Tag</span><input data-s="hoursPerDay" type="text" inputmode="decimal" value="${String(settings.hoursPerDay).replace('.', ',')}" enterkeyhint="done"></label>
      ${Object.entries(DAY_STATUS)
        .map(
          ([key, label]) =>
            `<label class="field toggle-field"><span>${label}</span><input type="checkbox" class="toggle" data-s="credit.${key}" ${settings.credit[key] ? 'checked' : ''}></label>`
        )
        .join('')}
    </div>
    <p class="footnote">Eingeschaltet: Der Tag zählt mit den „Stunden pro Tag“. Ausgeschaltet: 0 Stunden.</p>

    <h2 class="section-title">Datensicherung</h2>
    <div class="card list">
      <button class="list-btn" data-act="backup-export">Sicherung speichern …</button>
      <label class="list-btn">Sicherung einlesen …<input type="file" accept="application/json,.json" data-act-change="backup-import" hidden></label>
    </div>
    <p class="footnote">Deine Zettel sind nur auf diesem iPhone. Speichere ab und zu eine Sicherung in iCloud Drive. Beim Einlesen geht nichts verloren.</p>
    <p class="footnote center muted">${sheets.length} Stundenzettel gespeichert</p>`;
}

function exportBackup() {
  const data = JSON.stringify({ app: 'stundenzettel', version: 1, exportedAt: new Date().toISOString(), sheets, settings }, null, 2);
  const file = new File([data], `Stundenzettel-Sicherung ${isoDate(new Date())}.json`, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file] }).catch((e) => {
      if (!e || e.name !== 'AbortError') downloadFile(file);
    });
  } else {
    downloadFile(file);
  }
}

async function importBackup(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.sheets;
    if (!Array.isArray(incoming) || !incoming.every((s) => s && s.id && s.weekStart && Array.isArray(s.days))) throw new Error('format');
    // Gleicher Zettel (ID): die zuletzt geänderte Fassung gewinnt, ohne Zeitstempel bleibt die in der App.
    // Eine Woche, die es in der App schon als anderen Zettel gibt, bleibt unverändert.
    const weekKey = (s) => `${s.weekStart}|${s.year}|${s.month}`;
    const byId = new Map(sheets.map((s) => [s.id, s]));
    const weeks = new Map(sheets.map((s) => [weekKey(s), s.id]));
    let added = 0;
    let updated = 0;
    let skipped = 0;
    for (const s of incoming) {
      const owner = weeks.get(weekKey(s));
      const current = byId.get(s.id);
      if ((owner && owner !== s.id) || (current && !((s.updatedAt || 0) > (current.updatedAt || 0)))) {
        skipped++;
        continue;
      }
      if (current) weeks.delete(weekKey(current));
      byId.set(s.id, s);
      weeks.set(weekKey(s), s.id);
      if (current) updated++;
      else added++;
    }
    sheets = [...byId.values()];
    saveSheets();
    renderSettings();
    const parts = [`${added} Stundenzettel neu`];
    if (updated) parts.push(`${updated} aktualisiert`);
    if (skipped) parts.push(`${skipped} übersprungen (schon vorhanden oder neuer in der App)`);
    toast(parts.join(', '), 4000);
  } catch {
    toast('Diese Datei ist keine gültige Sicherung');
  }
}

// ───────────────────────── Modale Fenster ─────────────────────────

const layer = document.getElementById('modal-layer');
let modalGen = 0;

function openModal(html, className = '') {
  const gen = ++modalGen;
  layer.innerHTML = `<div class="backdrop"></div><div class="modal ${className}" role="dialog" aria-modal="true">${html}</div>`;
  layer.classList.add('open');
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  requestAnimationFrame(() => requestAnimationFrame(() => gen === modalGen && layer.classList.add('show')));
  layer.querySelector('.backdrop').addEventListener('click', () => closeModal());
  return layer.querySelector('.modal');
}

function closeModal(immediate = false) {
  const gen = ++modalGen;
  layer.classList.remove('show');
  const clear = () => {
    if (gen !== modalGen) return;
    layer.classList.remove('open');
    layer.innerHTML = '';
  };
  if (immediate) clear();
  else setTimeout(clear, 260);
}

function modalHead(title, okLabel = 'Fertig') {
  return `<div class="modal-head">
    <button class="modal-btn" data-m="cancel">Abbrechen</button>
    <b>${title}</b>
    <button class="modal-btn strong" data-m="ok">${okLabel}</button>
  </div>`;
}

/** Scroll-Räder wie bei iOS. columns: [{ values, label }], initial: Werte je Spalte */
function wheelPicker(title, columns, initial, onDone, extraHTML = '', onExtra = null) {
  const ITEM = 40;
  const modal = openModal(
    `${modalHead(title)}
    <div class="wheels">
      ${columns
        .map(
          (col, ci) => `${ci > 0 && col.sep ? `<div class="wheel-sep">${col.sep}</div>` : ''}
        <div class="wheel" data-col="${ci}"><div class="wheel-list">${col.values
          .map((v) => `<div class="wheel-item">${col.label(v)}</div>`)
          .join('')}</div></div>`
        )
        .join('')}
      <div class="wheel-band"></div>
    </div>
    ${extraHTML}`,
    'sheet'
  );
  const lists = [...modal.querySelectorAll('.wheel-list')];
  const indexOf = (list) => Math.max(0, Math.min(list.children.length - 1, Math.round(list.scrollTop / ITEM)));
  const mark = (list) => {
    const idx = indexOf(list);
    [...list.children].forEach((el, i) => el.classList.toggle('sel', i === idx));
  };
  lists.forEach((list, ci) => {
    const col = columns[ci];
    let idx = col.values.indexOf(initial[ci]);
    if (idx < 0) {
      // nächstliegenden Wert wählen
      idx = col.values.reduce((best, v, i) => (Math.abs(v - initial[ci]) < Math.abs(col.values[best] - initial[ci]) ? i : best), 0);
    }
    list.scrollTop = idx * ITEM;
    mark(list);
    let raf = 0;
    list.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => mark(list));
    });
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.wheel-item');
      if (item) list.scrollTo({ top: [...list.children].indexOf(item) * ITEM, behavior: 'smooth' });
    });
  });
  modal.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    if (b.dataset.m === 'ok') {
      const vals = lists.map((list, ci) => columns[ci].values[indexOf(list)]);
      closeModal();
      onDone(vals);
    } else if (b.dataset.m === 'cancel') {
      closeModal();
    } else if (b.dataset.m === 'extra' && onExtra) {
      closeModal();
      onExtra();
    }
  });
}

function timePicker(title, initial, hasValue, onDone) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const step = settings.minuteStep;
  const minutes = Array.from({ length: 60 / step }, (_, i) => i * step);
  wheelPicker(
    title,
    [
      { values: hours, label: pad },
      { values: minutes, label: pad, sep: ':' },
    ],
    [Math.floor(initial / 60), Math.floor((initial % 60) / step) * step],
    ([h, m]) => onDone(h * 60 + m),
    hasValue ? `<button class="modal-wide destructive" data-m="extra">Zeit löschen</button>` : '',
    () => onDone(null)
  );
}

function weekPicker(initial, excludeId, onPick) {
  let selected = startOfDay(initial);
  let month = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const modal = openModal(`${modalHead('Woche wählen', 'Übernehmen')}<div class="wp"></div>`, 'sheet');
  const wp = modal.querySelector('.wp');

  function draw() {
    const preview = newSheet(selected, '');
    const weeks = [];
    const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    for (let w = mondayOf(month); w < next; w = addDays(w, 7)) weeks.push(w);
    const exists = existingSheet(selected, excludeId);
    const today = new Date();

    wp.innerHTML = `
      <div class="wp-nav">
        <button class="icon-btn" data-wp="prev" aria-label="Voriger Monat">${ICON.chevronLeft}</button>
        <b>${MONTHS[month.getMonth()]} ${month.getFullYear()}</b>
        <button class="icon-btn" data-wp="next" aria-label="Nächster Monat">${ICON.chevronRight}</button>
      </div>
      <div class="wp-grid">
        <div class="wp-h">KW</div>${WEEKDAYS_SHORT.map((d) => `<div class="wp-h">${d}</div>`).join('')}
        ${weeks
          .map((w) => {
            const inWeek = isoDate(w) === preview.weekStart;
            return `<div class="wp-kw">${isoWeek(w)}</div>${[0, 1, 2, 3, 4, 5, 6]
              .map((i) => {
                const d = addDays(w, i);
                const cls = [
                  'wp-day',
                  d.getMonth() !== month.getMonth() ? 'out' : '',
                  inWeek ? 'in-week' : '',
                  inWeek && d.getMonth() + 1 === preview.month && d.getFullYear() === preview.year ? 'in-sheet' : '',
                  sameDay(d, selected) ? 'sel' : '',
                  sameDay(d, today) ? 'today' : '',
                ].join(' ');
                return `<button class="${cls}" data-date="${isoDate(d)}">${d.getDate()}</button>`;
              })
              .join('')}`;
          })
          .join('')}
      </div>
      <div class="wp-preview">
        <b>${sheetTitle(preview)}</b>
        <span class="muted">${exists ? (excludeId ? 'Für diese Woche gibt es schon einen Zettel' : 'Gibt es schon – wird geöffnet') : 'Ausgegraute Tage gehören zum anderen Monat'}</span>
      </div>`;
  }
  draw();

  modal.addEventListener('click', (e) => {
    const t = e.target.closest('[data-wp],[data-date],[data-m]');
    if (!t) return;
    if (t.dataset.wp === 'prev') month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
    else if (t.dataset.wp === 'next') month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    else if (t.dataset.date) selected = parseDate(t.dataset.date);
    else if (t.dataset.m === 'cancel') return closeModal();
    else if (t.dataset.m === 'ok') {
      closeModal();
      onPick(selected);
      return;
    }
    draw();
  });
}

function actionSheet(actions) {
  const modal = openModal(
    `<div class="action-group">${actions
      .map((a, i) => `<button class="action ${a.destructive ? 'destructive' : ''}" data-i="${i}">${a.label}</button>`)
      .join('')}</div>
    <button class="action cancel" data-i="-1">Abbrechen</button>`,
    'actions'
  );
  modal.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    closeModal();
    const a = actions[Number(b.dataset.i)];
    // sofort ausführen: Zwischenablage und Teilen-Menü funktionieren in Safari nur direkt beim Antippen
    if (a) a.run();
  });
}

function confirmDialog(title, message, okLabel, onOk, destructive = false, cancelLabel = 'Abbrechen') {
  const modal = openModal(
    `<div class="alert-body"><b>${title}</b><div class="alert-msg">${message}</div></div>
    <div class="alert-buttons">
      <button data-c="no">${cancelLabel}</button>
      <button data-c="yes" class="${destructive ? 'destructive' : 'strong'}">${okLabel}</button>
    </div>`,
    'alert'
  );
  modal.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    closeModal();
    if (b.dataset.c === 'yes') onOk();
  });
}

let toastTimer = 0;
function toast(text, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ───────────────────────── Vorschläge (Baustelle / Art der Arbeit) ─────────────────────────

/** Feste Leiste direkt über der Tastatur, zeigt die Vorschläge zum gerade bearbeiteten Feld */
const suggestBar = document.createElement('div');
suggestBar.id = 'suggest-bar';
suggestBar.innerHTML = '<div class="suggest-grid"></div>';
document.body.appendChild(suggestBar);
const suggestGrid = suggestBar.firstChild;
let suggestInput = null;

/** Art der Arbeit: Teile vor dem letzten Komma (fertig) und der Text dahinter (Suchbegriff) */
function workParts(value) {
  const parts = value.split(',');
  const last = parts.pop().trim();
  return { done: parts.map((p) => p.trim()).filter(Boolean), last };
}
const isKnown = (field, text) => suggestions[field].some((v) => v.toLowerCase() === text.toLowerCase());

function suggestionsFor(input) {
  const field = input.dataset.f;
  let q = input.value.trim().toLowerCase();
  let used = [];
  if (field === 'work') {
    const { done, last } = workParts(input.value);
    used = done.map((v) => v.toLowerCase());
    // Ein vollständiger Eintrag am Ende gilt als ausgewählt, danach wird alles Übrige vorgeschlagen
    if (last && isKnown('work', last)) {
      used.push(last.toLowerCase());
      q = '';
    } else {
      q = last.toLowerCase();
    }
  }
  const match = (query) =>
    suggestions[field].filter((v) => {
      const l = v.toLowerCase();
      return l !== query && !used.includes(l) && (!query || l.includes(query));
    });
  const list = match(q);
  // Art der Arbeit: Passt eigener Text zu keinem Vorschlag, trotzdem alle zum Anhängen zeigen
  return field === 'work' && q && !list.length ? match('') : list;
}

function showChips(input) {
  suggestInput = input;
  const list = suggestionsFor(input).slice(0, 30);
  suggestGrid.innerHTML = list.map((v) => `<button class="chip" data-chip="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
  suggestGrid.scrollLeft = 0;
  suggestBar.classList.toggle('show', list.length > 0);
  placeSuggestBar();
}
function hideChips() {
  suggestInput = null;
  suggestBar.classList.remove('show');
}

/** Leiste an die Oberkante der Tastatur setzen und das Feld darüber sichtbar halten */
function placeSuggestBar() {
  if (!suggestBar.classList.contains('show')) return;
  const vv = window.visualViewport;
  const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const top = bottom - suggestBar.offsetHeight;
  suggestBar.style.top = `${top}px`;
  if (suggestInput) {
    const r = suggestInput.getBoundingClientRect();
    if (r.bottom > top - 8) window.scrollBy(0, r.bottom - top + 16);
  }
}
if (window.visualViewport) {
  visualViewport.addEventListener('resize', () => requestAnimationFrame(placeSuggestBar));
  visualViewport.addEventListener('scroll', () => requestAnimationFrame(placeSuggestBar));
}

/** Vorschlag übernehmen: Baustelle ersetzt und schließt, Art der Arbeit hängt mit Komma an */
function pickChip(text) {
  const input = suggestInput;
  if (!input) return;
  if (input.dataset.f === 'work') {
    const { done, last } = workParts(input.value);
    // Angefangener Text wird durch den Vorschlag ersetzt, ein fertiger Eintrag bleibt stehen
    if (last && isKnown('work', last)) done.push(last);
    else if (last && !text.toLowerCase().includes(last.toLowerCase())) done.push(last);
    done.push(text);
    input.value = done.join(', ');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    hideChips();
    input.blur();
  }
}

// Antippen ohne Fokusverlust: Auswahl beim Loslassen, Wischen zum Blättern bleibt möglich
let chipTouch = null;
suggestBar.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  chipTouch = { x: t.clientX, y: t.clientY, chip: e.target.closest('[data-chip]') };
}, { passive: true });
suggestBar.addEventListener('touchend', (e) => {
  const t = e.changedTouches[0];
  const start = chipTouch;
  chipTouch = null;
  e.preventDefault(); // kein Klick danach, das Eingabefeld behält den Fokus
  if (start && start.chip && Math.abs(t.clientX - start.x) < 10 && Math.abs(t.clientY - start.y) < 10) {
    pickChip(start.chip.dataset.chip);
  }
}, { passive: false });
suggestBar.addEventListener('mousedown', (e) => e.preventDefault());
suggestBar.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-chip]');
  if (chip) pickChip(chip.dataset.chip);
});

// ───────────────────────── Ereignisse ─────────────────────────

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || layer.contains(el)) return;
  const act = el.dataset.act;
  switch (act) {
    case 'settings':
      location.hash = '#/einstellungen';
      break;
    case 'new':
      weekPicker(new Date(), null, (anchor) => {
        location.hash = `#/zettel/${encodeURIComponent(openOrCreate(anchor))}`;
      });
      break;
    case 'delete':
      askDelete(el.dataset.id, false);
      break;
    case 'back':
      goBack();
      break;
    case 'week':
      changeWeek();
      break;
    case 'more':
      moreMenu();
      break;
    case 'share':
      // direkt im Antippen ausführen: Teilen-Menü und Zwischenablage gehen in Safari sonst nicht
      sendWithCheck(currentSheet());
      break;
    case 'time':
      editTime(el);
      break;
    case 'pause':
      editPause(el);
      break;
    case 'status':
      chooseStatus(el);
      break;
    case 'addrow': {
      const { s, dayIndex, day } = rowContext(el);
      // Neue Zeile beginnt dort, wo die vorherige geendet hat
      const row = emptyRow();
      const prev = day.rows.at(-1);
      if (prev && prev.end != null) row.start = prev.end;
      day.rows.push(row);
      saveSheets(s);
      refreshDay(dayIndex);
      break;
    }
    case 'delrow': {
      const { s, dayIndex, day, rowIndex, row } = rowContext(el);
      const remove = () => {
        day.rows.splice(rowIndex, 1);
        saveSheets(s);
        refreshDay(dayIndex);
      };
      if (rowIsEmpty(row)) remove();
      else confirmDialog('Zeile löschen?', 'Die Einträge dieser Zeile gehen verloren.', 'Löschen', remove, true);
      break;
    }
    case 'backup-export':
      exportBackup();
      break;
    case 'search':
      searchQuery = '';
      renderList();
      window.scrollTo(0, 0);
      document.querySelector('[data-search]').focus();
      break;
    case 'search-close':
      searchQuery = null;
      renderList();
      window.scrollTo(0, 0);
      break;
    case 'to-top':
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;
    case 'goto-month':
      pendingMonth = Number(el.dataset.month);
      location.replace('#/');
      break;
    case 'jump':
      jumpToDay(Number(el.dataset.day));
      break;
    case 'expand': {
      const { s, dayIndex } = rowContext(el);
      expandedDays.add(`${s.id}:${dayIndex}`);
      refreshDay(dayIndex);
      break;
    }
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.f) {
    const s = currentSheet();
    if (!s) return;
    const { row } = rowContext(t);
    if (row) {
      row[t.dataset.f] = t.value;
      t.closest('.suggest-wrap').classList.toggle('missing', fieldMissing(row, t.dataset.f));
      const { day } = rowContext(t);
      const pill = t.closest('.day')?.querySelector('[data-act="pause"]');
      if (pill && day.pause == null) pill.textContent = `Pause${pauseMissing(day) ? ' ⚠️' : ''}`;
    }
    showChips(t);
    saveSheets(s);
  } else if (t.dataset.search != null) {
    searchQuery = t.value;
    refreshListBody();
  } else if (t.dataset.s) {
    const key = t.dataset.s;
    if (key === 'overtime') {
      settings.overtime = t.checked;
      ['target-field', 'prorate-field'].forEach((fid) => {
        const field = document.getElementById(fid);
        field.classList.toggle('disabled', !t.checked);
        field.querySelector('input').disabled = !t.checked;
      });
    } else if (key === 'target' || key === 'hoursPerDay') {
      const v = parseFloat(t.value.replace(',', '.'));
      if (!Number.isNaN(v) && v >= 0) settings[key] = v;
    } else if (key === 'minuteStep') {
      settings.minuteStep = Number(t.value);
    } else if (key === 'prorateTarget') {
      settings[key] = t.checked;
    } else if (key.startsWith('credit.')) {
      settings.credit[key.slice(7)] = t.checked;
    } else {
      settings[key] = t.value;
    }
    saveSettings();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.dataset.actChange === 'backup-import') importBackup(e.target);
});

document.addEventListener('focusin', (e) => {
  if (e.target.matches('.txt')) showChips(e.target);
});
document.addEventListener('focusout', (e) => {
  if (e.target.matches('.txt') && suggestInput === e.target) hideChips();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])')) {
    // „Weiter“ springt zum nächsten Feld der Zeile
    if (e.target.dataset.f === 'site') e.target.closest('.row').querySelector('[data-f="work"]').focus();
    else e.target.blur();
    e.preventDefault();
  }
});

// ───────────────────────── Start ─────────────────────────

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
history.replaceState('root', '', location.hash || '#/');
route();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
