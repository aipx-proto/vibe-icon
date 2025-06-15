import { codeToHtml } from "shiki";

const theme = "one-dark-pro"; // theme name

export class CodeSnippet extends HTMLElement {
  static define() {
    if (!customElements.get("code-snippet")) {
      customElements.define("code-snippet", CodeSnippet);
    }
  }
  static observedAttributes = ["data-lang", "data-code"];

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
      codeToHtml(code, { lang, theme })
        .then((html) => {
          this.shadowRoot!.innerHTML = html;
        })
        .catch((error) => {
          console.error("Error rendering code snippet:", error);
        });
    }
  }
}
