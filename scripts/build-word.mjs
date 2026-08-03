// HTML (styled A4 doc) -> Word-compatible .docx via docx.js
// Usage: node scripts/build-word.mjs <input.html> <output.docx>
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as cheerio from "cheerio";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, PageBreak, AlignmentType, VerticalAlign, ImageRun,
} from "docx";

const SRC = process.argv[2] || "proposals/Market-Twin-Differentiation-Evidence.html";
const OUT = process.argv[3] || "proposals/Market-Twin-Differentiation-Evidence.docx";
const HTMLDIR = dirname(SRC);

function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
function imageParagraph(src, maxW) {
  try {
    const data = readFileSync(resolve(HTMLDIR, src));
    const { w, h } = pngSize(data);
    const width = Math.min(maxW, w), height = Math.round(width * h / w);
    return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 50 }, children: [new ImageRun({ data, transformation: { width, height } })] });
  } catch { return new Paragraph({ children: [new TextRun({ text: `[도표: ${src}]`, color: "64748B", size: 18 })] }); }
}

const NAVY="0A1F4D", BLUE="2563EB", BLUE2="1D4ED8", INK="334155", INK2="1E293B",
  GREEN="16A34A", GREEN2="15803D", RED="DC2626", AMBER="B45309", MUTED="64748B",
  LINE="E6E9F0", WHITE="FFFFFF";

const $ = cheerio.load(readFileSync(SRC, "utf8"));
$("style,.pnum,.brandfoot").remove();

const cls = (n) => ($(n).attr("class") || "");
const thinB = { style: BorderStyle.SINGLE, size: 3, color: LINE };
const cellBorders = { top: thinB, bottom: thinB, left: thinB, right: thinB };

// ---- inline: element/text node -> TextRun[] ----
function inlineStyle($el) {
  const c = cls($el);
  if ($el.is("b")) return { color: NAVY, bold: true };
  if (c.includes("hl")) return { color: BLUE2, bold: true };
  if (c.includes("ok")) return { color: GREEN, bold: true };
  if (c.includes("bad")) return { color: RED, bold: true };
  if (c.includes("amb")) return { color: AMBER, bold: true };
  if (c.includes("lab")) return { color: GREEN2, bold: true };
  if (c.includes("pill")) return { color: BLUE2, bold: true };
  if (c.includes("b-mod")) return { color: BLUE2, bold: true };
  if (c.includes("b-weak")) return { color: AMBER, bold: true };
  if (c.includes("b-str")) return { color: GREEN2, bold: true };
  if (c.includes("hl")) return { color: BLUE2, bold: true };
  if ($el.is("i")) return { italics: true };
  return {};
}
function runsOf(node, base) {
  const out = [];
  $(node).contents().each((_, n) => {
    if (n.type === "text") {
      const t = n.data.replace(/\s+/g, " ");
      if (t && t !== " ") out.push(new TextRun({ text: t, ...base }));
      else if (t === " ") out.push(new TextRun({ text: " ", ...base }));
    } else if (n.type === "tag") {
      if (n.name === "br") { out.push(new TextRun({ break: 1, ...base })); return; }
      const st = inlineStyle($(n));
      out.push(...runsOf(n, { ...base, ...st, bold: st.bold || base.bold, italics: st.italics || base.italics }));
    }
  });
  return out;
}

// ---- paragraph from a block element (p/h/li) ----
function para($el, base, opts = {}) {
  const runs = runsOf($el.get(0), base);
  if (runs.length === 0) return null;
  return new Paragraph({ children: runs, spacing: { after: opts.after ?? 80, before: opts.before ?? 0, line: 264 }, alignment: opts.align });
}

// choose base run-style from element type/class
function baseFor($el, white) {
  const c = cls($el), tag = $el.get(0).tagName;
  if (white) {
    if (tag === "h1") return { color: WHITE, bold: true, size: 44 };
    if (c.includes("tag")) return { color: "DBE4FF", size: 24 };
    return { color: "C7D2FE", size: 20 };
  }
  if (tag === "h1") return { color: NAVY, bold: true, size: 40 };
  if (tag === "h2") return { color: NAVY, bold: true, size: 32 };
  if (tag === "h3") return { color: NAVY, bold: true, size: 26 };
  if (tag === "h4") return { color: BLUE2, bold: true, size: 23 };
  if (c.includes("sec-no")) return { color: BLUE, bold: true, size: 19 };
  if (c.includes("lead")) return { color: INK2, size: 24 };
  if (c.includes("small") || c.includes("kicker")) return { color: MUTED, size: 17 };
  if (c.includes("num")) return { color: BLUE, bold: true, size: 40 };
  return { color: INK, size: 20 };
}

// ---- block children of a container -> (Paragraph|Table)[] ----
function blockChildren($container, white = false) {
  const blocks = [];
  $container.children().each((_, ch) => {
    const $ch = $(ch); const tag = ch.tagName; const c = cls($ch);
    if (tag === "table") { blocks.push(buildTable($ch)); return; }
    if (tag === "figure") {
      const src = $ch.find("img").attr("src"); const cap = $ch.find("figcaption").text();
      if (src) blocks.push(imageParagraph(src, 640));
      if (cap) blocks.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: cap, color: MUTED, size: 17 })] }));
      return;
    }
    if (c.includes("figgrid")) {
      const figs = $ch.children("figure").toArray(); const rows = [];
      for (let r = 0; r < figs.length; r += 2) {
        const cells = [];
        for (let k = r; k < Math.min(r + 2, figs.length); k++) {
          const $f = $(figs[k]); const src = $f.find("img").attr("src"); const cap = $f.find("figcaption").text();
          cells.push(new TableCell({
            children: [imageParagraph(src, 290), new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: cap, color: MUTED, size: 15 })] })],
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
            margins: { top: 60, bottom: 60, left: 60, right: 60 }, verticalAlign: VerticalAlign.TOP,
          }));
        }
        rows.push(new TableRow({ children: cells }));
      }
      blocks.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } } }));
      return;
    }
    if (tag === "ul") {
      $ch.children("li").each((__, li) => {
        const $li = $(li);
        const runs = [new TextRun({ text: "•  ", color: BLUE, bold: true, size: 20 }), ...runsOf(li, { color: white ? "C7D2FE" : INK, size: 21 })];
        blocks.push(new Paragraph({ children: runs, spacing: { after: 60, line: 260 }, indent: { left: 200, hanging: 120 } }));
      });
      return;
    }
    if (c.includes("grid")) { blocks.push(buildGrid($ch)); return; }
    if (c.includes("callout")) { blocks.push(buildBox($ch, "EEF3FF", BLUE)); return; }
    if (c.includes("ev-box")) { blocks.push(buildBox($ch, "F1FBF5", GREEN)); return; }
    if (c.includes("diff")) { blocks.push(buildBox($ch, "F6FEF9", GREEN)); return; }
    if (c.includes("quote")) { blocks.push(buildBox($ch, "F7FAFF", BLUE)); return; }
    if (["h1","h2","h3","h4","p"].includes(tag)) {
      const b = baseFor($ch, white);
      const isH2 = tag === "h2";
      const runs = runsOf(ch, b);
      if (runs.length === 0) return;
      blocks.push(new Paragraph({
        children: runs,
        spacing: { after: isH2 ? 140 : 90, before: (tag==="h2"||tag==="h3") ? 120 : 0, line: 264 },
        border: isH2 ? { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY } } : undefined,
      }));
      return;
    }
    if (tag === "div" || tag === "section" || tag === "span") {
      // generic container (e.g. cover statrow) -> recurse; if it has .n/.l treat as stat
      if (c.includes("statrow")) {
        $ch.children().each((__, s) => {
          const $s = $(s);
          const n = $s.find(".n").text(), l = $s.find(".l").text();
          if (n) blocks.push(new Paragraph({ children: [new TextRun({ text: n + "  ", color: WHITE, bold: true, size: 30 }), new TextRun({ text: l, color: "93C5FD", size: 18 })], spacing: { after: 60 } }));
        });
        return;
      }
      blocks.push(...blockChildren($ch, white));
      return;
    }
  });
  return blocks;
}

function cellParagraphs($cell, base) {
  // cell may contain inline + nested block (rare). Handle inline as one para, plus any child block.
  const hasBlock = $cell.children("p,ul,h4,h3,table,div").length > 0;
  if (!hasBlock) {
    const runs = runsOf($cell.get(0), base);
    return [new Paragraph({ children: runs.length ? runs : [new TextRun({ text: "", ...base })], spacing: { after: 0, line: 252 } })];
  }
  return blockChildren($cell);
}

function buildTable($t) {
  const isMt = cls($t).includes("mt");
  const rows = [];
  $t.find("tr").each((ri, tr) => {
    const cells = [];
    $(tr).children("th,td").each((ci, cell) => {
      const $c = $(cell); const isTh = cell.tagName === "th"; const cc = cls($c);
      let fill = WHITE, txt = INK, bold = false;
      if (isTh) { fill = NAVY; txt = WHITE; bold = true; }
      else { fill = ri % 2 ? "F5F8FC" : WHITE; if (isMt && ci === 0) { fill = "EEF2FB"; txt = NAVY; bold = true; } }
      if (cc.includes("us")) { if (isTh) { fill = BLUE; txt = WHITE; } else { fill = "EAF1FE"; txt = NAVY; } }
      const base = { color: txt, bold, size: isTh ? 20 : 20 };
      const colSpan = parseInt($c.attr("colspan") || "1", 10);
      const rowSpan = parseInt($c.attr("rowspan") || "1", 10);
      cells.push(new TableCell({
        children: cellParagraphs($c, base),
        shading: { fill, type: ShadingType.CLEAR, color: "auto" },
        borders: cellBorders,
        margins: { top: 40, bottom: 40, left: 70, right: 70 },
        columnSpan: colSpan > 1 ? colSpan : undefined,
        rowSpan: rowSpan > 1 ? rowSpan : undefined,
        verticalAlign: VerticalAlign.TOP,
      }));
    });
    rows.push(new TableRow({ children: cells }));
  });
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: { insideHorizontal: thinB, insideVertical: thinB, top: thinB, bottom: thinB, left: thinB, right: thinB } });
}

function buildBox($box, fill, border) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.SINGLE, size: 2, color: border }, bottom: { style: BorderStyle.SINGLE, size: 2, color: border }, right: { style: BorderStyle.SINGLE, size: 2, color: border }, left: { style: BorderStyle.SINGLE, size: 28, color: border } },
    rows: [new TableRow({ children: [new TableCell({
      children: blockChildren($box),
      shading: { fill, type: ShadingType.CLEAR, color: "auto" },
      margins: { top: 100, bottom: 100, left: 140, right: 140 },
    })] })],
  });
}

function buildGrid($g) {
  const cardCells = [];
  $g.children().each((_, card) => {
    const $c = $(card); const cc = cls($c);
    let fill = WHITE; if (cc.includes("ev")) fill = "F1FBF5"; else if (cc.includes("accent")) fill = "F7FAFF";
    cardCells.push(new TableCell({
      children: blockChildren($c),
      shading: { fill, type: ShadingType.CLEAR, color: "auto" },
      borders: { top: { style: BorderStyle.SINGLE, size: 3, color: "DCE4F5" }, bottom: { style: BorderStyle.SINGLE, size: 3, color: "DCE4F5" }, left: { style: BorderStyle.SINGLE, size: 3, color: "DCE4F5" }, right: { style: BorderStyle.SINGLE, size: 3, color: "DCE4F5" } },
      margins: { top: 90, bottom: 90, left: 110, right: 110 },
      verticalAlign: VerticalAlign.TOP,
    }));
  });
  return new Table({ rows: [new TableRow({ children: cardCells })], width: { size: 100, type: WidthType.PERCENTAGE } });
}

// ---- assemble document: sections in order, page break between ----
const children = [];
const sections = $("body > section").toArray();
sections.forEach((sec, si) => {
  const $sec = $(sec);
  if (si > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
  if (cls($sec).includes("cover")) {
    // cover -> navy full box
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      rows: [new TableRow({ children: [new TableCell({
        children: blockChildren($sec, true),
        shading: { fill: NAVY, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 400, bottom: 400, left: 350, right: 350 },
      })] })],
    }));
  } else {
    children.push(...blockChildren($sec, false));
  }
});

const doc = new Document({
  styles: { default: { document: { run: { font: "Malgun Gothic" } } } },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
    children,
  }],
});

const buf = await Packer.toBuffer(doc);
writeFileSync(OUT, buf);
console.log("OK: wrote", OUT, "bytes", buf.length, "| top-blocks", children.length);
