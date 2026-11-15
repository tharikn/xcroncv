import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';
import { unzipSync } from 'fflate';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UNZIPPED_BYTES = 20 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 300;
export const MAX_PDF_PAGES = 10;

export type ImportKind = 'pdf' | 'docx';

/** Decide the type from the file CONTENT (magic bytes), never from the client-supplied name or MIME type. */
export function sniff(buf: Buffer): ImportKind {
  if (buf.length < 8) throw new BadRequestException('The file is empty or too small.');
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'docx';
  throw new UnsupportedMediaTypeException('Only PDF and DOCX files can be imported.');
}

/** Reject zip bombs and non-Word packages before decompressing anything. */
export function assertSafeDocx(buf: Buffer): void {
  let entries = 0; let total = 0; let hasDoc = false; let macro = false;
  try {
    unzipSync(new Uint8Array(buf), {
      filter: (f) => {
        entries++; total += f.originalSize;
        if (f.name === 'word/document.xml') hasDoc = true;
        if (/vbaProject\.bin$/i.test(f.name)) macro = true;
        if (entries > MAX_ZIP_ENTRIES || total > MAX_UNZIPPED_BYTES) throw new Error('bomb');
        return false; // inspect headers only
      },
    });
  } catch (e) {
    if ((e as Error).message === 'bomb') throw new BadRequestException('This document is too large or complex to import.');
    throw new BadRequestException('This is not a valid DOCX file.');
  }
  if (!hasDoc) throw new BadRequestException('This is not a Word document (word/document.xml is missing).');
  if (macro) throw new BadRequestException('Documents with macros cannot be imported.');
}
