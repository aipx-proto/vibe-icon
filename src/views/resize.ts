import "./resize.css";

const MIN_WIDTH = 300; // Minimum width for the left pane

export function startResizer() {
  // Corrected typo: starResizer -> startResizer
  const resizeHandle = document.getElementById("resize-handle");
  const leftPane = document.querySelector(".left-pane") as HTMLElement | null;
  const appLayout = document.querySelector(".app-layout") as HTMLElement | null;

  if (!resizeHandle || !leftPane || !appLayout) {
    console.error("Resize elements not found");
    return;
  }

  let isResizing = false;
  let resizeHandleWidth = 16; // Default width, will be updated on mousedown

  resizeHandle.addEventListener("mousedown", () => {
    isResizing = true;
    resizeHandleWidth = resizeHandle.offsetWidth; // Get the actual width
    // Add a class to the body to indicate resizing, for cursor changes etc.
    document.body.style.cursor = "col-resize";
    appLayout.style.userSelect = "none"; // Prevent text selection during drag
    resizeHandle.toggleAttribute("data-resizing", true);
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    // Calculate the new width for the left pane
    // The new width is the mouse's X position minus the appLayout's left offset
    const containerRect = appLayout.getBoundingClientRect();
    let newLeftWidth = e.clientX - containerRect.left;

    // Constrain the width of the left pane (e.g., min and max width)
    // Ensure right pane (aside) also has a minimum width, e.g., 200px
    // The resize handle is 10px wide
    const maxWidth = containerRect.width - MIN_WIDTH;

    if (newLeftWidth < MIN_WIDTH) {
      newLeftWidth = MIN_WIDTH;
    }
    if (newLeftWidth > maxWidth) {
      newLeftWidth = maxWidth;
    }

    // Adjust the grid-template-columns of the app-layout
    // The resize handle width is now dynamic
    appLayout.style.gridTemplateColumns = `${newLeftWidth}px ${resizeHandleWidth}px 1fr`;
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = ""; // Reset cursor
      appLayout.style.userSelect = ""; // Re-enable text selection
      resizeHandle.toggleAttribute("data-resizing", false);
    }
  });
}
