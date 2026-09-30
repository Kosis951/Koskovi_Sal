// Shared by the root layout (server) and useInstallApp (client), so it must
// not be a "use client" module.

export const installChangeEvent = "koskovi-install-change";

// Inline script for the root layout: in the installed app (home screen) the
// page cannot be zoomed, like a native app. In the browser zoom stays, so
// people who need larger text can still use it. Android honours the viewport
// setting; iOS additionally needs its pinch gesture blocked.
export const standaloneZoomScript = `
  if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true) {
    var viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute("content", viewport.getAttribute("content") + ", maximum-scale=1, user-scalable=no");
    }
    document.addEventListener("gesturestart", function (event) { event.preventDefault(); });
  }
`;

// Inline script for the root layout. Browsers fire "beforeinstallprompt" once,
// early, often before React starts; this keeps the event for the install
// buttons (useInstallApp) and hides the browser's own mini install bar.
export const installCaptureScript = `
  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    window.__koskoviInstallPrompt = event;
    window.dispatchEvent(new Event("${installChangeEvent}"));
  });
  window.addEventListener("appinstalled", function () {
    window.__koskoviInstallPrompt = null;
    window.__koskoviInstalled = true;
    window.dispatchEvent(new Event("${installChangeEvent}"));
  });
`;
