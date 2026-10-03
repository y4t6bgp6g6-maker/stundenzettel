'use strict';
// Erzeugt den Stundenzettel als einseitiges A4-PDF (Hochformat), ohne externe Bibliothek.
// Schrift: Helvetica (PDF-Standardschrift), Text in WinAnsi-Kodierung (Umlaute, ß, –).

const PDF_W = 595.28;
const PDF_H = 841.89;

const measureCtx = document.createElement('canvas').getContext('2d');
function measureText(text, size, bold) {
  measureCtx.font = `${bold ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`;
  return measureCtx.measureText(text).width;
}

// Unicode-Zeichen im Bereich 0x80–0x9F von WinAnsi
const WIN_ANSI = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

function pdfString(str) {
  let out = '';
  for (const ch of String(str)) {
    let c = ch.codePointAt(0);
    if (c > 0xff || (c >= 0x80 && c < 0xa0)) c = WIN_ANSI[c] ?? 0x3f; // '?'
    if (c < 0x20) c = 0x20;
    const s = String.fromCharCode(c);
    out += s === '(' || s === ')' || s === '\\' ? '\\' + s : s;
  }
  return out;
}

const num = (v) => (Math.round(v * 100) / 100).toString();

class PdfDoc {
  constructor() {
    this.ops = [];
  }
  // Koordinaten von oben links (wie am Bildschirm); PDF rechnet von unten links.
  fill(x, y, w, h, gray) {
    this.ops.push(`${num(gray)} g ${num(x)} ${num(PDF_H - y - h)} ${num(w)} ${num(h)} re f`);
  }
  line(x1, y1, x2, y2, width, gray) {
    this.ops.push(`${num(gray)} G ${num(width)} w ${num(x1)} ${num(PDF_H - y1)} m ${num(x2)} ${num(PDF_H - y2)} l S`);
  }
  text(str, x, baseline, size, bold, gray = 0) {
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(gray)} g ${num(x)} ${num(PDF_H - baseline)} Td (${pdfString(str)}) Tj ET`);
  }
  // Einzeiliger Text in einer Box: wird bei Bedarf verkleinert und notfalls gekürzt.
  textBox(str, x, y, w, h, size, bold, align = 'left', gray = 0) {
    let t = String(str ?? '').trim();
    if (!t) return;
    let s = size;
    let tw = measureText(t, s, bold);
    if (tw > w) {
      s = Math.max(5, (s * w) / tw);
      tw = measureText(t, s, bold);
      while (tw > w && t.length > 1) {
        t = t.slice(0, -2).trimEnd() + '…';
        tw = measureText(t, s, bold);
      }
    }
    const tx = align === 'right' ? x + w - tw : align === 'center' ? x + (w - tw) / 2 : x;
    this.text(t, tx, y + h / 2 + s * 0.35, s, bold, gray);
  }
  // Großer, fetter, zentrierter Text; mehrere Wörter werden bei Bedarf auf eigene Zeilen verteilt.
  labelBox(str, x, y, w, h, size) {
    const oneLine = measureText(str, size, true) <= w;
    const lines = oneLine ? [str] : str.split(/\s+/);
    let s = size;
    while (s > 6 && (lines.some((l) => measureText(l, s, true) > w) || lines.length * s * 1.2 > h)) s -= 0.5;
    const lineH = s * 1.2;
    const top = y + (h - lines.length * lineH) / 2;
    lines.forEach((l, i) => this.textBox(l, x, top + i * lineH, w, lineH, s, true, 'center'));
  }
  // Wie textBox, aber zu langer Text wird zuerst auf zwei Zeilen umbrochen, bevor er schrumpft.
  wrapBox(str, x, y, w, h, size, gray = 0) {
    const t = String(str ?? '').trim();
    if (!t) return;
    if (measureText(t, size, false) <= w) return this.textBox(t, x, y, w, h, size, false, 'left', gray);
    let s = Math.min(size, (h - 2) / 2.3);
    const words = t.split(/\s+/);
    const split = (sz) => {
      let first = '';
      let i = 0;
      while (i < words.length) {
        const next = first ? `${first} ${words[i]}` : words[i];
        if (measureText(next, sz, false) > w && first) break;
        first = next;
        i++;
      }
      return [first, words.slice(i).join(' ')];
    };
    let lines = split(s);
    while (s > 5.5 && (measureText(lines[0], s, false) > w || measureText(lines[1], s, false) > w)) {
      s -= 0.25;
      lines = split(s);
    }
    if (2.2 * s > h) return this.textBox(t, x, y, w, h, size, false, 'left', gray);
    const lineH = s * 1.1;
    const top = y + (h - 2 * lineH) / 2;
    lines.forEach((l, i) => this.textBox(l, x, top + i * lineH, w, lineH, s, false, 'left', gray));
  }
  output(info) {
    const content = this.ops.join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      `<< /Title (${pdfString(info.title)}) /Author (${pdfString(info.author)}) /Producer (Stundenzettel) >>`,
    ];
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets = [];
    objects.forEach((o, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    out += offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: 'application/pdf' });
  }
}

/**
 * @param sheet Stundenzettel
 * @param overtimeTarget Soll-Stunden pro Woche oder null, wenn Überstunden ausgeschaltet sind
 */
function buildTimesheetPdf(sheet, overtimeTarget) {
  const doc = new PdfDoc();
  const left = 36;
  const right = PDF_W - 36;
  const width = right - left;
  const fractions = [0.105, 0.09, 0.09, 0.075, 0.07, 0.19, 0.275, 0.105];
  const xs = [left];
  fractions.forEach((f) => xs.push(xs[xs.length - 1] + f * width));
  xs[xs.length - 1] = right;

  const BLACK = 0;
  const GREY_TEXT = 0.55;

  // Kopf
  doc.textBox('Stundenzettel', left, 38, width, 22, 16, true, 'center');
  const valueX = left + 95;
  doc.textBox('Name:', left, 70, 90, 14, 10, true);
  doc.textBox(sheet.name, valueX, 70, right - valueX, 14, 10, true);
  doc.textBox('Woche von:', left, 92, 90, 14, 10, true);
  doc.textBox(fmtShort(sheetFirstDate(sheet)), valueX, 92, 80, 14, 10, true);
  doc.textBox('Bis:', valueX + 95, 92, 30, 14, 10, true);
  doc.textBox(fmtShort(sheetLastDate(sheet)), valueX + 130, 92, 80, 14, 10, true);

  // Größen so wählen, dass die Tabelle die Seite füllt
  const tableTop = 118;
  const headerH = 26;
  const footerH = overtimeTarget == null ? 28 : 46;
  const bottom = PDF_H - 36 - footerH;
  // Mo–Fr mindestens 5 Zeilen, Sa/So mindestens 1; Krankheit/Urlaub usw. nur die Mindestzeilen
  const rowsOnPdf = (d, i) => (d.status ? pdfMinRows(i) : Math.max(d.rows.length, pdfMinRows(i)));
  const rowCount = sheet.days.reduce((n, d, i) => n + rowsOnPdf(d, i), 0);
  const rowH = Math.min(28, (bottom - tableTop - headerH) / Math.max(rowCount, 1));
  const fs = Math.max(5, Math.min(9.5, rowH * 0.48));

  // Tabellenkopf
  doc.fill(left, tableTop, width, headerH, 0.75);
  const headers = ['Tag', 'Arbeits-\nbeginn', 'Arbeits-\nende', 'Stunden', 'Pause', 'Baustelle', 'Art der Arbeit', 'Stunden\nGesamt'];
  headers.forEach((h, i) => {
    const lines = h.split('\n');
    lines.forEach((l, li) => {
      doc.textBox(l, xs[i] + 3, tableTop + 3 + li * 10, xs[i + 1] - xs[i] - 6, 10, 8.5, true);
    });
  });

  // Tage
  const textCols = [
    { c: 1, align: 'right' },
    { c: 2, align: 'right' },
    { c: 3, align: 'right' },
    { c: 5, align: 'left' },
    { c: 6, align: 'left' },
  ];
  let y = tableTop + headerH;
  const dayTops = [];
  sheet.days.forEach((day, i) => {
    const n = rowsOnPdf(day, i);
    const h = n * rowH;
    const active = sheetIsActive(sheet, i);
    const status = active ? day.status : null;
    dayTops.push(y);

    doc.fill(xs[0], y, xs[1] - xs[0], h, 0.87);
    if (!active) doc.fill(xs[1], y, right - xs[1], h, 0.93);

    for (let r = 1; r < n; r++) {
      const ly = y + r * rowH;
      for (const { c } of textCols) {
        if (status && c === 5) continue; // Spalte „Baustelle“ bleibt für den Text frei
        doc.line(xs[c], ly, xs[c + 1], ly, 0.4, 0.78);
      }
    }

    doc.textBox(WEEKDAYS[i], xs[0] + 3, y, xs[1] - xs[0] - 6, rowH, fs, true, 'left', active ? BLACK : GREY_TEXT);

    if (status) {
      doc.labelBox(DAY_STATUS[status], xs[5] + 4, y, xs[6] - xs[5] - 8, h, Math.min(14, Math.max(fs + 3, h * 0.3)));
      doc.textBox(fmtHours(dayTotal(day)), xs[7] + 3, y, xs[8] - xs[7] - 6, rowH, fs, false, 'right');
    } else if (active) {
      day.rows.forEach((row, r) => {
        const ry = y + r * rowH;
        const cell = (c, text, align) => doc.textBox(text, xs[c] + 3, ry, xs[c + 1] - xs[c] - 6, rowH, fs, false, align);
        if (row.start != null) cell(1, fmtTime(row.start), 'right');
        if (row.end != null) cell(2, fmtTime(row.end), 'right');
        const m = rowMinutes(row);
        if (m != null) cell(3, fmtHours(m), 'right');
        doc.wrapBox(row.site, xs[5] + 3, ry, xs[6] - xs[5] - 6, rowH, fs);
        doc.wrapBox(row.work, xs[6] + 3, ry, xs[7] - xs[6] - 6, rowH, fs);
      });
      const first = (c, text) => doc.textBox(text, xs[c] + 3, y, xs[c + 1] - xs[c] - 6, rowH, fs, false, 'right');
      if (day.pause > 0 || dayHasTimes(day)) first(4, fmtHours(day.pause));
      first(7, fmtHours(dayTotal(day)));
    }
    y += h;
  });
  const tableBottom = y;

  // Linien
  doc.line(left, tableTop, right, tableTop, 0.8, BLACK);
  doc.line(left, tableTop + headerH, right, tableTop + headerH, 0.8, BLACK);
  dayTops.slice(1).forEach((t) => doc.line(left, t, right, t, 0.8, BLACK));
  doc.line(left, tableBottom, right, tableBottom, 0.8, BLACK);
  xs.forEach((x) => doc.line(x, tableTop, x, tableBottom, 0.6, BLACK));

  // Summen
  let fy = tableBottom + 8;
  doc.textBox('Stunden Gesamt:', xs[5], fy, xs[7] - xs[5] - 6, 14, 10, true, 'right');
  doc.textBox(fmtHours(sheetTotal(sheet)), xs[7] + 3, fy, xs[8] - xs[7] - 6, 14, 10, true, 'right');
  if (overtimeTarget != null) {
    fy += 18;
    doc.textBox('Überstunden:', xs[5], fy, xs[7] - xs[5] - 6, 14, 10, true, 'right');
    doc.textBox(fmtHours(sheetOvertime(sheet, overtimeTarget)), xs[7] + 3, fy, xs[8] - xs[7] - 6, 14, 10, true, 'right');
  }

  return doc.output({ title: sheetTitle(sheet), author: sheet.name });
}
