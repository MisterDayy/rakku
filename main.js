let currentMode = "manga";

const ICONS = {
  home: `<svg viewBox="0 0 24 24" width="21" height="21"><path fill="currentColor" d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3z"/></svg>`,
  genre: `<svg viewBox="0 0 24 24" width="21" height="21"><path fill="currentColor" d="M3 5h11v2H3zm0 6h11v2H3zm0 6h7v2H3zM17 3l4 4-1.4 1.4L18 6.8V19a1 1 0 0 1-1 1h-1v-2h1V6.8l-1.6 1.6L14 7z"/></svg>`,
  riwayat: `<svg viewBox="0 0 24 24" width="21" height="21"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m1 10.59V6h-2v8l6 3.6 1-1.6z"/></svg>`,
};

const BOTTOM_NAV_CONFIG = {
  manga: [
    { page: "home", label: "Beranda", icon: ICONS.home, action: () => MangaApp.renderHome() },
    { page: "genre", label: "Genre", icon: ICONS.genre, action: () => MangaApp.renderGenre() },
    { page: "riwayat", label: "Riwayat", icon: ICONS.riwayat, action: () => MangaApp.renderRiwayat() },
  ],
  anime: [
    { page: "home", label: "Beranda", icon: ICONS.home, action: () => AnimeApp.renderHome() },
  ],
};

function renderBottomNav() {
  const nav = document.getElementById("bottomNav");
  const items = BOTTOM_NAV_CONFIG[currentMode];
  nav.innerHTML = items
    .map(
      (item, i) => `
    <button class="bn-btn ${i === 0 ? "active" : ""}" data-page="${item.page}">
      ${item.icon}
      <span>${item.label}</span>
    </button>`
    )
    .join("");

  nav.querySelectorAll(".bn-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      nav.querySelectorAll(".bn-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const item = items.find((it) => it.page === btn.dataset.page);
      if (item) item.action();
    });
  });
}

window.setBottomNavActive = function (page) {
  const nav = document.getElementById("bottomNav");
  nav.querySelectorAll(".bn-btn").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
};

function closeSideMenu() {
  document.getElementById("sideMenu").classList.remove("open");
  document.getElementById("sideMenuOverlay").classList.remove("open");
}

function switchMode(mode) {
  if (mode === currentMode) {
    closeSideMenu();
    return;
  }
  currentMode = mode;

  document.querySelectorAll(".side-menu-item").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  document.getElementById("searchInput").placeholder = mode === "manga" ? "Cari judul manga..." : "Cari judul anime...";
  document.getElementById("searchInput").value = "";

  if (mode === "anime") MangaApp.stopCarousel();

  renderBottomNav();
  if (mode === "manga") MangaApp.renderHome();
  else AnimeApp.renderHome();

  closeSideMenu();
}

document.getElementById("hamburgerBtn").addEventListener("click", () => {
  document.getElementById("sideMenu").classList.toggle("open");
  document.getElementById("sideMenuOverlay").classList.toggle("open");
});

document.getElementById("sideMenuOverlay").addEventListener("click", closeSideMenu);

document.querySelectorAll(".side-menu-item").forEach((btn) => {
  btn.addEventListener("click", () => switchMode(btn.dataset.mode));
});

document.getElementById("searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const q = e.target.value.trim();
    if (!q) return;
    if (currentMode === "manga") MangaApp.renderSearch(q);
    else AnimeApp.renderSearch(q);
  }
});

// Init
renderBottomNav();
MangaApp.renderHome();
