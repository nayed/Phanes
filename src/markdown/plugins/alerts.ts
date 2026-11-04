import type { Element, ElementContent, Root, Text } from "hast";
import { visit } from "unist-util-visit";

type AlertType = "note" | "tip" | "important" | "warning" | "caution";

/** Icon paths from lucide (ISC licence), matching the app's icon set. */
const ICONS: Record<AlertType, Array<[string, Record<string, string>]>> = {
  note: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 16v-4" }],
    ["path", { d: "M12 8h.01" }],
  ],
  tip: [
    ["path", { d: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" }],
    ["path", { d: "M9 18h6" }],
    ["path", { d: "M10 22h4" }],
  ],
  important: [
    ["path", { d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" }],
    ["path", { d: "M12 15h.01" }],
    ["path", { d: "M12 7v4" }],
  ],
  warning: [
    ["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }],
    ["path", { d: "M12 9v4" }],
    ["path", { d: "M12 17h.01" }],
  ],
  caution: [
    ["path", { d: "M12 16h.01" }],
    ["path", { d: "M12 8v4" }],
    ["path", { d: "M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z" }],
  ],
};

const TITLES: Record<AlertType, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/i;

function icon(type: AlertType): Element {
  return {
    type: "element",
    tagName: "svg",
    properties: {
      className: ["markdown-alert-icon"],
      viewBox: "0 0 24 24",
      width: "16",
      height: "16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ariaHidden: "true",
    },
    children: ICONS[type].map(([tagName, properties]) => ({ type: "element", tagName, properties, children: [] })),
  };
}

/**
 * GitHub alerts: a blockquote whose first line is `[!NOTE]`, `[!TIP]`,
 * `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` becomes
 * `<div class="markdown-alert markdown-alert-note">` with an icon and a title.
 */
export function rehypeAlerts() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "blockquote") return;
      const firstP = node.children.find((c): c is Element => c.type === "element");
      if (!firstP || firstP.tagName !== "p") return;
      const firstText = firstP.children[0];
      if (!firstText || firstText.type !== "text") return;
      const match = MARKER.exec(firstText.value);
      if (!match) return;

      const type = match[1].toLowerCase() as AlertType;
      (firstText as Text).value = firstText.value.slice(match[0].length);
      // Drop the paragraph if the marker was all it held (or a leading <br>).
      if (!firstText.value) firstP.children.shift();
      const lead = firstP.children[0];
      if (lead?.type === "element" && lead.tagName === "br") firstP.children.shift();
      const rest = firstP.children.length ? node.children : node.children.filter((c) => c !== firstP);

      node.tagName = "div";
      node.properties = {
        ...node.properties,
        className: ["markdown-alert", `markdown-alert-${type}`],
      };
      const title: Element = {
        type: "element",
        tagName: "p",
        properties: { className: ["markdown-alert-title"] },
        children: [icon(type), { type: "text", value: TITLES[type] }],
      };
      node.children = [title, ...(rest as ElementContent[])];
    });
  };
}
