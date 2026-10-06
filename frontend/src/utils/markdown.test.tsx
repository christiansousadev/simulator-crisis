import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Markdown, { isSafeHref, parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
  it("parses bold, italic and code", () => {
    expect(parseInline("a **b** *c* `d`")).toEqual([
      { t: "text", v: "a " },
      { t: "strong", c: [{ t: "text", v: "b" }] },
      { t: "text", v: " " },
      { t: "em", c: [{ t: "text", v: "c" }] },
      { t: "text", v: " " },
      { t: "code", v: "d" },
    ]);
  });

  it("does not turn snake_case identifiers into emphasis", () => {
    expect(parseInline("svc_auth_gateway and INCIDENT_ID")).toEqual([{ t: "text", v: "svc_auth_gateway and INCIDENT_ID" }]);
  });

  it("keeps underscore emphasis when it sits on word boundaries", () => {
    const nodes = parseInline("_Not derived from telemetry._");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].t).toBe("em");
  });

  it("leaves unmatched markers as literal text", () => {
    expect(parseInline("2 * 3 and **open")).toEqual([{ t: "text", v: "2 * 3 and **open" }]);
  });

  it("does not interpret markdown inside code spans", () => {
    expect(parseInline("`**raw**`")).toEqual([{ t: "code", v: "**raw**" }]);
  });
});

describe("links and XSS safety", () => {
  it("accepts http, https and mailto only", () => {
    expect(isSafeHref("https://example.com/a?b=1")).toBe(true);
    expect(isSafeHref("http://example.com")).toBe(true);
    expect(isSafeHref("mailto:ops@example.com")).toBe(true);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("JaVaScRiPt:alert(1)")).toBe(false);
    expect(isSafeHref("java\tscript:alert(1)")).toBe(false);
    expect(isSafeHref(" javascript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html;base64,AAAA")).toBe(false);
    expect(isSafeHref("//evil.example")).toBe(false);
  });

  it("drops the href of an unsafe link but keeps its label as text", () => {
    expect(parseInline("[click](javascript:alert(1))")).toEqual([{ t: "text", v: "click" }]);
  });

  it("renders a safe link with rel and target", () => {
    render(<Markdown source="see [docs](https://example.com/x)" />);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("href", "https://example.com/x");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders <script> and event-handler markup as inert text", () => {
    const { container } = render(<Markdown source={'# <script>alert(1)</script>\n\n<img src=x onerror=alert(1)> and **<b>x</b>**'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("never renders a javascript: link", () => {
    const { container } = render(<Markdown source="[x](javascript:alert(1)) [y](  javascript:alert(2))" />);
    expect(container.querySelector("a")).toBeNull();
  });
});

describe("parseMarkdown blocks", () => {
  it("parses headings with levels", () => {
    const blocks = parseMarkdown("# One\n## Two\n###### Six");
    expect(blocks.map((b) => (b.t === "heading" ? b.level : 0))).toEqual([1, 2, 6]);
  });

  it("parses bullet, numbered and task lists", () => {
    const blocks = parseMarkdown("- a\n- b\n\n1. x\n2. y\n\n- [ ]\n- [x] done\n- [ ] todo");
    expect(blocks).toHaveLength(3);
    const [bullets, numbered, tasks] = blocks;
    expect(bullets).toMatchObject({ t: "list", ordered: false });
    expect(numbered).toMatchObject({ t: "list", ordered: true });
    if (tasks.t !== "list") throw new Error("expected a list");
    expect(tasks.items.map((i) => i.checked)).toEqual([false, true, false]);
    expect(tasks.items[0].c).toEqual([]);
  });

  it("parses tables with alignment and pads ragged rows", () => {
    const blocks = parseMarkdown("| a | b |\n|:--|--:|\n| 1 | 2 |\n| 3 |");
    expect(blocks).toHaveLength(1);
    const table = blocks[0];
    if (table.t !== "table") throw new Error("expected a table");
    expect(table.align).toEqual(["left", "right"]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1]).toHaveLength(2);
  });

  it("parses fenced code verbatim", () => {
    const blocks = parseMarkdown("```ts\nconst a = **1**;\n```\nafter");
    expect(blocks[0]).toEqual({ t: "code", v: "const a = **1**;", lang: "ts" });
    expect(blocks[1].t).toBe("paragraph");
  });

  it("treats a run of **Key:** value lines as report metadata", () => {
    const blocks = parseMarkdown("**Status:** Published\n**Severity:** P1_CRITICAL");
    const p = blocks[0];
    if (p.t !== "paragraph") throw new Error("expected a paragraph");
    expect(p.meta?.map((m) => m.key)).toEqual(["Status", "Severity"]);
  });

  it("keeps an italic note that spans two source lines together", () => {
    const blocks = parseMarkdown("_first line\nsecond line_");
    const p = blocks[0];
    if (p.t !== "paragraph") throw new Error("expected a paragraph");
    expect(p.c).toHaveLength(1);
    expect(p.c[0].t).toBe("em");
  });

  it("renders the real post-mortem shape without leaking raw markers", () => {
    const md = [
      "# INCIDENT POST-MORTEM REPORT: inc-1",
      "",
      "**Status:** Published",
      "**Author:** VP_OF_INFRA (VP of Infrastructure)",
      "",
      "## 2. Timeline (Known Facts Only)",
      "- **T+3:** Incident created.",
      "- **T+5:** Alert acknowledged.",
      "",
      "## 9. Preventative Action Items",
      "- [ ]",
      "- [ ]",
    ].join("\n");
    const { container } = render(<Markdown source={md} />);
    expect(container.querySelector("h3")?.textContent).toContain("INCIDENT POST-MORTEM REPORT");
    expect(container.querySelectorAll("li").length).toBe(4);
    expect(container.textContent).not.toContain("**");
    expect(container.querySelector("dl")).not.toBeNull();
  });

  it("handles CRLF input and empty input", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("a\r\n\r\nb")).toHaveLength(2);
  });
});
