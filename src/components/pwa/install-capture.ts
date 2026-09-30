// Shared by the root layout (server) and useInstallApp (client), so it must
// not be a "use client" module.

export const installChangeEvent = "koskovi-install-change";

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
