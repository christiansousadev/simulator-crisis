import { Fragment, ReactNode } from "react";

// A SMALL, SAFE MARKDOWN RENDERER FOR THE POST-MORTEM REPORT. No dependency and no
// dangerouslySetInnerHTML: the source is parsed into a plain tree and every leaf is rendered as a
// React text node, so markup in the source (<script>, <img onerror>) is shown as inert text.
// Supported: headings, paragraphs, bullet/numbered/task lists, tables, fenced code, quotes, rules,
// **bold**, *italic*, `code` and [links](https://...) (http, https and mailto only).

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };

export interface ListItem {
  c: Inline[];
  // null = a plain item, true/false = a task item
  checked: boolean | null;
}

export type Block =
  | { t: "heading"; level: number; c: Inline[] }
  // soft line breaks stay as "\n" inside text nodes (rendered with pre-line); `meta` is set when every
  // line is a "**Key:** value" pair, which the renderer shows as a label/value grid
  | { t: "paragraph"; c: Inline[]; meta: Array<{ key: string; value: Inline[] }> | null }
  | { t: "list"; ordered: boolean; items: ListItem[] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][]; align: Array<"left" | "center" | "right" | null> }
  | { t: "code"; v: string; lang: string }
  | { t: "quote"; c: Inline[] }
  | { t: "hr" };

// ONLY LINKS THAT CANNOT EXECUTE SCRIPT: anything else (javascript:, data:, vbscript:) is dropped
export function isSafeHref(raw: string): boolean {
  const href = raw.trim();
  // control characters and spaces are how "java\tscript:" style bypasses are built
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(href)) return false;
  return /^(https?:\/\/|mailto:)/i.test(href);
}

const isWordChar = (ch: string | undefined) => !!ch && /[A-Za-z0-9]/.test(ch);

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      out.push({ t: "text", v: buf });
      buf = "";
    }
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    // backslash escapes a following punctuation character
    if (ch === "\\" && i + 1 < src.length && /[\\`*_[\]()#+\-.!|{}<>~]/.test(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }

    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: "code", v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if ((ch === "*" || ch === "_") && src[i + 1] === ch) {
      // _a_b_ style identifiers must not turn into emphasis: underscores need a word boundary
      const okOpen = ch === "*" || !isWordChar(src[i - 1]);
      const end = okOpen ? findClosing(src, ch + ch, i + 2) : -1;
      if (end > i + 2) {
        flush();
        out.push({ t: "strong", c: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (ch === "*" || ch === "_") {
      const okOpen = (ch === "*" || !isWordChar(src[i - 1])) && src[i + 1] !== undefined && !/\s/.test(src[i + 1]) && src[i + 1] !== ch;
      const end = okOpen ? findClosing(src, ch, i + 1) : -1;
      if (end > i + 1 && !/\s/.test(src[end - 1]) && (ch === "*" || !isWordChar(src[end + 1]))) {
        flush();
        out.push({ t: "em", c: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "[") {
      const close = src.indexOf("](", i + 1);
      const endParen = close > -1 ? findClosingParen(src, close + 2) : -1;
      if (close > -1 && endParen > -1) {
        const label = src.slice(i + 1, close);
        const href = src.slice(close + 2, endParen);
        flush();
        if (isSafeHref(href)) out.push({ t: "link", href: href.trim(), c: parseInline(label) });
        else out.push(...parseInline(label));
        i = endParen + 1;
        continue;
      }
    }

    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

// closing ")" of a link target, tolerating balanced parentheses inside the URL
function findClosingParen(src: string, from: number): number {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === "(") depth += 1;
    else if (src[i] === ")") {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return -1;
}

// next occurrence of `marker` at or after `from` that is not escaped and not inside a code span
function findClosing(src: string, marker: string, from: number): number {
  let i = from;
  while (i < src.length) {
    if (src[i] === "\\") {
      i += 2;
      continue;
    }
    if (src[i] === "`") {
      const end = src.indexOf("`", i + 1);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    if (src.startsWith(marker, i)) {
      // a lone "*" must not close on the first star of a "**" pair
      if (marker.length === 1 && src[i + 1] === marker) {
        i += 2;
        continue;
      }
      return i;
    }
    i += 1;
  }
  return -1;
}

const RE_FENCE = /^\s*(```|~~~)\s*([\w-]*)\s*$/;
const RE_HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const RE_BULLET = /^\s*[-*+]\s+(.*)$/;
const RE_BULLET_EMPTY = /^\s*[-*+]\s*$/;
const RE_ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const RE_TASK = /^\[( |x|X)\]\s*(.*)$/;
const RE_QUOTE = /^\s{0,3}>\s?(.*)$/;
const RE_TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\" && body[i + 1] === "|") {
      cur += "|";
      i += 1;
    } else if (body[i] === "|") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += body[i];
    }
  }
  cells.push(cur.trim());
  return cells;
}

function listMatch(line: string): { ordered: boolean; text: string } | null {
  if (RE_BULLET_EMPTY.test(line)) return { ordered: false, text: "" };
  const b = RE_BULLET.exec(line);
  if (b) return { ordered: false, text: b[1] };
  const o = RE_ORDERED.exec(line);
  if (o) return { ordered: true, text: o[1] };
  return null;
}

const RE_META = /^\*\*([^*]+?):\*\*\s*(.*)$/;

// "**Key:** value" lines, one per line, are the report header
function parseMeta(lines: string[]): Array<{ key: string; value: Inline[] }> | null {
  if (lines.length < 2) return null;
  const pairs: Array<{ key: string; value: Inline[] }> = [];
  for (const line of lines) {
    const m = RE_META.exec(line);
    if (!m) return null;
    pairs.push({ key: m[1].trim(), value: parseInline(m[2]) });
  }
  return pairs;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const startsOtherBlock = (line: string, next: string | undefined) =>
    RE_FENCE.test(line) ||
    RE_HEADING.test(line) ||
    RE_HR.test(line) ||
    RE_QUOTE.test(line) ||
    listMatch(line) !== null ||
    (line.includes("|") && next !== undefined && RE_TABLE_SEP.test(next) && next.includes("-"));

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const fence = RE_FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence (or end of input for an unterminated block)
      blocks.push({ t: "code", v: body.join("\n"), lang: fence[2] });
      continue;
    }

    const heading = RE_HEADING.exec(line);
    if (heading) {
      blocks.push({ t: "heading", level: heading[1].length, c: parseInline(heading[2]) });
      i += 1;
      continue;
    }

    if (RE_HR.test(line)) {
      blocks.push({ t: "hr" });
      i += 1;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((cell) => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        return left && right ? "center" : right ? "right" : left ? "left" : null;
      });
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        const cells = splitRow(lines[i]);
        // ragged rows are padded/trimmed to the header width so the grid stays rectangular
        rows.push(head.map((_, c) => parseInline(cells[c] ?? "")));
        i += 1;
      }
      blocks.push({ t: "table", head: head.map(parseInline), rows, align: head.map((_, c) => align[c] ?? null) });
      continue;
    }

    if (RE_QUOTE.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) {
        quote.push((RE_QUOTE.exec(lines[i]) as RegExpExecArray)[1]);
        i += 1;
      }
      blocks.push({ t: "quote", c: parseInline(quote.join("\n")) });
      continue;
    }

    const first = listMatch(line);
    if (first) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = listMatch(lines[i]);
        if (!m || m.ordered !== first.ordered) break;
        const task = !m.ordered ? RE_TASK.exec(m.text) : null;
        const emptyTask = !m.ordered && /^\[( |x|X)\]$/.test(m.text.trim());
        if (task) items.push({ c: parseInline(task[2]), checked: task[1] !== " " });
        else if (emptyTask) items.push({ c: [], checked: m.text.trim()[1] !== " " });
        else items.push({ c: parseInline(m.text), checked: null });
        i += 1;
        // an indented continuation line belongs to the previous item
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && listMatch(lines[i]) === null) {
          items[items.length - 1].c.push({ t: "text", v: " " }, ...parseInline(lines[i].trim()));
          i += 1;
        }
      }
      blocks.push({ t: "list", ordered: first.ordered, items });
      continue;
    }

    // paragraph: consecutive plain lines; each source line stays a visible line (the report's
    // "**Status:** ..." header is one line per field and must not collapse into a single run)
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && (para.length === 0 || !startsOtherBlock(lines[i], lines[i + 1]))) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ t: "paragraph", c: parseInline(para.join("\n")), meta: parseMeta(para) });
  }
  return blocks;
}

// ---- rendering ----

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, idx) => {
    switch (n.t) {
      case "text":
        return <Fragment key={idx}>{n.v}</Fragment>;
      case "strong":
        return (
          <strong key={idx} className="font-bold text-slate-100">
            {renderInline(n.c)}
          </strong>
        );
      case "em":
        return (
          <em key={idx} className="italic text-slate-400">
            {renderInline(n.c)}
          </em>
        );
      case "code":
        return (
          <code key={idx} className="px-1 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-[0.92em]">
            {n.v}
          </code>
        );
      case "link":
        return (
          <a key={idx} href={n.href} target="_blank" rel="noopener noreferrer" className="text-sky-400 underline underline-offset-2 hover:text-sky-300">
            {renderInline(n.c)}
          </a>
        );
    }
  });
}

const HEADING_CLASS = [
  "text-xl font-heading font-bold tracking-wide text-white pb-2 border-b border-slate-700",
  "text-base font-heading font-bold tracking-wide text-cyan-300 pt-2",
  "text-sm font-heading font-bold text-slate-200 pt-1",
  "text-sm font-semibold text-slate-300",
  "text-xs font-semibold text-slate-400 uppercase tracking-wide",
  "text-xs font-semibold text-slate-500 uppercase tracking-wide",
];

function renderBlock(block: Block, idx: number): ReactNode {
  switch (block.t) {
    case "heading": {
      const level = Math.min(6, block.level);
      // the dialog title is the page's h2, so document headings start at h3
      const Tag = `h${Math.min(6, level + 2)}` as "h3" | "h4" | "h5" | "h6";
      return (
        <Tag key={idx} className={HEADING_CLASS[level - 1]}>
          {renderInline(block.c)}
        </Tag>
      );
    }
    case "paragraph": {
      if (block.meta) {
        return (
          <dl key={idx} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
            {block.meta.map((p, n) => (
              <Fragment key={n}>
                <dt className="text-slate-500 uppercase tracking-wide text-[10px] font-semibold self-center">{p.key}</dt>
                <dd className="text-slate-200 font-mono min-w-0 break-words">{renderInline(p.value)}</dd>
              </Fragment>
            ))}
          </dl>
        );
      }
      return (
        <p key={idx} className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">
          {renderInline(block.c)}
        </p>
      );
    }
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      const isTasks = block.items.some((it) => it.checked !== null);
      return (
        <Tag
          key={idx}
          className={`text-sm leading-relaxed text-slate-300 flex flex-col gap-1 ${
            isTasks ? "list-none" : block.ordered ? "list-decimal pl-5" : "list-disc pl-5 marker:text-slate-600"
          }`}
        >
          {block.items.map((it, n) => (
            <li key={n} className={it.checked !== null ? "flex items-start gap-2" : undefined}>
              {it.checked !== null && (
                <span
                  role="img"
                  aria-label={it.checked ? "checked" : "unchecked"}
                  className={`mt-1 inline-block w-3.5 h-3.5 shrink-0 rounded-[3px] border text-[10px] leading-[12px] text-center ${
                    it.checked ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-slate-600 bg-slate-900"
                  }`}
                >
                  {it.checked ? "✓" : ""}
                </span>
              )}
              <span className={it.checked !== null ? "min-w-0 flex-1 min-h-[1.25rem]" : undefined}>{renderInline(it.c)}</span>
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div key={idx} className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-800/60 text-slate-300">
              <tr>
                {block.head.map((cell, n) => (
                  <th key={n} scope="col" className="px-3 py-1.5 font-semibold border-b border-slate-700" style={{ textAlign: block.align[n] ?? undefined }}>
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-slate-800/70 last:border-0 odd:bg-slate-950/30">
                  {row.map((cell, n) => (
                    <td key={n} className="px-3 py-1.5 align-top" style={{ textAlign: block.align[n] ?? undefined }}>
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return (
        <pre key={idx} className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] leading-relaxed font-mono text-slate-300">
          <code>{block.v}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote key={idx} className="border-l-2 border-slate-600 pl-3 text-sm text-slate-400 italic whitespace-pre-line">
          {renderInline(block.c)}
        </blockquote>
      );
    case "hr":
      return <hr key={idx} className="border-slate-800" />;
  }
}

export function renderMarkdown(source: string): ReactNode {
  return parseMarkdown(source).map(renderBlock);
}

export default function Markdown({ source, className = "" }: { source: string; className?: string }) {
  return <div className={`flex flex-col gap-3 ${className}`}>{renderMarkdown(source)}</div>;
}
