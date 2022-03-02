import parse5, {
  Node,
  TextNode,
  ParentNode,
  ChildNode,
  Element,
  DocumentFragment,
} from "parse5";

import { ensureArray } from "./misc";

export interface Attrs {
  [name: string]: string;
}

export interface VElement {
  name: string;
  attrs: Attrs;
  childNodes: (VNode | string)[];
}

export type VTextNode = string;

export type VNode = VElement | VTextNode | undefined;

// Reduce nodes to their text content.
const extractTextFromNode = (node: Node): string =>
  node.nodeName === "#text"
    ? (<TextNode>node).value
    : ((<any>node).childNodes || []).reduce(
        (memo: string, node: Node) => memo + extractTextFromNode(node),
        ""
      ) + (node.nodeName === "p" ? "\n" : "");

// Reduce HTML to its text content.
export const extractText = (html: string): string =>
  extractTextFromNode(<DocumentFragment>parse5.parseFragment(html)).replace(
    // eslint-disable-next-line no-control-regex
    /[\x00-\x09\x0b-\x1f\x7f]/g,
    ""
  );

// Create an element node.
export const createElement = (
  name: string,
  attrs: Attrs = {},
  childNodes: VNode[] = []
) => ({
  name,
  attrs,
  childNodes,
});

const toFragment = (nodes: VNode | VNode[]): DocumentFragment => {
  const result: DocumentFragment = {
    nodeName: "#document-fragment",
    childNodes: [],
  };
  for (const childVNode of ensureArray(nodes)) {
    const childNode = toFragmentNode(childVNode, result);
    if (childNode) {
      result.childNodes.push(childNode);
    }
  }
  return result;
};

const toFragmentNode = (
  node: VNode,
  parentNode: ParentNode
): ChildNode | undefined => {
  if (node === undefined) {
    return undefined;
  } else if (typeof node === "string") {
    const result: TextNode = {
      nodeName: "#text",
      value: node,
      parentNode,
    };
    return result;
  } else {
    const result: Element = {
      nodeName: node.name,
      tagName: node.name,
      namespaceURI: "",
      attrs: [],
      parentNode,
      childNodes: [],
    };
    result.attrs = Object.entries(node.attrs).map(([name, value]) => ({
      name,
      value: typeof value === "string" ? value : "",
    }));
    for (const childVNode of ensureArray(node.childNodes)) {
      const childNode = toFragmentNode(childVNode, result);
      if (childNode) {
        result.childNodes.push(childNode);
      }
    }
    return result;
  }
};

// Render nodes to HTML.
export const render = (nodes: VNode | VNode[]): string =>
  parse5.serialize(toFragment(nodes));

const h = createElement;

// Create an inline element for a mention. Uses the name,
// prefixed with `@`, wrapped in a microformats2 h-card.
export const createMention = (id: string, name: string): VNode =>
  h("span", { class: "h-card" }, [
    h("a", { class: "u-url mention", href: id }, [
      "@",
      h("span", { class: "p-nickname" }, [`${name || "???"}`]),
    ]),
  ]);
