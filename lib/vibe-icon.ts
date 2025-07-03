import { Subject, Subscription, switchMap } from "rxjs";
import { displayNameToVibeIconSVGFilename } from "../scripts/normalize-name";

export class VibeIcon extends HTMLElement {
  static define() {
    if (!customElements.get("vibe-icon")) {
      customElements.define("vibe-icon", VibeIcon);
    }
  }
  static observedAttributes = ["name", "size", "filled"];
  static cache: Map<string, Promise<string>> = new Map();

  private renderRequest$ = new Subject<void>();
  private subscription: Subscription | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.showPlaceholder();
  }

  connectedCallback() {
    this.subscription = this.renderRequest$.pipe(switchMap(() => this.render())).subscribe();
    this.renderRequest$.next();
  }

  disconnectedCallback() {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue !== newValue) {
      this.renderRequest$.next();
    }
  }

  async render() {
    let name = this.getAttribute("name") ?? undefined;
    const size = this.getAttribute("size") ?? "20";
    if (!name) {
      this.showPlaceholder();
      return;
    }

    name = await this.checkEmoji(name);

    const style = this.hasAttribute("filled") ? "filled" : "regular";
    const hasExplicitSize = this.hasAttribute("size");
    const cacheKey = hasExplicitSize ? `${name}_${size}_${style}` : name;

    let svgText = "";
    if (VibeIcon.cache.has(cacheKey)) {
      svgText = await VibeIcon.cache.get(cacheKey)!;
    } else {
      const asyncResult = fetch(this.getSourceCodePath(name, size, style))
        .then((response) => response.text())
        .catch(() => {
          console.error(`Failed to fetch ${name} icon`);
          return "";
        });
      VibeIcon.cache.set(cacheKey, asyncResult);
      svgText = await asyncResult;
    }
    if (!svgText) {
      this.showPlaceholder();
      return;
    }
    // if (hasExplicitSize) the fetched SVG are symbols, e.g.:
    // <svg xmlns="http://www.w3.org/2000/svg">
    //   <symbol id="regular" viewBox="0 0 20 20">
    //     <path d="M11.46 6.40C10.90 6.18 10.50 5.64 1 ... 0.00Z" fill="currentColor"/>
    //   </symbol>
    //   <symbol id="filled" viewBox="0 0 20 20">
    //     <path d="M12.00 6.5C13.24 6.5 14.25 5.49 14.25  ... 0.00Z" fill="currentColor"/>
    //   </symbol>
    // </svg>
    // if (!hasExplicitSize) the fetched SVG is a single SVG, e.g.:
    // <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    //   <path d="M10 2a4 4 0 1 0 0 8 4 4 0 0 0  ... 0.00Z" fill="currentColor"/>
    // </svg>

    const parsedDom = new DOMParser().parseFromString(svgText, "text/html");
    const parsedSvg = hasExplicitSize ? parsedDom.querySelector("svg") : parsedDom.querySelector(`symbol#${style}`);
    const viewBox = parsedSvg?.getAttribute("viewBox") || "0 0 20 20";
    const innerHTML = parsedSvg?.innerHTML || VibeIcon.placeholderIconPath;
    this.shadowRoot!.innerHTML = this.getIconSvgString({ name, size, style, viewBox, innerHTML });
  }

  private getSourceCodePath(name: string, size: string, style: string): string {
    const filename = displayNameToVibeIconSVGFilename(name);
    const explicitSize = this.getAttribute("size");
    if (explicitSize) {
      return `${import.meta.env.VITE_VIBE_ICON_ENDPOINT}/icons/${filename}/${filename}-${size}-${style}.svg`;
    } else {
      return `${import.meta.env.VITE_VIBE_ICON_ENDPOINT}/icons/${filename}/${filename}.svg`;
    }
  }

  showPlaceholder() {
    this.shadowRoot!.innerHTML = this.getIconSvgString({ size: this.getAttribute("size") ?? undefined });
  }

  private getIconSvgString({
    name = "placeholder",
    size = "20",
    style = "regular",
    viewBox = "0 0 20 20",
    innerHTML = VibeIcon.placeholderIconPath,
  }: {
    name?: string;
    size?: string;
    style?: string;
    viewBox?: string;
    innerHTML?: string;
  }): string {
    return `
<style>:host { display: contents; }</style>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" data-icon="${name}" data-style="${style}" viewBox="${viewBox}">
  ${innerHTML}
</svg>`.trim();
  }

  private static placeholderIconPath = `<circle cx="10" cy="10" r="8" fill="currentColor" opacity="0.15"/>`;

  private async checkEmoji(name: string): Promise<string> {
    const emojiRegex = /\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu;
    const emojiMatch = name.match(emojiRegex);
    const maybeUnicode = name.length === 1 || name.length === 2;
    if (emojiMatch || maybeUnicode) {
      const emojiMap = await VibeIcon.getEmojiMap();
      if (emojiMap) {
        const emojis = emojiMatch?.join("") ?? name;
        const iconName = emojiMap.get(emojis);
        console.log({ emojis, iconName, emojiMap, maybeUnicode });
        if (iconName) {
          return iconName;
        }
      }
      return "";
    }
    return name;
  }

  static emojiMap: Promise<Map<string, string>> | null = null;

  static getEmojiMap(): Promise<Map<string, string>> {
    if (VibeIcon.emojiMap == null) {
      VibeIcon.emojiMap = fetch(`${import.meta.env.VITE_VIBE_ICON_ENDPOINT}/emoji-map.json`)
        .then(async (response) => new Map(Object.entries((await response.json()) as Record<string, string>)))
        .catch(() => {
          console.error(`Failed to fetch emoji map`);
          return new Map();
        });
    }
    return VibeIcon.emojiMap;
  }
}
