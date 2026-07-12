let currentMode = "manga";

const ICONS = {
  home: `<svg viewBox="0 0 24 24" width="21" height="21"><path fill="currentColor" d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3z"/></svg>`,
  genre: `<svg viewBox="0 0 24 24" width="21" height="21"><path fill="currentColor" d="M3 5h11v2H3zm0 6h11v2H3zm0 6h7v2H3zM17 3l4 4-1.4 1.4L18 6.8V19a1 1 0 0 1-1 1h-1v-2h1V6.8l-1.6 1.6L14 7z"/></svg>`,
  riwayat: `<svg viewBox="0 0 24 24" width="21" height="21"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m1 10.59V6h-2v8l6 3.6 1-1.6z"/></svg>`,
  profil: `<svg viewBox="0 0 24 24" width="21" height="21"><path fill="currentColor" d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5m0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5"/></svg>`,
};

const BOTTOM_NAV_CONFIG = {
  manga: [
    { page: "home", label: "Beranda", icon: ICONS.home, action: () => MangaApp.renderHome() },
    { page: "genre", label: "Genre", icon: ICONS.genre, action: () => MangaApp.renderGenre() },
    { page: "riwayat", label: "Riwayat", icon: ICONS.riwayat, action: () => requireAuth(() => MangaApp.renderRiwayat()) },
    { page: "profile", label: "Profil", icon: ICONS.profil, action: () => requireAuth(() => renderProfile()) },
  ],
  anime: [
    { page: "home", label: "Beranda", icon: ICONS.home, action: () => AnimeApp.renderHome() },
    { page: "genre", label: "Genre", icon: ICONS.genre, action: () => AnimeApp.renderGenre() },
    { page: "riwayat", label: "Riwayat", icon: ICONS.riwayat, action: () => requireAuth(() => AnimeApp.renderRiwayat()) },
    { page: "profile", label: "Profil", icon: ICONS.profil, action: () => requireAuth(() => renderProfile()) },
  ],
};

let pendingAction = null;

async function requireAuth(action) {
  if (!AuthApp.isReady()) {
    document.getElementById("app").innerHTML = `<div class="loading"><div class="spinner"></div>Memeriksa sesi...</div>`;
    await AuthApp.waitUntilReady();
  }
  const user = AuthApp.getCachedUser();
  if (user) {
    action();
    return;
  }
  pendingAction = action;
  AuthApp.renderLogin();
}
window.requireAuth = requireAuth;

window.onAuthSuccess = function () {
  const action = pendingAction;
  pendingAction = null;
  if (action) action();
  else renderProfile();
};

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".side-menu-item").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  document.getElementById("searchInput").placeholder = mode === "manga" ? "Cari judul manga..." : "Cari judul anime...";
  document.getElementById("searchInput").value = "";
  document.getElementById("searchBox").classList.remove("expanded");
  if (mode === "anime") MangaApp.stopCarousel();
  else { AnimeApp.stopCarousel(); AnimeApp.stopExpTimer(); }
  renderBottomNav();
}

window.openContentDetail = function (type, refId) {
  if (type !== currentMode) setMode(type);
  if (type === "manga") MangaApp.goToDetail(refId);
  else AnimeApp.goToDetail(refId);
};

async function renderProfile() {
  MangaApp.stopCarousel();
  AnimeApp.stopCarousel();
  AnimeApp.stopExpTimer();
  if (window.setBottomNavActive) window.setBottomNavActive("profile");

  const app = document.getElementById("app");
  const user = AuthApp.getCachedUser();

  if (!user) {
    AuthApp.renderLogin();
    return;
  }

  app.innerHTML = `<div class="loading"><div class="spinner"></div>Memuat profil...</div>`;

  const [{ data: profileRow }, mangaCount, animeCount] = await Promise.all([
    supabaseClient.from("profiles").select("*").eq("id", user.id).single(),
    MangaApp.getHistoryCount(),
    AnimeApp.getHistoryCount(),
  ]);

  const username = profileRow?.username || user.email.split("@")[0];
  const level = profileRow?.level ?? 1;
  const exp = profileRow?.exp ?? 0;
  const hasUnlimited = profileRow?.has_unlimited || false;
  const expNeeded = level * 100;
  const expPct = Math.min(100, Math.round((exp / expNeeded) * 100));

  app.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar"><img src="assets/logo.jpg" alt="Rakku" /></div>
      <div>
        <div class="profile-name">${escapeHtml(username)}${hasUnlimited ? ` <span class="unlimited-icon" title="Unlimited">&#8734;</span>` : ""}</div>
        <div class="profile-sub">${user.email}</div>
      </div>
    </div>

    <div class="level-card">
      <div class="level-row"><span>Level ${level}</span><span>${exp} / ${expNeeded} EXP</span></div>
      <div class="exp-bar-wrap"><div class="exp-bar-fill" style="width:${expPct}%"></div></div>
    </div>

    <div class="section-title"><span class="st-bar"></span>Statistik</div>
    <div class="profile-stats">
      <div class="stat">Riwayat Manga: <b>${mangaCount}</b></div>
      <div class="stat">Riwayat Anime: <b>${animeCount}</b></div>
    </div>

    <div class="section-title"><span class="st-bar"></span>Pengaturan</div>
    <div class="profile-menu">
      <button class="profile-menu-item" id="viewBookmarks">Bookmark Saya</button>
      <button class="profile-menu-item" id="clearMangaHist">Hapus Riwayat Baca Manga</button>
      <button class="profile-menu-item" id="clearAnimeHist">Hapus Riwayat Tonton Anime</button>
      ${AuthApp.isStaff() ? `<button class="profile-menu-item admin" id="goAdminPanel">Panel Admin</button>` : ""}
      <button class="profile-menu-item wa-group" id="joinWaGroup">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.001 2c-5.514 0-9.988 4.475-9.988 9.99 0 1.76.462 3.484 1.34 5.003L2 22l5.126-1.342a9.958 9.958 0 0 0 4.875 1.242h.004c5.514 0 9.988-4.475 9.988-9.99 0-2.669-1.038-5.176-2.925-7.062A9.935 9.935 0 0 0 12.001 2zm0 18.184h-.003a8.19 8.19 0 0 1-4.176-1.14l-.3-.178-3.043.797.813-2.968-.196-.305a8.194 8.194 0 0 1-1.257-4.4c0-4.535 3.69-8.223 8.226-8.223 2.197 0 4.263.857 5.817 2.412a8.166 8.166 0 0 1 2.408 5.816c0 4.535-3.69 8.19-8.29 8.19z"/></svg>
        Gabung Grup WhatsApp
      </button>
      <button class="profile-menu-item danger" id="logoutBtn">Keluar Akun</button>
    </div>

    <div class="section-title"><span class="st-bar"></span>Tentang</div>
    <p class="profile-about">Rakku adalah aplikasi untuk baca manga &amp; nonton anime. Gunakan tombol menu di pojok kiri atas untuk berpindah antara mode Baca Manga dan Nonton Anime.</p>

    <div class="section-title"><span class="st-bar"></span>Developer</div>
    <div class="developer-list">
      <span class="developer-chip">Clara</span>
      <span class="developer-chip">Man</span>
      <span class="developer-chip">Ilmi</span>
    </div>
  `;

  const joinWaGroup = document.getElementById("joinWaGroup");
  if (joinWaGroup) {
    joinWaGroup.addEventListener("click", () => {
      window.open("https://chat.whatsapp.com/HfvJMI5PlazEFjyWgaIyFR", "_blank");
    });
  }

  document.getElementById("viewBookmarks").addEventListener("click", () => renderBookmarkList());

  const goAdminPanel = document.getElementById("goAdminPanel");
  if (goAdminPanel) goAdminPanel.addEventListener("click", () => AdminApp.renderAdminPanel());

  document.getElementById("clearMangaHist").addEventListener("click", async () => {
    if (confirm("Hapus semua riwayat baca manga?")) {
      await MangaApp.clearHistory();
      renderProfile();
    }
  });
  document.getElementById("clearAnimeHist").addEventListener("click", async () => {
    if (confirm("Hapus semua riwayat tonton anime?")) {
      await AnimeApp.clearHistory();
      renderProfile();
    }
  });
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    if (!confirm("Yakin mau keluar akun?")) return;
    await AuthApp.logout();
    if (currentMode === "manga") MangaApp.renderHome();
    else AnimeApp.renderHome();
  });
}

window.renderProfile = renderProfile;

async function renderBookmarkList() {
  if (window.setBottomNavActive) window.setBottomNavActive("");
  const app = document.getElementById("app");
  const user = AuthApp.getCachedUser();
  if (!user) {
    AuthApp.renderLogin();
    return;
  }

  app.innerHTML = `<div class="back-btn" id="bmBack">&larr; Kembali ke Profil</div><div class="section-title"><span class="st-bar"></span>Bookmark Saya</div><div id="bmGrid"><div class="loading"><div class="spinner"></div>Memuat bookmark...</div></div>`;
  document.getElementById("bmBack").addEventListener("click", () => renderProfile());

  const { data, error } = await supabaseClient
    .from("bookmarks")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const grid = document.getElementById("bmGrid");

  if (error) {
    grid.innerHTML = `<div class="empty-state">Gagal memuat bookmark: ${error.message}</div>`;
    return;
  }

  if (!data.length) {
    grid.innerHTML = `<div class="empty-state">Belum ada bookmark. Buka detail manga/anime lalu tekan tombol Simpan.</div>`;
    return;
  }

  grid.className = "hist-list";
  grid.innerHTML = data
    .map(
      (b) => `
    <div class="hist-item" data-type="${b.content_type}" data-ref="${encodeURIComponent(b.ref_id)}">
      <img src="${escapeHtml(b.thumb || "")}" alt="${escapeHtml(b.title)}" onerror="this.src='https://via.placeholder.com/80x110?text=No+Image'" />
      <div class="hist-info">
        <div class="hist-title">${escapeHtml(b.title)}</div>
        <div class="hist-chapter">${b.content_type === "manga" ? "Manga" : "Anime"}</div>
      </div>
      <button class="bm-remove" data-id="${b.id}" title="Hapus bookmark">&times;</button>
    </div>`
    )
    .join("");

  grid.querySelectorAll(".hist-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".bm-remove")) return;
      const type = item.dataset.type;
      const ref = decodeURIComponent(item.dataset.ref);
      window.openContentDetail(type, ref);
    });
  });

  grid.querySelectorAll(".bm-remove").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await supabaseClient.from("bookmarks").delete().eq("id", btn.dataset.id);
      renderBookmarkList();
    });
  });
}

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

function setAnimeSubActive(page) {
  document.querySelectorAll(".side-menu-sub-item").forEach((b) => b.classList.toggle("active", b.dataset.animePage === page));
}

function switchMode(mode) {
  if (mode === currentMode) {
    closeSideMenu();
    return;
  }
  setMode(mode);
  if (mode === "manga") MangaApp.renderHome();
  else AnimeApp.renderHome();
  closeSideMenu();
}

document.getElementById("hamburgerBtn").addEventListener("click", () => {
  document.getElementById("sideMenu").classList.toggle("open");
  document.getElementById("sideMenuOverlay").classList.toggle("open");
});

document.getElementById("sideMenuOverlay").addEventListener("click", closeSideMenu);

document.querySelectorAll(".side-menu-item[data-mode]:not(.side-menu-parent)").forEach((btn) => {
  btn.addEventListener("click", () => switchMode(btn.dataset.mode));
});

document.getElementById("chatMenuBtn").addEventListener("click", () => {
  closeSideMenu();
  requireAuth(() => ChatApp.renderChat());
});

const animeMenuToggle = document.getElementById("animeMenuToggle");
const animeSubMenu = document.getElementById("animeSubMenu");

animeMenuToggle.addEventListener("click", () => {
  animeSubMenu.classList.toggle("open");
  animeMenuToggle.classList.toggle("expanded");
});

document.querySelectorAll(".side-menu-sub-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const page = btn.dataset.animePage;
    if (currentMode !== "anime") setMode("anime");
    document.querySelectorAll(".side-menu-item[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === "anime"));
    setAnimeSubActive(page);

    if (page === "home") AnimeApp.renderHome();
    else if (page === "jelajah") AnimeApp.renderJelajah();
    else if (page === "jadwal") AnimeApp.renderJadwal();

    closeSideMenu();
  });
});

document.getElementById("searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const q = e.target.value.trim();
    if (!q) return;
    if (currentMode === "manga") MangaApp.renderSearch(q);
    else AnimeApp.renderSearch(q);
  }
});

const searchBox = document.getElementById("searchBox");
const searchIconBtn = document.getElementById("searchIconBtn");
const searchInput = document.getElementById("searchInput");

searchIconBtn.addEventListener("click", () => {
  if (!searchBox.classList.contains("expanded")) {
    searchBox.classList.add("expanded");
    searchInput.focus();
    return;
  }
  const q = searchInput.value.trim();
  if (q) {
    if (currentMode === "manga") MangaApp.renderSearch(q);
    else AnimeApp.renderSearch(q);
  } else {
    searchInput.focus();
  }
});

searchInput.addEventListener("blur", () => {
  setTimeout(() => {
    if (!searchInput.value.trim()) {
      searchBox.classList.remove("expanded");
    }
  }, 150);
});

renderBottomNav();
MangaApp.renderHome();
