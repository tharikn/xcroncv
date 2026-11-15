import { RenderModel, RenderSection } from '../render-model/render-model.types';
import { pack, xml, XML_DECL } from './ooxml';

const MAX_CELL = 32767;
export const EMPTY_LABEL = '(not provided)';

/** Neutralise spreadsheet formula injection: values starting with = + - @ TAB CR get a leading apostrophe (doc 08 s.6). */
export function safeCell(v: unknown): string {
  let s = String(v ?? '').trim();
  if (!s) return EMPTY_LABEL;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s.length > MAX_CELL ? s.slice(0, MAX_CELL) : s;
}

export function sheetName(name: string, used: Set<string>): string {
  let n = name.replace(/[\\/?*[\]:]/g, ' ').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  let i = 2;
  while (used.has(n.toLowerCase())) n = `${n.slice(0, 28)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
}

const col = (i: number) => String.fromCharCode(65 + i);

function sheetXml(rows: string[][], widths: number[]): string {
  const cols = `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  const data = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) =>
    `<c r="${col(ci)}${ri + 1}" t="inlineStr" s="${ri === 0 ? 1 : 2}"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')}</row>`).join('');
  return `${XML_DECL}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${data}</sheetData></worksheet>`;
}

const SECTION_HEAD = ['Title', 'Subtitle', 'Dates / location', 'Description', 'Highlights', 'Tags', 'URL'];
function sectionRows(s: RenderSection): string[][] {
  const rows: string[][] = [SECTION_HEAD];
  if (s.text) rows.push(['Summary', '', '', s.text, '', '', ''].map(safeCell));
  for (const it of s.items ?? []) {
    rows.push([it.title, it.subtitle, it.meta, it.text, (it.bullets ?? []).join('\n'), (it.tags ?? []).join(', '), it.url].map(safeCell));
  }
  return rows;
}

/** Structured-data workbook (not a visual resume): Profile sheet + one sheet per non-empty section. Text is stored as inline strings. */
export function renderXlsx(m: RenderModel): Buffer {
  const used = new Set<string>();
  const sheets: Array<{ name: string; xml: string }> = [];
  const profile: string[][] = [
    ['Field', 'Value'],
    ['Name', safeCell(m.header.name)], ['Headline', safeCell(m.header.headline)], ['Contacts', safeCell(m.header.contacts.join('\n'))],
    ['Links', safeCell(m.header.links.map((l) => `${l.label}: ${l.url}`).join('\n'))],
  ];
  sheets.push({ name: sheetName('Profile', used), xml: sheetXml(profile, [18, 70]) });
  for (const s of m.sections) sheets.push({ name: sheetName(s.title, used), xml: sheetXml(sectionRows(s), [28, 28, 22, 50, 60, 30, 36]) });

  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const ss = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
  const files: Record<string, string> = {
    '[Content_Types].xml': `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${ss}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${ss}.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${ss}.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${XML_DECL}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `${XML_DECL}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>`,
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = s.xml; });
  return pack(files);
}
