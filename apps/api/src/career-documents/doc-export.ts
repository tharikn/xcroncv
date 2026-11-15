import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import { pack, xml, XML_DECL } from '../import-export/ooxml';
import { Section } from './doc-logic';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const ct = 'application/vnd.openxmlformats-officedocument.wordprocessingml';

const run = (t: string) => `<w:r><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
const para = (t: string, style?: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${run(t)}</w:p>`;
const lines = (t: string) => t.split(/\r?\n/);

/** Editable letter-style DOCX (Title, Heading 1 and Normal paragraphs; no tables or images so it opens cleanly anywhere). Built in memory. */
export function renderDocDocx(title: string, sections: Section[]): Buffer {
  const body: string[] = [para(title, 'Title')];
  for (const s of sections) {
    if (s.heading) body.push(para(s.heading, 'Heading1'));
    for (const l of lines(s.text)) body.push(para(l));
  }
  const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
  const styles = `${XML_DECL}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>';
  return pack({
    '[Content_Types].xml': `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${ct}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${ct}.styles+xml"/></Types>`,
    '_rels/.rels': `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    'word/document.xml': `${XML_DECL}<w:document ${W}><w:body>${body.join('')}${sect}</w:body></w:document>`,
    'word/styles.xml': styles,
  });
}

/** Selectable-text PDF (standard fonts) built in memory and returned; nothing is written to disk. */
export function renderDocPdf(title: string, sections: Section[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const sink = new Writable({ write(c, _e, cb) { chunks.push(Buffer.from(c)); cb(); } });
    sink.on('finish', () => resolve(Buffer.concat(chunks)));
    sink.on('error', reject);
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: title.slice(0, 120) } });
    doc.pipe(sink);
    doc.font('Helvetica-Bold').fontSize(18).text(title, { paragraphGap: 8 });
    for (const s of sections) {
      if (s.heading) doc.moveDown(0.4).font('Helvetica-Bold').fontSize(12).text(s.heading, { paragraphGap: 3 });
      doc.font('Helvetica').fontSize(11);
      for (const l of lines(s.text)) doc.text(l || ' ', { lineGap: 2, paragraphGap: 2 });
    }
    doc.end();
  });
}
