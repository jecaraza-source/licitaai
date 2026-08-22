import { HeadingLevel, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";

/**
 * Minimal HTML → docx converter. Only needs to handle the controlled subset
 * of HTML that Claude is instructed to produce for propuesta sections
 * (h2, h3, p, ul/li, strong/em, table/tr/td) — not arbitrary user HTML.
 */

function parseInline(html: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /<(strong|b|em|i)>([\s\S]*?)<\/\1>|([^<]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const [, tag, inner, plain] = match;
    if (plain !== undefined) {
      const text = decodeEntities(plain);
      if (text) runs.push(new TextRun(text));
    } else if (tag) {
      const bold = tag.toLowerCase() === "strong" || tag.toLowerCase() === "b";
      runs.push(new TextRun({ text: decodeEntities(inner ?? ""), bold, italics: !bold }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun("")];
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function htmlToDocxElements(html: string): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  const blockRe = /<(h2|h3|p|ul|ol|table)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(html))) {
    const [, tag, inner] = match;
    const tagLower = tag.toLowerCase();

    if (tagLower === "h2" || tagLower === "h3") {
      elements.push(
        new Paragraph({
          heading: tagLower === "h2" ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          children: parseInline(inner),
        }),
      );
    } else if (tagLower === "p") {
      elements.push(new Paragraph({ children: parseInline(inner) }));
    } else if (tagLower === "ul" || tagLower === "ol") {
      const liRe = /<li>([\s\S]*?)<\/li>/gi;
      let liMatch: RegExpExecArray | null;
      while ((liMatch = liRe.exec(inner))) {
        elements.push(
          new Paragraph({ bullet: { level: 0 }, children: parseInline(liMatch[1]) }),
        );
      }
    } else if (tagLower === "table") {
      const rowRe = /<tr>([\s\S]*?)<\/tr>/gi;
      const rows: TableRow[] = [];
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRe.exec(inner))) {
        const cellRe = /<t[hd]>([\s\S]*?)<\/t[hd]>/gi;
        const cells: TableCell[] = [];
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRe.exec(rowMatch[1]))) {
          cells.push(
            new TableCell({
              children: [new Paragraph({ children: parseInline(cellMatch[1]) })],
            }),
          );
        }
        if (cells.length > 0) rows.push(new TableRow({ children: cells }));
      }
      if (rows.length > 0) {
        elements.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      }
    }
  }

  if (elements.length === 0 && html.trim()) {
    elements.push(new Paragraph({ children: parseInline(html) }));
  }

  return elements;
}
