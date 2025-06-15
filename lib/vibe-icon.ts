import { Subject, Subscription, switchMap } from "rxjs";

export class VibeIcon extends HTMLElement {
  static define() {
    if (!customElements.get("vibe-icon")) {
      customElements.define("vibe-icon", VibeIcon);
    }
  }

  static observedAttributes = ["name", "size", "style"];

  private renderRequest$ = new Subject<void>();
  private subscription: Subscription | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.subscription = this.renderRequest$.pipe(switchMap(() => this.render())).subscribe();

    this.renderRequest$.next();
  }

  disconnectedCallback() {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue !== newValue) {
      this.renderRequest$.next();
    }
  }

  async render() {
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
