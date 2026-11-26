// The apps' site header, as on the web: the menus, the theme switch and the
// signed-in account (asked from the web, whose cookie this site shares).
(() => {
  const web = "https://sal.tkkoskovi.cz";
  const themeKey = "koskovi-theme";
  const roles = { admin: "Hlavní správce", manager: "Správa sálu", trainer: "Trenér" };

  // Menus: the phone's section switch and the account menu.
  for (const root of document.querySelectorAll("[data-menu]")) {
    const button = root.querySelector("[data-menu-button]");
    const panel = root.querySelector("[data-menu-panel]");
    const chevron = root.querySelector("[data-chevron]");
    const set = (open) => {
      panel.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      chevron?.classList.toggle("rotate-180", open);
      if (open) {
        panel.classList.remove("fade-enter");
        void panel.offsetWidth;
        panel.classList.add("fade-enter");
      }
    };

    button.addEventListener("click", () => set(panel.hidden));
    document.addEventListener("pointerdown", (event) => {
      if (!root.contains(event.target)) set(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") set(false);
    });
  }

  // Light or dark, saved like on the web (each site keeps its own choice).
  const isDark = () => document.documentElement.classList.contains("dark");
  const paintTheme = () => {
    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      button.querySelector("[data-moon]").hidden = isDark();
      button.querySelector("[data-sun]").hidden = !isDark();
      const label = button.querySelector("[data-theme-label]");
      if (label) label.textContent = isDark() ? "Světlý režim" : "Tmavý režim";
      button.setAttribute("aria-label", isDark() ? "Přepnout na světlý režim" : "Přepnout na tmavý režim");
      button.title = isDark() ? "Světlý režim" : "Tmavý režim";
    }
  };

  for (const button of document.querySelectorAll("[data-theme-toggle]")) {
    button.addEventListener("click", () => {
      const dark = !isDark();
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      try {
        localStorage.setItem(themeKey, dark ? "dark" : "light");
      } catch {
        // Private mode.
      }
      paintTheme();
    });
  }
  paintTheme();

  // The visitor's phone: its app first, marked.
  const platform = /android/i.test(navigator.userAgent)
    ? "android"
    : /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
      ? "ios"
      : null;
  const card = platform && document.querySelector(`[data-platform="${platform}"]`);

  if (card) {
    card.classList.remove("border-line");
    card.classList.add("border-accent", "ring-1", "ring-accent");
    card.querySelector("[data-device-badge]").hidden = false;
    card.parentElement.prepend(card);
  }

  // Signed in on the web: the same tabs and account menu as there.
  const show = (selector, visible) => {
    for (const element of document.querySelectorAll(selector)) element.hidden = !visible;
  };

  fetch(`${web}/api/auth/session`, { credentials: "include" })
    .then((response) => (response.ok ? response.json() : null))
    .then((session) => {
      if (!session?.username) return;
      const name = session.displayName || session.username;
      const canManage = session.role === "admin" || session.role === "manager";

      show("[data-signed-in]", true);
      show("[data-signed-out]", false);
      show("[data-manager]", canManage);
      show("[data-admin]", session.role === "admin");
      for (const element of document.querySelectorAll("[data-user-initial]")) element.textContent = name.slice(0, 1);
      for (const element of document.querySelectorAll("[data-user-name]")) element.textContent = name;
      for (const element of document.querySelectorAll("[data-user-role]")) element.textContent = roles[session.role] ?? "Jen čtení";
      // Signed-in phones find the theme switch in the account menu.
      document.querySelector("[data-theme-wrap]")?.classList.add("max-sm:hidden");
    })
    .catch(() => undefined);

  for (const button of document.querySelectorAll("[data-logout]")) {
    button.addEventListener("click", () => {
      fetch(`${web}/api/auth/logout`, { credentials: "include", method: "POST" })
        .catch(() => undefined)
        .finally(() => window.location.reload());
    });
  }
})();
