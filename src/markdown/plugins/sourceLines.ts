import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

/** Block elements that get a `data-line` attribute (for synced scroll). */
const BLOCKS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "hr", "div", "section", "details", "dl", "dt", "dd", "img",
]);

/**
 * Tag block elements with the source line they start on: `data-line="12"`.
 * Runs before sanitising (which keeps the attribute) while positions exist.
 */
export function rehypeSourceLines() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const line = node.position?.start.line;
      if (line && BLOCKS.has(node.tagName)) node.properties.dataLine = line;
    });
  };
}
