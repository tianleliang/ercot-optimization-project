import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import reportSource from "../content/report.md?raw";

/** Rewrite absolute `/report-assets/...` paths for Vite `base: "./"`. */
function assetUrl(src: string | undefined): string {
  if (!src) return "";
  if (src.startsWith("/report-assets/")) return `.${src}`;
  if (src.startsWith("report-assets/")) return `./${src}`;
  return src;
}

function extractText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && node !== null && "props" in node) {
    const el = node as { props?: { children?: unknown } };
    return extractText(el.props?.children);
  }
  return "";
}

/**
 * Convert Obsidian-style `> [!note] Title` callouts into ordinary blockquotes
 * marked with a recognizable title line for custom rendering.
 */
function preprocessReport(md: string): string {
  const lines = md.replace(/^\uFEFF/, "").split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^>\s*\[!(\w+)\]\s*(.*)$/i);
    if (!m) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const title = m[2].trim() || "Note";
    const body: string[] = [];
    i += 1;
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      body.push(lines[i].replace(/^>\s?/, ""));
      i += 1;
    }
    out.push(`> **Research callout · ${title}**`);
    out.push(`>`);
    for (const b of body) out.push(`> ${b}`);
    out.push("");
  }
  return out
    .join("\n")
    .replace(/^<!--[\s\S]*?-->\s*/, "")
    // Single-dollar math is off (dollar amounts), so promote symbols like $x_i$ to $$x_i$$.
    .replace(/(?<!\$)\$([A-Za-z](?:_[A-Za-z])?(?:\([a-z]\))?)\$(?!\$)/g, "$$$$$1$$$$")
    .replace(
      /^# From Climate-Risk Forecasts to Resilience Investment Decisions in ERCOT\s*\n+/,
      "",
    );
}

export default function ReportView() {
  const markdown = useMemo(() => preprocessReport(reportSource), []);

  return (
    <article className="report-view" aria-label="Project report">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={(url) => assetUrl(url)}
        components={{
          img: ({ src, alt }) => (
            <figure className="report-figure">
              <img src={assetUrl(src)} alt={alt ?? ""} loading="lazy" />
            </figure>
          ),
          em: ({ children }) => {
            const text = extractText(children).trim();
            if (/^Figure\s+\d+/i.test(text)) {
              return <figcaption className="report-caption">{children}</figcaption>;
            }
            return <em>{children}</em>;
          },
          table: ({ children }) => (
            <div className="report-table-wrap">
              <table>{children}</table>
            </div>
          ),
          blockquote: ({ children }) => {
            const items = Array.isArray(children) ? children : [children];
            const text = extractText(children);
            if (text.includes("Research callout ·")) {
              const titleMatch = text.match(/Research callout ·\s*([^\n]+)/i);
              const title = (titleMatch?.[1] ?? "Note").trim();
              const body = items.filter((child) => {
                const t = extractText(child);
                return t.trim() !== "" && !t.includes("Research callout ·");
              });
              return (
                <aside className="research-callout" aria-label={title}>
                  <p className="research-callout-title">{title}</p>
                  <div className="research-callout-body">{body}</div>
                </aside>
              );
            }
            return <blockquote>{children}</blockquote>;
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
