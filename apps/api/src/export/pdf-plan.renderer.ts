import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import { RenderModel, RenderSection } from '../render-model/render-model.types';
import { LayoutPlan, PlacedSection, SectionVariant } from '../resume-layout/layout.types';
import {
  buildHeaderLines, buildSectionGeometry, lineGapFor, PaintLine, SectionGeometry,
} from '../resume-layout/layout-model';
import { createTextMeasurer } from '../resume-layout/text-metrics';

/** Margin offset (points) that puts PDFKit's `maxY` beyond any printable coordinate. */
const NO_BREAK_PT = 100_000;

/**
 * Paints a fully resolved LayoutPlan. This renderer makes no layout decisions: page, column,
 * variant and item range come from the plan. It exists so preview, export and validation agree.
 */
export function renderPlannedPdf(m: RenderModel, plan: LayoutPlan, out: Writable): void {
  const doc = new PDFDocument({
    size: m.page.size,
    margin: plan.page.marginPt,
    bufferPages: true,
    info: { Title: `${m.header.name} - Resume` },
  });
  doc.pipe(out);

  const pageCount = Math.max(1, plan.metrics.pageCount);
  for (let page = 1; page < pageCount; page++) doc.addPage();

  /**
   * The plan owns every page break. PDFKit still runs its own `y > maxY` check before each text
   * write and would silently `addPage()` (resetting margins, cascading into phantom pages) if a
   * planned block sits near the physical page edge. Pushing the bottom margin far off-page makes
   * that check unreachable, so a rounding difference can never add a page or shift content.
   */
  const disableAutoBreaks = (): void => {
    doc.page.margins.top = -NO_BREAK_PT;
    doc.page.margins.bottom = -NO_BREAK_PT;
  };

  const measurer = createTextMeasurer(m.page.size, plan.page.marginPt);
  const density = plan.density;
  const theme = m.theme;
  const width = plan.page.widthPt - plan.page.marginPt * 2;
  const header = buildHeaderLines(m, width, density, measurer, { styles: m.styles });
  const geometryCache = new Map<string, SectionGeometry>();

  const geometryFor = (section: RenderSection, variant: SectionVariant, widthPt: number): SectionGeometry => {
    const key = `${section.id ?? ''}|${section.type}|${section.title}|${variant}|${widthPt.toFixed(1)}`;
    const hit = geometryCache.get(key);
    if (hit) return hit;
    const g = buildSectionGeometry({ section, variant, widthPt, theme, density, measurer, styles: m.styles });
    geometryCache.set(key, g);
    return g;
  };

  const paintLine = (line: PaintLine, x: number, y: number, widthPt: number, lineGap: number): number => {
    doc.font(line.font).fontSize(line.size).fillColor(line.color);
    const opts: Record<string, unknown> = {
      width: Math.max(1, widthPt - line.indentPt), lineGap, align: line.align ?? 'left',
    };
    if (line.link) opts.link = line.link;
    doc.text(line.text, x + line.indentPt, y, opts as never);
    return y + line.heightPt + line.gapAfterPt;
  };

  const paintHeading = (line: PaintLine, x: number, y: number, widthPt: number, lineGap: number): number => {
    const innerX = x + line.indentPt;
    if (line.decoration === 'tint') {
      doc.save().fillOpacity(0.1).rect(x, y - 1, widthPt, line.heightPt + 4).fill(theme.accent).restore();
    } else if (line.decoration === 'bar') {
      doc.save().rect(x, y, 3, line.heightPt).fill(theme.accent).restore();
    }
    doc.font(line.font).fontSize(line.size).fillColor(line.color);
    doc.text(line.text, innerX, y, {
      width: Math.max(1, widthPt - line.indentPt), lineGap, align: line.align ?? 'left',
    } as never);
    const end = y + line.heightPt;
    if (line.decoration === 'rule') {
      doc.save().moveTo(x, end + 1).lineTo(x + widthPt, end + 1).lineWidth(0.5).strokeColor(theme.accent).stroke().restore();
    } else if (line.decoration === 'short') {
      doc.save().moveTo(x, end + 1).lineTo(x + Math.min(40, widthPt), end + 1).lineWidth(2).strokeColor(theme.accent).stroke().restore();
    }
    return end + line.gapAfterPt;
  };

  const paintSection = (placed: PlacedSection, x: number, widthPt: number): void => {
    const section = m.sections[placed.sectionIndex];
    if (!section) return;
    const g = geometryFor(section, placed.variant, widthPt);
    const gap = lineGapFor(theme, placed.variant);
    let y = placed.startYPt;

    if (placed.withHeading) {
      for (const line of g.heading) y = paintHeading(line, x, y, widthPt, gap);
      for (const line of g.text) y = paintLine(line, x, y, widthPt, gap);
    }
    const items = g.items.slice(placed.itemFrom, placed.itemTo);
    items.forEach((item, index) => {
      for (const line of item.lines) y = paintLine(line, x, y, widthPt, gap);
      if (index < items.length - 1) y += g.itemGapPt;
    });
  };

  const band = !!theme.headerBand;
  for (let page = 0; page < pageCount; page++) {
    doc.switchToPage(page);
    disableAutoBreaks();

    if (page === 0) {
      let y = plan.page.marginPt;
      if (band) {
        doc.save().rect(0, 0, doc.page.width, plan.headerHeightPt + plan.page.marginPt).fill(theme.accent).restore();
        y += density.baseSizePt * 0.1;
      }
      const photo = m.header.photo;
      if (photo) {
        try {
          doc.save().circle(plan.page.marginPt + width - photo.sizePt / 2, y + photo.sizePt / 2, photo.sizePt / 2)
            .clip().image(Buffer.from(photo.src.slice(photo.src.indexOf(',') + 1), 'base64'), plan.page.marginPt + width - photo.sizePt, y, { width: photo.sizePt, height: photo.sizePt })
            .restore();
        } catch {
          doc.restore();
        }
      }
      for (const line of header.lines) y = paintLine(line, plan.page.marginPt, y, width, lineGapFor(theme, 'normal'));
      doc.fillColor('#111111');
    }

    const pagePlan = plan.pages[page];
    if (pagePlan) {
      for (const column of plan.columns) {
        for (const placed of pagePlan.columns[column.id]) paintSection(placed, column.xPt, column.widthPt);
      }
    }
  }

  for (let page = 0; page < pageCount; page++) {
    doc.switchToPage(page);
    disableAutoBreaks();
    doc.fontSize(8).fillColor('#888888')
      .text(`${page + 1} / ${pageCount}`, plan.page.marginPt, doc.page.height - 12, { width, align: 'center', lineBreak: false });
  }

  doc.fillColor('#111111');
  doc.flushPages();
  doc.end();
  measurer.dispose();
}
