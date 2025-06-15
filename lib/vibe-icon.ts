export class VibeIcon extends HTMLElement {
  static define() {
    if (!customElements.get("vibe-icon")) {
      customElements.define("vibe-icon", VibeIcon);
    }
  }

  static observedAttributes = ["name", "size", "style"];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  render() {
    const name = this.getAttribute("name");
    const size = this.getAttribute("size") || "24";
    const style = this.getAttribute("style") || "regular";

    if (name) {
      // Here you would fetch the icon data and render it
      // For now, we just log the values
      console.log(`Rendering icon: ${name}, size: ${size}, style: ${style}`);
      // Actual rendering logic would go here
    }
  }
}
