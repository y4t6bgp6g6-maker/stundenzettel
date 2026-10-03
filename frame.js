'use strict';
// Kältetechnik-Rahmen für das PDF: Rohrleitung, Eis, Manometer, FSK-Schild und Yeti.
// Alles als Vektorgrafik; Koordinaten in Punkt von oben links (A4 = 595 × 842).
// Der Innenbereich x 46–549, y 50–735 bleibt frei – unten rechts sitzt der Yeti (ab x 455, y 690).

const C = {
  navy: [0.1, 0.24, 0.42],
  navyDark: [0.06, 0.15, 0.29],
  pipeDark: [0.22, 0.34, 0.47],
  pipe: [0.44, 0.57, 0.69],
  pipeLight: [0.66, 0.77, 0.87],
  shine: [0.9, 0.95, 1],
  ice: [0.86, 0.94, 1],
  iceEdge: [0.55, 0.72, 0.88],
  snow: [1, 1, 1],
  furEdge: [0.55, 0.67, 0.8],
  face: [0.78, 0.86, 0.94],
  helmet: [0.98, 0.77, 0.16],
  helmetDark: [0.86, 0.6, 0.06],
  belt: [0.52, 0.34, 0.17],
  brass: [0.85, 0.66, 0.24],
  red: [0.85, 0.2, 0.17],
  bottle: [0.36, 0.62, 0.78],
};

function drawFrame(doc) {
  const W = PDF_W;
  const H = PDF_H;
  const inset = 22; // Mittellinie der Rohrleitung

  // ── Rohrleitung rundherum (konzentrische Striche ergeben den Rohr-Glanz) ──
  [
    [16, C.pipeDark],
    [12, C.pipe],
    [7, C.pipeLight],
    [2.2, C.shine],
  ].forEach(([w, col]) => {
    doc.strokeColor(col);
    doc.lineWidth(w);
    doc.roundRectPath(inset, inset, W - 2 * inset, H - 2 * inset, 20);
    doc.doStroke();
  });

  // Rohrkupplungen
  const coupling = (x, y, vertical) => {
    const [w, h] = vertical ? [24, 11] : [11, 24];
    doc.fillColor(C.navyDark);
    doc.roundRectPath(x - w / 2, y - h / 2, w, h, 2.5);
    doc.doFill();
    doc.fillColor(C.pipeLight);
    if (vertical) doc.roundRectPath(x - w / 2 + 2, y - 1.2, w - 4, 2.4, 1.2);
    else doc.roundRectPath(x - 1.2, y - h / 2 + 2, 2.4, h - 4, 1.2);
    doc.doFill();
  };
  [190, 400, 610].forEach((y) => coupling(inset, y, true));
  [250, 470].forEach((y) => coupling(W - inset, y, true));
  [120, 470].forEach((x) => coupling(x, inset, false));
  [150].forEach((x) => coupling(x, H - inset, false));

  // ── Eis und Schnee auf der oberen Leitung ──
  const snowCap = (circles) => {
    doc.strokeColor(C.iceEdge);
    doc.lineWidth(1.6);
    circles.forEach(([x, y, r]) => { doc.ellipsePath(x, y, r, r * 0.8); doc.doStroke(); });
    doc.fillColor(C.snow);
    circles.forEach(([x, y, r]) => { doc.ellipsePath(x, y, r, r * 0.8); doc.doFill(); });
  };
  snowCap([[30, 22, 9], [44, 15, 9], [60, 14, 8], [75, 16, 7], [22, 34, 7]]);
  snowCap([[300 - 140, 15, 6], [300 + 140, 15, 6], [W - 120, 15, 7], [W - 104, 17, 5]]);

  // Eiszapfen unter der oberen Leitung
  const icicle = (x, len) => {
    doc.fillColor(C.ice);
    doc.strokeColor(C.iceEdge);
    doc.lineWidth(0.7);
    doc.moveTo(x - 3.5, inset + 6);
    doc.lineTo(x + 3.5, inset + 6);
    doc.lineTo(x, inset + 6 + len);
    doc.closePath();
    doc.doFillStroke();
  };
  [[62, 13], [70, 8], [140, 11], [148, 16], [156, 7], [445, 9], [453, 15], [490, 10]].forEach(([x, l]) => icicle(x, l));
  // Reif an den Kupplungen der Seitenleitungen
  [190, 400, 610].forEach((y) => snowCap([[inset - 2, y - 9, 5], [inset + 5, y - 8, 4]]));
  [250, 470].forEach((y) => snowCap([[W - inset + 2, y - 9, 5], [W - inset - 5, y - 8, 4]]));

  // ── Banner „Stundenzettel“ ──
  const bw = 236;
  const bx = (W - bw) / 2;
  doc.fillColor(C.navyDark);
  doc.roundRectPath(bx, 4, bw, 38, 9);
  doc.doFill();
  doc.fillColor(C.navy);
  doc.roundRectPath(bx + 2.5, 6.5, bw - 5, 33, 7);
  doc.doFill();
  doc.strokeColor(C.pipeLight);
  doc.lineWidth(0.9);
  doc.roundRectPath(bx + 5, 9, bw - 10, 28, 5);
  doc.doStroke();
  bolt(doc, bx + 12, 23);
  bolt(doc, bx + bw - 12, 23);
  snowflake(doc, bx + 30, 23, 6.5, C.ice, 1);
  snowflake(doc, bx + bw - 30, 23, 6.5, C.ice, 1);
  doc.textBox('Stundenzettel', bx + 40, 9, bw - 80, 28, 20, true, 'center', C.snow);
  snowCap([[bx + 18, 5, 6], [bx + 30, 3, 5], [bx + bw - 22, 4, 6]]);

  // ── Manometer oben rechts ──
  gauge(doc, W - 48, 48, 27);

  // ── Schild „FSK“ unten ──
  const pw = 150;
  const px = (W - pw) / 2 - 30;
  const py = H - 42;
  doc.fillColor(C.navyDark);
  doc.roundRectPath(px, py, pw, 38, 9);
  doc.doFill();
  doc.fillColor(C.navy);
  doc.roundRectPath(px + 2.5, py + 2.5, pw - 5, 33, 7);
  doc.doFill();
  doc.strokeColor(C.pipeLight);
  doc.lineWidth(0.9);
  doc.roundRectPath(px + 5, py + 5, pw - 10, 28, 5);
  doc.doStroke();
  bolt(doc, px + 12, py + 19);
  bolt(doc, px + pw - 12, py + 19);
  doc.textBox('FSK', px + 20, py + 6.5, pw - 40, 28, 28, true, 'center', C.navyDark); // Schatten
  doc.textBox('FSK', px + 19, py + 5, pw - 40, 28, 28, true, 'center', C.snow);
  snowCap([[px + 14, py + 1, 6], [px + 26, py - 1, 5], [px + pw - 18, py, 6]]);

  // ── Kältemittelflasche unten links ──
  refrigerantBottle(doc, 58, H - inset - 8);
  snowCap([[38, H - 28, 7], [52, H - 24, 8], [90, H - 26, 7], [104, H - 24, 5]]);

  // ── Yeti unten rechts ──
  yeti(doc, 505, H - inset - 6);
  snowCap([[452, H - 24, 6], [W - 34, H - 26, 8], [W - 50, H - 22, 6]]);
}

function bolt(doc, x, y) {
  doc.fillColor(C.pipeLight);
  doc.ellipsePath(x, y, 3.2, 3.2);
  doc.doFill();
  doc.strokeColor(C.navyDark);
  doc.lineWidth(0.8);
  doc.moveTo(x - 1.8, y);
  doc.lineTo(x + 1.8, y);
  doc.doStroke();
}

function snowflake(doc, x, y, r, col, w) {
  doc.strokeColor(col);
  doc.lineWidth(w);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const ex = x + r * Math.cos(a);
    const ey = y + r * Math.sin(a);
    doc.moveTo(x, y);
    doc.lineTo(ex, ey);
    // kleine Seitenäste
    const mx = x + 0.6 * r * Math.cos(a);
    const my = y + 0.6 * r * Math.sin(a);
    [-0.6, 0.6].forEach((d) => {
      doc.moveTo(mx, my);
      doc.lineTo(mx + 0.35 * r * Math.cos(a + d), my + 0.35 * r * Math.sin(a + d));
    });
  }
  doc.doStroke();
}

function gauge(doc, cx, cy, r) {
  // Anschluss zur Leitung
  doc.fillColor(C.brass);
  doc.roundRectPath(cx - 4, cy + r - 2, 8, 12, 1.5);
  doc.doFill();
  doc.fillColor(C.navyDark);
  doc.ellipsePath(cx, cy, r, r);
  doc.doFill();
  doc.fillColor(C.pipeLight);
  doc.ellipsePath(cx, cy, r - 3, r - 3);
  doc.doFill();
  doc.fillColor(C.snow);
  doc.ellipsePath(cx, cy, r - 5.5, r - 5.5);
  doc.doFill();
  // Skala von 225° bis −45° (Uhrzeigersinn), roter Bereich am Ende
  const arcPoint = (deg, rad) => {
    const a = (deg * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)];
  };
  doc.strokeColor(C.red);
  doc.lineWidth(2.6);
  for (let d = 20; d > -45; d -= 5) {
    doc.moveTo(...arcPoint(d, r - 9));
    doc.lineTo(...arcPoint(d - 5, r - 9));
  }
  doc.doStroke();
  doc.strokeColor(C.navyDark);
  doc.lineWidth(0.9);
  for (let d = 225; d >= -45; d -= 27) {
    doc.moveTo(...arcPoint(d, r - 7));
    doc.lineTo(...arcPoint(d, r - 12));
  }
  doc.doStroke();
  doc.textBox('bar', cx - 8, cy + 6, 16, 8, 6, true, 'center', C.navy);
  // Zeiger
  doc.strokeColor(C.red);
  doc.lineWidth(1.4);
  doc.moveTo(cx, cy);
  doc.lineTo(...arcPoint(130, r - 9));
  doc.doStroke();
  doc.fillColor(C.navyDark);
  doc.ellipsePath(cx, cy, 2.6, 2.6);
  doc.doFill();
  // Reif auf dem Manometer
  doc.fillColor(C.snow);
  doc.strokeColor(C.iceEdge);
  doc.lineWidth(1.2);
  [[cx - 14, cy - r + 1, 6], [cx - 3, cy - r - 1, 6], [cx + 9, cy - r + 1, 5]].forEach(([x, y, rr]) => {
    doc.ellipsePath(x, y, rr, rr * 0.75);
    doc.doFillStroke();
  });
}

function refrigerantBottle(doc, cx, bottom) {
  const w = 34;
  const h = 50;
  const top = bottom - h;
  // Flaschenkörper
  doc.fillColor(C.bottle);
  doc.strokeColor(C.navyDark);
  doc.lineWidth(1);
  doc.roundRectPath(cx - w / 2, top, w, h, 11);
  doc.doFillStroke();
  // Glanzstreifen
  doc.fillColor([0.62, 0.82, 0.92]);
  doc.roundRectPath(cx - w / 2 + 5, top + 8, 4, h - 16, 2);
  doc.doFill();
  // Etikett
  doc.fillColor(C.snow);
  doc.roundRectPath(cx - w / 2 + 3, top + 20, w - 6, 13, 2);
  doc.doFill();
  doc.textBox('R744', cx - w / 2 + 4, top + 20, w - 8, 13, 7.5, true, 'center', C.navy);
  // Ventil und Griffring
  doc.fillColor(C.pipe);
  doc.roundRectPath(cx - 5, top - 7, 10, 8, 1.5);
  doc.doFill();
  doc.strokeColor(C.pipeDark);
  doc.lineWidth(2.2);
  doc.ellipsePath(cx, top - 9, 11, 5);
  doc.doStroke();
  doc.fillColor(C.red);
  doc.ellipsePath(cx, top - 12, 4, 2.2);
  doc.doFill();
}

function yeti(doc, cx, ground) {
  // Maße relativ zum Boden; Yeti ist ca. 120 pt hoch
  const bodyY = ground - 40;
  const headY = ground - 92;

  // Fell: zuerst alle Kreise mit Kontur, dann weiß darüber → eine zusammenhängende, flauschige Kontur
  const fur = [];
  const ring = (x, y, rx, ry, n, r) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      fur.push([x + rx * Math.cos(a), y + ry * Math.sin(a), r]);
    }
  };
  ring(cx, bodyY, 36, 38, 16, 9); // Körper
  fur.push([cx, bodyY, 36]);
  ring(cx, headY, 25, 24, 12, 8); // Kopf
  fur.push([cx, headY, 25]);
  const arms = [
    [cx - 40, bodyY - 2, 9.5, 21, 18], // linker Arm hängt seitlich
    [cx + 41, headY + 22, 9.5, 21, 32], // rechter Arm winkt nach oben
  ];
  const feet = [
    [cx - 17, ground - 3, 14, 7],
    [cx + 17, ground - 3, 14, 7],
  ];

  // Arme zuerst, der Körper liegt davor
  arms.forEach(([x, y, rx, ry, a]) => {
    doc.fillColor(C.snow);
    doc.strokeColor(C.furEdge);
    doc.lineWidth(1.6);
    doc.ellipsePath(x, y, rx, ry, a);
    doc.doFillStroke();
  });
  doc.strokeColor(C.furEdge);
  doc.lineWidth(1.6);
  feet.forEach(([x, y, rx, ry]) => { doc.ellipsePath(x, y, rx, ry); doc.doStroke(); });
  fur.forEach(([x, y, r]) => { doc.ellipsePath(x, y, r, r); doc.doStroke(); });
  doc.fillColor(C.snow);
  feet.forEach(([x, y, rx, ry]) => { doc.ellipsePath(x, y, rx, ry); doc.doFill(); });
  fur.forEach(([x, y, r]) => { doc.ellipsePath(x, y, r, r); doc.doFill(); });

  // Hand des winkenden Arms und Fußballen
  doc.fillColor(C.face);
  doc.strokeColor(C.furEdge);
  doc.lineWidth(1.2);
  doc.ellipsePath(cx + 53, headY + 3, 6, 6);
  doc.doFillStroke();
  feet.forEach(([x, y]) => {
    doc.ellipsePath(x, y + 1, 7, 3.2);
    doc.doFill();
  });

  // Bauch
  doc.fillColor([0.92, 0.95, 0.99]);
  doc.ellipsePath(cx, bodyY + 6, 19, 21);
  doc.doFill();

  // Werkzeuggürtel
  doc.fillColor(C.belt);
  doc.roundRectPath(cx - 37, bodyY + 4, 74, 9, 3);
  doc.doFill();
  doc.fillColor(C.brass);
  doc.roundRectPath(cx - 5, bodyY + 3, 10, 11, 2);
  doc.doFill();
  doc.fillColor(C.belt);
  doc.roundRectPath(cx - 3, bodyY + 6, 6, 5, 1);
  doc.doFill();
  // Schraubenschlüssel am Gürtel
  doc.strokeColor(C.pipeDark);
  doc.lineWidth(2.4);
  doc.moveTo(cx + 20, bodyY + 10);
  doc.lineTo(cx + 26, bodyY + 26);
  doc.doStroke();
  doc.lineWidth(1.6);
  doc.ellipsePath(cx + 27, bodyY + 29, 3.4, 3.4);
  doc.doStroke();

  // Gesicht
  doc.fillColor(C.face);
  doc.ellipsePath(cx, headY + 5, 17, 14);
  doc.doFill();
  doc.fillColor(C.navyDark);
  doc.ellipsePath(cx - 7, headY + 1, 2.6, 3.3);
  doc.ellipsePath(cx + 7, headY + 1, 2.6, 3.3);
  doc.doFill();
  doc.fillColor(C.snow);
  doc.ellipsePath(cx - 6.2, headY - 0.2, 0.9, 0.9);
  doc.ellipsePath(cx + 7.8, headY - 0.2, 0.9, 0.9);
  doc.doFill();
  // Nase
  doc.fillColor([0.32, 0.42, 0.56]);
  doc.ellipsePath(cx, headY + 6.5, 3, 2.1);
  doc.doFill();
  // Lächeln
  doc.fillColor([0.38, 0.2, 0.28]);
  doc.moveTo(cx - 7, headY + 10);
  doc.curveTo(cx - 4, headY + 16.5, cx + 4, headY + 16.5, cx + 7, headY + 10);
  doc.curveTo(cx + 3, headY + 11.5, cx - 3, headY + 11.5, cx - 7, headY + 10);
  doc.closePath();
  doc.doFill();
  // Wangen
  doc.fillColor([0.98, 0.78, 0.82]);
  doc.ellipsePath(cx - 12, headY + 9, 2.8, 1.8);
  doc.ellipsePath(cx + 12, headY + 9, 2.8, 1.8);
  doc.doFill();

  // Schutzhelm
  doc.fillColor(C.helmet);
  doc.strokeColor(C.helmetDark);
  doc.lineWidth(1);
  doc.moveTo(cx - 24, headY - 9);
  doc.curveTo(cx - 24, headY - 38, cx + 24, headY - 38, cx + 24, headY - 9);
  doc.closePath();
  doc.doFillStroke();
  doc.fillColor(C.helmetDark);
  doc.roundRectPath(cx - 29, headY - 11, 58, 5.5, 2.5);
  doc.doFill();
  doc.fillColor([1, 0.88, 0.45]);
  doc.roundRectPath(cx - 3, headY - 33, 6, 23, 3);
  doc.doFill();
  doc.textBox('FSK', cx - 18, headY - 23, 13, 8, 6.5, true, 'center', C.navy);
}
