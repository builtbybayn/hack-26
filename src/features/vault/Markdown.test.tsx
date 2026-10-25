import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, parseBlocks } from "./Markdown";

const html = (source: string, resolves?: (name: string) => boolean) =>
  renderToStaticMarkup(<Markdown source={source} onWikiLink={() => {}} resolves={resolves} />);

describe("Markdown", () => {
  it("parses block structure", () => {
    expect(
      parseBlocks("# Title\n\nOne\ntwo\n\n- a\n  - b\n1. c\n> quote\n```js\nx\n```\n---").map(
        (block) => block.type,
      ),
    ).toEqual(["heading", "paragraph", "list", "list", "quote", "code", "rule"]);
  });

  it("renders inline formatting and keeps line breaks", () => {
    expect(html("**bold** *it* ~~no~~ ==mark== `code` $x^2$\nnext")).toBe(
      '<p><strong>bold</strong> <em>it</em> <s>no</s> <mark>mark</mark> <code>code</code> <code class="md-math">x^2</code><br/>next</p>',
    );
  });

  it("renders wikilinks with aliases and marks unresolved ones", () => {
    const output = html("See [[Ideas|my ideas]] and [[Missing]]", (name) => name === "Ideas");
    expect(output).toContain('<a href="#" class="md-wikilink">my ideas</a>');
    expect(output).toContain('<a href="#" class="md-wikilink is-unresolved">Missing</a>');
  });

  it("escapes HTML and only links safe URLs", () => {
    const output = html('<img src=x onerror="alert(1)"> [ok](https://a.dev) [bad](javascript:x)');
    expect(output).toContain("&lt;img");
    expect(output).toContain('href="https://a.dev"');
    expect(output).not.toContain("javascript:");
  });

  it("renders task lists", () => {
    const output = html("- [x] done\n- [ ] todo");
    expect(output.match(/type="checkbox"/g)).toHaveLength(2);
    expect(output.match(/checked=""/g)).toHaveLength(1);
  });
});
