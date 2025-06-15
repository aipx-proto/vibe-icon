/**
 * Icon Observer - Handles lazy loading of SVG icons using IntersectionObserver
 */

// Track loaded icons to avoid re-observing
const loadedIcons = new WeakSet<Element>();

/**
 * Creates and configures an IntersectionObserver for lazy loading icons
 * @returns IntersectionObserver instance configured for icon loading
 */
export function createIconObserver(): IntersectionObserver {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const iconElement = entry.target as HTMLElement;
          const svgContainer = iconElement.querySelector(".svg-container") as HTMLElement;
          const filename = iconElement.dataset.filename;
          const styles = iconElement.dataset.style?.split(",") || [];

          if (filename && styles.length > 0 && svgContainer && !svgContainer.dataset.loaded) {
            svgContainer.innerHTML = styles
              .slice(0, 2) // Show up to 2 styles
              .map((style, index) => {
                return `<svg width="48" height="48" class="icon-svg" data-style-index="${index}"}">
                <use href="${import.meta.env.BASE_URL}/${filename}#${style}" />
              </svg>`;
              })
              .join("");

            svgContainer.dataset.loaded = "true";
            observer.unobserve(iconElement);
            loadedIcons.add(iconElement);
          }
        }
      });
    },
    {
      rootMargin: "50px", // Start loading 50px before entering viewport
      threshold: 0.01,
    }
  );

  return observer;
}

/**
 * Checks if an icon element has already been loaded
 * @param element - The icon element to check
 * @returns true if the icon has been loaded, false otherwise
 */
export function isIconLoaded(element: Element): boolean {
  return loadedIcons.has(element);
}

/**
 * Marks an icon element as loaded
 * @param element - The icon element to mark as loaded
 */
export function markIconAsLoaded(element: Element): void {
  loadedIcons.add(element);
}

// Create a singleton instance that can be imported directly
export const iconObserver = createIconObserver();
