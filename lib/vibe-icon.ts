import { Subject, Subscription, switchMap } from "rxjs";
import { displayNameToSourceAssetSVGFilename, displayNameToVibeIconSVGFilename } from "../scripts/normalize-name";

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
    const name = displayNameToVibeIconSVGFilename(this.getAttribute("name") ?? "emoji-meme");
    const size = this.getAttribute("size") || "24";
    const style = this.hasAttribute("filled") ? "filled" : "regular";
    const hasExplicitSize = this.hasAttribute("size");
    const cacheKey = hasExplicitSize ? `${name}_${size}_${style}` : name;

    let svgText = "";
    if (VibeIcon.cache.has(cacheKey)) {
      svgText = await VibeIcon.cache.get(cacheKey)!;
    } else {
      const asyncResult = fetch(
        // @ts-ignore
        this.getSourceCodePath(name, size, style)
      ).then((response) => response.text());
      VibeIcon.cache.set(cacheKey, asyncResult);
      svgText = await asyncResult;
    }

    if (hasExplicitSize) {
      // sample response
      // <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-5 9a2 2 0 0 0-2 2c0 1.7.83 2.97 2.13 3.8A9.14 9.14 0 0 0 10 18c1.85 0 3.58-.39 4.87-1.2A4.35 4.35 0 0 0 17 13a2 2 0 0 0-2-2H5Z"></path></svg>

      const parsedsvg = new DOMParser().parseFromString(svgText, "image/svg+xml");
      parsedsvg.querySelector("path")?.setAttribute("fill", "currentColor");

      this.shadowRoot!.innerHTML = `
<style>:host { display: contents; }</style>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" data-icon="${name}" data-style="${style}" viewBox="${
        parsedsvg.querySelector("svg")?.getAttribute("viewBox") || "0 0 24 24"
      }">
  ${parsedsvg.querySelector("svg")?.innerHTML || ""}
</svg>
`;
    } else {
      // the fetched SVG are symbols, e.g.:
      // <svg xmlns="http://www.w3.org/2000/svg">
      //   <symbol id="regular" viewBox="0 0 24 24">
      //     <path d="M11.4684 6.403C10.9025 6.18838 10.5002 5.64117 10.5002 5C10.5002 4.17157 11.1718 3.5 12.0002 3.5C12.8286 3.5 13.5002 4.17157 13.5002 5C13.5002 5.64127 13.0978 6.18855 12.5317 6.4031C12.1824 6.48801 11.8177 6.48797 11.4684 6.403ZM9.0002 5C9.0002 5.1352 9.00914 5.2683 9.02647 5.39876L6.15015 4.17784C5.00701 3.6926 3.68228 4.2222 3.1887 5.36177C2.69342 6.50526 3.22266 7.82908 4.36975 8.31599L8.00271 9.85809V13.5595L6.12373 19.0165C5.71917 20.1914 6.34368 21.4719 7.51862 21.8764C8.69356 22.281 9.974 21.6565 10.3786 20.4815L10.5237 20.0599C10.1868 19.2743 10.0002 18.4089 10.0002 17.5C10.0002 17.2947 10.0098 17.0917 10.0284 16.8912L8.96029 19.9932C8.82543 20.3848 8.39862 20.593 8.00697 20.4581C7.61533 20.3233 7.40716 19.8965 7.54201 19.5048L9.43461 14.0083C9.4797 13.8774 9.50271 13.7399 9.50271 13.6014V9.69262C9.50271 9.19101 9.20286 8.73798 8.74113 8.54199L4.95584 6.93523C4.57528 6.77369 4.40082 6.33732 4.56514 5.95794C4.73116 5.57464 5.17954 5.39538 5.56405 5.55859L10.535 7.66865C10.6943 7.73627 10.8571 7.79238 11.0223 7.83699C11.3288 7.94264 11.6578 8 12.0002 8C12.3424 8 12.6712 7.9427 12.9776 7.83718C13.143 7.79254 13.306 7.73636 13.4655 7.66865L18.4365 5.55859C18.821 5.39538 19.2694 5.57464 19.4354 5.95794C19.5997 6.33732 19.4253 6.77369 19.0447 6.93523L15.2643 8.53992C14.8026 8.73591 14.5027 9.18894 14.5027 9.69055V11.3127C14.9809 11.1584 15.4833 11.0581 16.0027 11.0188V9.85602L19.6308 8.31599C20.7779 7.82908 21.3071 6.50526 20.8118 5.36177C20.3183 4.2222 18.9935 3.6926 17.8504 4.17784L14.9739 5.39883C14.9913 5.26835 15.0002 5.13522 15.0002 5C15.0002 3.34315 13.6571 2 12.0002 2C10.3433 2 9.0002 3.34315 9.0002 5ZM22.0002 17.5C22.0002 20.5376 19.5378 23 16.5002 23C13.4627 23 11.0002 20.5376 11.0002 17.5C11.0002 14.4624 13.4627 12 16.5002 12C19.5378 12 22.0002 14.4624 22.0002 17.5ZM16.5002 14C16.2241 14 16.0002 14.2239 16.0002 14.5V18.5C16.0002 18.7761 16.2241 19 16.5002 19C16.7764 19 17.0002 18.7761 17.0002 18.5V14.5C17.0002 14.2239 16.7764 14 16.5002 14ZM16.5002 21.125C16.8454 21.125 17.1252 20.8452 17.1252 20.5C17.1252 20.1548 16.8454 19.875 16.5002 19.875C16.1551 19.875 15.8752 20.1548 15.8752 20.5C15.8752 20.8452 16.1551 21.125 16.5002 21.125Z" fill="currentColor"/>
      //   </symbol>
      //   <symbol id="filled" viewBox="0 0 24 24">
      //     <path d="M12.0004 6.5C13.243 6.5 14.2504 5.49264 14.2504 4.25C14.2504 3.00736 13.243 2 12.0004 2C10.7577 2 9.75037 3.00736 9.75037 4.25C9.75037 5.49264 10.7577 6.5 12.0004 6.5ZM6.15015 4.17803C5.00701 3.69279 3.68228 4.22239 3.1887 5.36195C2.69342 6.50545 3.22266 7.82927 4.36975 8.31618L7.39345 9.59966C7.76283 9.75645 8.00271 10.1189 8.00271 10.5202V13.5597L6.12373 19.0167C5.71917 20.1916 6.34368 21.4721 7.51862 21.8766C8.69356 22.2812 9.974 21.6567 10.3786 20.4817L10.5238 20.0598C10.1869 19.2743 10.0004 18.4089 10.0004 17.5C10.0004 14.0776 12.6454 11.273 16.0027 11.0188V10.5181C16.0027 10.1168 16.2426 9.75438 16.612 9.59759L19.6308 8.31618C20.7779 7.82927 21.3071 6.50545 20.8118 5.36195C20.3183 4.22239 18.9935 3.69279 17.8504 4.17803L16.2444 4.85973C15.9037 5.00435 15.666 5.28256 15.5496 5.59067C15.0076 7.02499 13.6219 8.04295 12.0003 8.04295C10.3788 8.04295 8.99308 7.025 8.45103 5.5907C8.3346 5.2826 8.09695 5.00439 7.75625 4.85978L6.15015 4.17803ZM22.0004 17.5C22.0004 20.5376 19.5379 23 16.5004 23C13.4628 23 11.0004 20.5376 11.0004 17.5C11.0004 14.4624 13.4628 12 16.5004 12C19.5379 12 22.0004 14.4624 22.0004 17.5ZM16.5004 14C16.2242 14 16.0004 14.2239 16.0004 14.5V18.5C16.0004 18.7761 16.2242 19 16.5004 19C16.7765 19 17.0004 18.7761 17.0004 18.5V14.5C17.0004 14.2239 16.7765 14 16.5004 14ZM16.5004 21.125C16.8455 21.125 17.1254 20.8452 17.1254 20.5C17.1254 20.1548 16.8455 19.875 16.5004 19.875C16.1552 19.875 15.8754 20.1548 15.8754 20.5C15.8754 20.8452 16.1552 21.125 16.5004 21.125Z" fill="currentColor"/>
      //   </symbol>
      // </svg>

      const symbol = new DOMParser().parseFromString(svgText, "image/svg+xml").querySelector(`symbol#${style}`);
      const viewBox = symbol?.getAttribute("viewBox") || "0 0 24 24";

      this.shadowRoot!.innerHTML = `
<style>:host { display: contents; }</style>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" data-icon="${name}" data-style="${style}" viewBox="${viewBox}">
  ${symbol?.innerHTML || ""}
</svg>
      `.trim();
    }
  }

  private getSourceCodePath(name: string, size: string, style: string): string {
    const explicitSize = this.getAttribute("size");
    if (explicitSize) {
      const svgFilename = displayNameToSourceAssetSVGFilename(this.getAttribute("name") ?? "emoji-meme");
      return `https://esm.sh/@fluentui/svg-icons/icons/${svgFilename}_${size}_${style}.svg?raw`;
    } else {
      const svgFilename = displayNameToVibeIconSVGFilename(name);
      return `${import.meta.env.VITE_VIBE_BUTTON_ENDPOINT}/${svgFilename}.svg`;
    }
  }
}
