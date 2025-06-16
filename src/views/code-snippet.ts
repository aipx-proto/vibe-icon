import { transformerCopyButton } from "@rehype-pretty/transformers";
import { codeToHtml } from "shiki";
import style from "./code-snippet.css?raw";

const theme = "one-dark-pro"; // theme name

export class CodeSnippet extends HTMLElement {
  static define() {
    if (!customElements.get("code-snippet")) {
      customElements.define("code-snippet", CodeSnippet);
    }
  }
  static observedAttributes = ["data-lang", "data-code"];

  private transformers = [
    transformerCopyButton({
      visibility: "always",
      feedbackDuration: 2_000,
    }),
  ];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  set lang(value: string) {
    this.setAttribute("data-lang", value);
    this.render();
  }

  set code(value: string) {
    this.setAttribute("data-code", value);
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    const lang = this.getAttribute("data-lang");
    const code = this.getAttribute("data-code");

    if (lang && code) {
      codeToHtml(code, { lang, theme, transformers: this.transformers })
        .then((html) => {
          this.shadowRoot!.innerHTML = `<style>${style}</style>${html}`;
        })
        .catch((error) => {
          console.error("Error rendering code snippet:", error);
        });
    }
  }
}
