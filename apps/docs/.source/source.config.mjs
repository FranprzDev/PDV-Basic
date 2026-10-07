// source.config.ts
import { defineDocs, defineConfig } from "fumadocs-mdx/config";

// src/lib/remark-mermaid.ts
function remarkMermaid() {
  return (tree) => {
    walk(tree.children);
  };
}
function walk(children) {
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.type === "code" && node.lang === "mermaid") {
      children[i] = {
        type: "mdxJsxFlowElement",
        name: "Mermaid",
        attributes: [
          {
            type: "mdxJsxAttribute",
            name: "chart",
            value: node.value ?? ""
          }
        ],
        children: []
      };
    } else if (node.children) {
      walk(node.children);
    }
  }
}

// source.config.ts
var docs = defineDocs({
  dir: "content/docs"
});
var source_config_default = defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMermaid]
  }
});
export {
  source_config_default as default,
  docs
};
