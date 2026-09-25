import { deflateSync } from 'node:zlib';

/** Text operators that draw each line below the previous one in Helvetica. */
export function textLines(lines: string[]): string {
  const escape = (line: string) => line.replace(/[\\()]/g, '\\$&');
  const shown = lines.map((line) => `(${escape(line)}) Tj T*`).join('\n');
  return `BT /F1 10 Tf 12 TL 40 760 Td\n${shown}\nET\n`;
}

/**
 * A minimal PDF whose `pages` all draw the same content stream, compressed
 * with FlateDecode like real statements (so a small file can inflate a lot).
 */
export function makePdf(content: string | Buffer, pages = 1): Buffer {
  const objects: Buffer[] = [];
  const add = (body: string | Buffer) => objects.push(Buffer.from(body));
  const data = deflateSync(Buffer.from(content));
  add('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = Array.from({ length: pages }, (_, i) => `${i + 5} 0 R`).join(' ');
  add(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  add(
    Buffer.concat([
      Buffer.from(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`),
      data,
      Buffer.from('\nendstream'),
    ])
  );
  for (let i = 0; i < pages; i++) {
    add(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
        '/Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>'
    );
  }

  const chunks = [Buffer.from('%PDF-1.7\n')];
  const offsets: number[] = [];
  let offset = chunks[0].length;
  objects.forEach((body, i) => {
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
    offsets.push(offset);
    chunks.push(chunk);
    offset += chunk.length;
  });
  const xref = offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  chunks.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xref}` +
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`
    )
  );
  return Buffer.concat(chunks);
}
