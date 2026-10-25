/**
 * A small Markdown renderer for notes and chat replies (Obsidian's reading view). It builds React
 * elements directly, never HTML strings, so note content can't inject markup.
 *
 * Supports headings, paragraphs, lists (with tasks), quotes, fenced code, rules, **bold**,
 * *italic*, ~~strike~~, ==highlight==, `code`, $math$, [links](url), and [[wikilinks]].
 */
import { Fragment, type ReactNode } from "react";
import "./markdown.css";

interface MarkdownProps {
  source: string;
  /** Called for `[[Name]]` links. Without it, wikilinks render as plain text. */
  onWikiLink?: (name: string) => void;
  /** Whether a wikilink target exists, to style unresolved links like Obsidian does. */
  resolves?: (name: string) => boolean;
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: { text: string; depth: number; task?: boolean }[] }
  | { type: "quote"; lines: string[] }
  | { type: "code"; language: string; text: string }
  | { type: "rule" };

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const fence = line.match(/^\s*```(\S*)/);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) body.push(lines[index++]);
      index += 1; // closing fence
      blocks.push({ type: "code", language: fence[1], text: body.join("\n") });
      continue;
    }
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index]))
        quote.push(lines[index++].replace(/^\s*>\s?/, ""));
      blocks.push({ type: "quote", lines: quote });
      continue;
    }
    const first = line.match(LIST_ITEM);
    if (first) {
      const ordered = /\d/.test(first[2]);
      const items: { text: string; depth: number; task?: boolean }[] = [];
      while (index < lines.length) {
        const item = lines[index].match(LIST_ITEM);
        if (!item || /\d/.test(item[2]) !== ordered) break;
        const task = item[3].match(/^\[([ xX])\]\s+(.*)$/);
        items.push({
          depth: Math.min(Math.floor(item[1].replace(/\t/g, "    ").length / 2), 6),
          text: task ? task[2] : item[3],
          ...(task ? { task: task[1] !== " " } : {}),
        });
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6}\s|\s*```|\s*>)/.test(lines[index]) &&
      !LIST_ITEM.test(lines[index])
    )
      paragraph.push(lines[index++]);
    blocks.push({ type: "paragraph", lines: paragraph });
  }
  return blocks;
}

const INLINE =
  /(`[^`]+`)|(\$[^$\n]+\$)|(\[\[[^\]]+\]\])|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*|__[^_]+__)|(~~[^~]+~~)|(==[^=]+==)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function renderInline(text: string, props: MarkdownProps, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let count = 0;
  for (const match of text.matchAll(INLINE)) {
    const [token] = match;
    const start = match.index;
    if (start > last) nodes.push(text.slice(last, start));
    const key = `${keyPrefix}-${count++}`;
    if (match[1]) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (match[2])
      nodes.push(
        <code key={key} className="md-math">
          {token.slice(1, -1)}
        </code>,
      );
    else if (match[3]) {
      const [target, alias] = token.slice(2, -2).split("|");
      const resolved = props.resolves?.(target) ?? true;
      nodes.push(
        props.onWikiLink ? (
          <a
            key={key}
            href="#"
            className={resolved ? "md-wikilink" : "md-wikilink is-unresolved"}
            onClick={(event) => {
              event.preventDefault();
              props.onWikiLink?.(target.trim());
            }}
          >
            {(alias ?? target).trim()}
          </a>
        ) : (
          <span key={key}>{(alias ?? target).trim()}</span>
        ),
      );
    } else if (match[4]) {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      const safe = /^(https?:|mailto:|#)/i.test(href);
      nodes.push(
        safe ? (
          <a key={key} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        ),
      );
    } else if (match[5])
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), props, key)}</strong>);
    else if (match[6]) nodes.push(<s key={key}>{renderInline(token.slice(2, -2), props, key)}</s>);
    else if (match[7])
      nodes.push(<mark key={key}>{renderInline(token.slice(2, -2), props, key)}</mark>);
    else if (match[8])
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), props, key)}</em>);
    last = start + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown(props: MarkdownProps) {
  const blocks = parseBlocks(props.source);
  return (
    <>
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.type) {
          case "heading": {
            const Tag = `h${block.level}` as "h1";
            return <Tag key={key}>{renderInline(block.text, props, key)}</Tag>;
          }
          case "paragraph":
            return (
              <p key={key}>
                {block.lines.map((line, lineIndex) => (
                  <Fragment key={lineIndex}>
                    {lineIndex > 0 && <br />}
                    {renderInline(line, props, `${key}-${lineIndex}`)}
                  </Fragment>
                ))}
              </p>
            );
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={key}>
                {block.items.map((item, itemIndex) => (
                  <li
                    key={itemIndex}
                    style={item.depth ? { marginLeft: `${item.depth * 1.5}em` } : undefined}
                    className={item.task === undefined ? undefined : "md-task"}
                  >
                    {item.task !== undefined && (
                      <input type="checkbox" checked={item.task} readOnly tabIndex={-1} />
                    )}
                    {renderInline(item.text, props, `${key}-${itemIndex}`)}
                  </li>
                ))}
              </Tag>
            );
          }
          case "quote":
            return (
              <blockquote key={key}>
                {block.lines.map((line, lineIndex) => (
                  <Fragment key={lineIndex}>
                    {lineIndex > 0 && <br />}
                    {renderInline(line, props, `${key}-${lineIndex}`)}
                  </Fragment>
                ))}
              </blockquote>
            );
          case "code":
            return (
              <pre key={key} data-language={block.language || undefined}>
                <code>{block.text}</code>
              </pre>
            );
          case "rule":
            return <hr key={key} />;
        }
      })}
    </>
  );
}
