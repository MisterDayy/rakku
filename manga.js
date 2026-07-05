const MangaApp = (function () {
  const app = document.getElementById("app");
  const JIKAN_BASE = "https://api.jikan.moe/v4";

  let state = {
    page: "home",
    homeData: [],
    searchQuery: "",
    activeGenre: "",
    activeGenreId: null,
    genrePage: 1,
    genreHasMore: false,
    genreResults: [],
    genreMap: [],
    detailUrl: "",
    detailData: null,
    readerUrl: "",
    readerImages: [],
    readerChapterName: "",
  };

  let carouselInterval = null;
  function clearCarouselInterval() {
    if (carouselInterval) clearInterval(carouselInterval);
    carouselInterval = null;
  }

  const HISTORY_KEY = "rakku_history";

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch { return []; }
  }

  function pushHistory(entry) {
    let hist = getHistory().filter((h) => h.detailUrl !== entry.detailUrl);
    hist.unshift(entry);
    hist = hist.slice(0, 40);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
  }

  function setActiveNav(page) {
    if (window.setBottomNavActive) window.setBottomNavActive(page);
  }

  function loadingBlock(text) {
    return `<div class="loading"><div class="spinner"></div>${text || "Memuat..."}</div>`;
  }

  function emptyBlock(text) {
    return `<div class="empty-state">${text}</div>`;
  }

  function normalizeGenre(g) {
    return (g || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function cardHTML(item) {
    const safeTitle = item.title || "Tanpa Judul";
    return `
      <div class="card" data-href="${encodeURIComponent(item.href)}">
        <div class="card-thumb">
          <img src="${item.thumb}" alt="${safeTitle}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'" />
          <span class="card-chapter">${item.lastChapter || ""}</span>
        </div>
        <div class="card-body">
          <div class="card-title">${safeTitle}</div>
          <div class="card-type">${item.type || ""}</div>
        </div>
      </div>
    `;
  }

  function attachCardListeners() {
    document.querySelectorAll(".card[data-href]").forEach((card) => {
      card.addEventListener("click", () => {
        const href = decodeURIComponent(card.dataset.href);
        goToDetail(href);
      });
    });
  }

  function carouselSlideHTML(item) {
    const safeTitle = item.title || "Tanpa Judul";
    return `
      <div class="carousel-slide" data-href="${encodeURIComponent(item.href)}">
        <img src="${item.thumb}" alt="${safeTitle}" onerror="this.src='https://via.placeholder.com/800x450?text=No+Image'" />
        <div class="carousel-overlay">
          <div class="carousel-info">
            ${item.type ? `<span class="carousel-badge">${item.type}</span>` : ""}
            <h2>${safeTitle}</h2>
            <p>${item.lastChapter || ""}</p>
          </div>
        </div>
      </div>
    `;
  }

  function initCarousel(items) {
    clearCarouselInterval();
    if (!items.length) return;

    let idx = 0;
    const track = document.getElementById("carouselTrack");
    const dotsWrap = document.getElementById("carouselDots");
    const carouselEl = document.getElementById("mangaCarousel");
    if (!track || !dotsWrap || !carouselEl) return;

    dotsWrap.innerHTML = items
      .map((_, i) => `<button class="carousel-dot ${i === 0 ? "active" : ""}" data-i="${i}"></button>`)
      .join("");

    function goTo(i) {
      idx = (i + items.length) % items.length;
      track.style.transform = `translateX(-${idx * 100}%)`;
      dotsWrap.querySelectorAll(".carousel-dot").forEach((d, di) => d.classList.toggle("active", di === idx));
    }

    document.getElementById("carouselPrev")?.addEventListener("click", () => { goTo(idx - 1); restartAutoplay(); });
    document.getElementById("carouselNext")?.addEventListener("click", () => { goTo(idx + 1); restartAutoplay(); });
    dotsWrap.querySelectorAll(".carousel-dot").forEach((dot) => {
      dot.addEventListener("click", () => { goTo(Number(dot.dataset.i)); restartAutoplay(); });
    });

    document.querySelectorAll(".carousel-slide").forEach((slide) => {
      slide.addEventListener("click", () => {
        const href = decodeURIComponent(slide.dataset.href);
        goToDetail(href);
      });
    });

    let startX = 0;
    carouselEl.addEventListener(
      "touchstart",
      (e) => { startX = e.touches[0].clientX; },
      { passive: true }
    );
    carouselEl.addEventListener(
      "touchend",
      (e) => {
        const diff = e.changedTouches[0].clientX - startX;
        if (diff > 40) { goTo(idx - 1); restartAutoplay(); }
        else if (diff < -40) { goTo(idx + 1); restartAutoplay(); }
      },
      { passive: true }
    );

    function restartAutoplay() {
      clearCarouselInterval();
      if (items.length > 1) {
        carouselInterval = setInterval(() => goTo(idx + 1), 4000);
      }
    }

    restartAutoplay();
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Gagal mengambil data (" + res.status + ")");
    return res.json();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchJikan(url) {
    const res = await fetch(url);
    if (res.status === 429) {
      await sleep(1200);
      return fetchJikan(url);
    }
    if (!res.ok) throw new Error("Gagal mengambil data MyAnimeList (" + res.status + ")");
    return res.json();
  }

  async function renderHome() {
    state.page = "home";
    setActiveNav("home");
    app.innerHTML = `<div id="carouselWrap">${loadingBlock("Memuat highlight...")}</div><div class="section-title"><span class="st-bar"></span>Update Terbaru</div><div id="homeGrid">${loadingBlock()}</div>`;

    try {
      const json = await fetchJSON(ENDPOINTS.home);
      const data = json.data || [];
      state.homeData = data;

      const carouselWrap = document.getElementById("carouselWrap");
      const featured = data.slice(0, 5);
      if (featured.length) {
        carouselWrap.innerHTML = `
          <div class="carousel" id="mangaCarousel">
            <div class="carousel-track" id="carouselTrack">${featured.map(carouselSlideHTML).join("")}</div>
            <button class="carousel-arrow carousel-prev" id="carouselPrev" aria-label="Sebelumnya">&lsaquo;</button>
            <button class="carousel-arrow carousel-next" id="carouselNext" aria-label="Selanjutnya">&rsaquo;</button>
            <div class="carousel-dots" id="carouselDots"></div>
          </div>
        `;
        initCarousel(featured);
      } else {
        carouselWrap.innerHTML = "";
      }

      const grid = document.getElementById("homeGrid");
      if (!data.length) {
        grid.innerHTML = emptyBlock("Tidak ada data manga.");
        return;
      }
      grid.className = "grid";
      grid.innerHTML = data.map(cardHTML).join("");
      attachCardListeners();
    } catch (err) {
      document.getElementById("homeGrid").innerHTML = emptyBlock("Gagal memuat data: " + err.message);
    }
  }

  async function renderGenre() {
    clearCarouselInterval();
    state.page = "genre";
    setActiveNav("genre");

    app.innerHTML = `
      <div class="section-title"><span class="st-bar"></span>Jelajahi Genre</div>
      <div id="genreBar">${loadingBlock("Memuat daftar genre...")}</div>
      <div id="genreGrid"></div>
    `;

    try {
      if (!state.genreMap.length) {
        const json = await fetchJikan(`${JIKAN_BASE}/genres/manga`);
        state.genreMap = (json.data || [])
          .filter((g) => g.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 40);
      }

      const bar = document.getElementById("genreBar");
      bar.className = "genre-bar";
      bar.innerHTML = state.genreMap
        .map((g) => `<div class="genre-chip" data-id="${g.mal_id}" data-name="${g.name}">${g.name}</div>`)
        .join("");

      document.getElementById("genreGrid").innerHTML = emptyBlock("Pilih salah satu genre di atas untuk melihat manga.");

      document.querySelectorAll(".genre-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          document.querySelectorAll(".genre-chip").forEach((c) => c.classList.remove("active"));
          chip.classList.add("active");
          loadGenreResults(Number(chip.dataset.id), chip.dataset.name);
        });
      });
    } catch (err) {
      document.getElementById("genreBar").innerHTML = emptyBlock("Gagal memuat daftar genre: " + err.message);
    }
  }

  function malCardHTML(m) {
    const title = m.title || "Tanpa Judul";
    const img = m.images?.jpg?.image_url || m.images?.webp?.image_url || "";
    const type = m.type || "";
    const status = m.status || "";
    return `
      <div class="card" data-mal-title="${encodeURIComponent(title)}">
        <div class="card-thumb">
          <img src="${img}" alt="${title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'" />
          <span class="card-chapter">${status}</span>
        </div>
        <div class="card-body">
          <div class="card-title">${title}</div>
          <div class="card-type">${type}</div>
        </div>
      </div>
    `;
  }

  function attachMalCardListeners() {
    document.querySelectorAll(".card[data-mal-title]").forEach((card) => {
      card.addEventListener("click", () => {
        const title = decodeURIComponent(card.dataset.malTitle);
        resolveMalTitleToDetail(title, card);
      });
    });
  }

  async function resolveMalTitleToDetail(title, cardEl) {
    const original = cardEl.innerHTML;
    cardEl.innerHTML = `<div class="loading" style="padding:30px 10px;"><div class="spinner"></div>Mencari di server baca...</div>`;

    try {
      const json = await fetchJSON(ENDPOINTS.search(title));
      const results = json.data || [];

      if (!results.length) {
        cardEl.innerHTML = `<div class="empty-state" style="padding:20px 10px; font-size:12.5px;">Manga ini belum tersedia di server baca.</div>`;
        setTimeout(() => { cardEl.innerHTML = original; attachMalCardListeners(); }, 2500);
        return;
      }

      const bestMatch =
        results.find((r) => normalizeGenre(r.title) === normalizeGenre(title)) || results[0];

      goToDetail(bestMatch.href);
    } catch (err) {
      cardEl.innerHTML = `<div class="empty-state" style="padding:20px 10px; font-size:12.5px;">Gagal mencari: ${err.message}</div>`;
      setTimeout(() => { cardEl.innerHTML = original; attachMalCardListeners(); }, 2500);
    }
  }

  async function loadGenreResults(genreId, genreName, append) {
    state.activeGenre = genreName;
    state.activeGenreId = genreId;
    if (!append) {
      state.genrePage = 1;
      state.genreResults = [];
    }

    const grid = document.getElementById("genreGrid");
    if (!append) {
      grid.innerHTML = loadingBlock("Memuat manga genre " + genreName + "...");
    }

    try {
      const json = await fetchJikan(
        `${JIKAN_BASE}/manga?genres=${genreId}&order_by=popularity&sort=asc&page=${state.genrePage}&limit=20`
      );
      const data = json.data || [];
      state.genreHasMore = !!json.pagination?.has_next_page;

      state.genreResults = append ? state.genreResults.concat(data) : data;

      if (!state.genreResults.length) {
        grid.innerHTML = emptyBlock("Tidak ditemukan manga untuk genre " + genreName + ".");
        return;
      }

      grid.className = "grid";
      grid.innerHTML = state.genreResults.map(malCardHTML).join("");
      attachMalCardListeners();

      const loadMoreWrap = document.createElement("div");
      loadMoreWrap.style.gridColumn = "1 / -1";
      loadMoreWrap.style.textAlign = "center";
      loadMoreWrap.style.marginTop = "14px";
      if (state.genreHasMore) {
        loadMoreWrap.innerHTML = `<button class="load-more-btn">Muat Lebih Banyak</button>`;
        grid.appendChild(loadMoreWrap);
        loadMoreWrap.querySelector("button").addEventListener("click", async (e) => {
          e.target.disabled = true;
          e.target.textContent = "Memuat...";
          state.genrePage++;
          await loadGenreResults(genreId, genreName, true);
        });
      } else {
        loadMoreWrap.innerHTML = `<span style="color:var(--paper-dim); font-size:12.5px;">Semua manga genre ${genreName} sudah ditampilkan.</span>`;
        grid.appendChild(loadMoreWrap);
      }
    } catch (err) {
      grid.innerHTML = emptyBlock("Gagal memuat data dari MyAnimeList: " + err.message);
    }
  }

  function renderRiwayat() {
    clearCarouselInterval();
    state.page = "riwayat";
    setActiveNav("riwayat");

    const hist = getHistory();
    app.innerHTML = `<div class="section-title"><span class="st-bar"></span>Riwayat Baca</div><div id="histGrid"></div>`;
    const grid = document.getElementById("histGrid");

    if (!hist.length) {
      grid.innerHTML = emptyBlock("Belum ada riwayat baca.");
      return;
    }

    grid.className = "hist-list";
    grid.innerHTML = hist
      .map(
        (h) => `
      <div class="hist-item" data-href="${encodeURIComponent(h.detailUrl)}" data-chapter-url="${encodeURIComponent(h.chapterUrl || "")}" data-chapter-name="${encodeURIComponent(h.chapterName || "")}">
        <img src="${h.thumb || ""}" alt="${h.title}" onerror="this.src='https://via.placeholder.com/80x110?text=No+Image'" />
        <div class="hist-info">
          <div class="hist-title">${h.title}</div>
          <div class="hist-chapter">Terakhir dibaca: ${h.chapterName}</div>
        </div>
      </div>`
      )
      .join("");

    document.querySelectorAll(".hist-item[data-href]").forEach((item) => {
      item.addEventListener("click", () => {
        const detailUrl = decodeURIComponent(item.dataset.href);
        const chapterUrl = item.dataset.chapterUrl ? decodeURIComponent(item.dataset.chapterUrl) : "";
        const chapterName = item.dataset.chapterName ? decodeURIComponent(item.dataset.chapterName) : "";
        if (chapterUrl) {
          continueReading(detailUrl, chapterUrl, chapterName);
        } else {
          goToDetail(detailUrl);
        }
      });
    });
  }

  async function continueReading(detailUrl, chapterUrl, chapterName) {
    clearCarouselInterval();
    state.page = "detail";
    state.detailUrl = detailUrl;
    setActiveNav("");
    app.innerHTML = loadingBlock("Membuka chapter terakhir...");

    try {
      const json = await fetchJSON(ENDPOINTS.info(detailUrl));
      state.detailData = json.data;
      openReader(chapterUrl, chapterName);
    } catch (err) {
      app.innerHTML = emptyBlock("Gagal memuat manga: " + err.message);
    }
  }

  async function renderSearch(query) {
    clearCarouselInterval();
    state.page = "search";
    state.searchQuery = query;
    setActiveNav("");

    app.innerHTML = `
      <div class="back-btn" id="backHome">&larr; Kembali</div>
      <div class="section-title"><span class="st-bar"></span>Hasil: "${query}"</div>
      <div id="searchGrid">${loadingBlock()}</div>
    `;
    document.getElementById("backHome").addEventListener("click", () => renderHome());

    try {
      const json = await fetchJSON(ENDPOINTS.search(query));
      const data = json.data || [];

      const grid = document.getElementById("searchGrid");
      if (!data.length) {
        grid.innerHTML = emptyBlock("Tidak ditemukan hasil untuk pencarian ini.");
        return;
      }
      grid.className = "grid";
      grid.innerHTML = data.map(cardHTML).join("");
      attachCardListeners();
    } catch (err) {
      document.getElementById("searchGrid").innerHTML = emptyBlock("Gagal memuat data: " + err.message);
    }
  }

  async function goToDetail(href) {
    clearCarouselInterval();
    state.page = "detail";
    state.detailUrl = href;
    setActiveNav("");

    app.innerHTML = `<div class="back-btn" id="backBtn">&larr; Kembali</div>${loadingBlock("Memuat detail manga...")}`;
    document.getElementById("backBtn").addEventListener("click", () => renderHome());

    try {
      const json = await fetchJSON(ENDPOINTS.info(href));
      const d = json.data;
      state.detailData = d;

      const genres = d.genre || d.genres || [];

      app.innerHTML = `
        <div class="back-btn" id="backBtn">&larr; Kembali</div>
        <div class="detail-hero">
          <img src="${d.thumb}" alt="${d.title}" />
          <div class="detail-info">
            <h1>${d.title}</h1>
            <div class="detail-stats">
              <div class="stat">Chapter: <b>${d.totalChapters ?? d.chapters?.length ?? "-"}</b></div>
              ${d.status ? `<div class="stat">Status: <b>${d.status}</b></div>` : ""}
            </div>
            ${
              genres.length
                ? `<div class="genre-tags">${genres.map((g) => `<span class="genre-tag">${g}</span>`).join("")}</div>`
                : ""
            }
            <p class="synopsis">${d.synopsis || "Tidak ada sinopsis."}</p>
          </div>
        </div>
        <div class="section-title"><span class="st-bar"></span>Daftar Chapter</div>
        <div class="chapter-list" id="chapterList">
          ${
            (d.chapters || [])
              .map(
                (ch) => `
            <div class="chapter-item" data-href="${encodeURIComponent(ch.link)}" data-name="${encodeURIComponent(ch.name)}">
              <span class="cname">${ch.name}</span>
              <span class="cdate">${ch.date || ""}</span>
            </div>`
              )
              .join("")
          }
        </div>
      `;

      document.getElementById("backBtn").addEventListener("click", () => renderHome());
      document.querySelectorAll(".chapter-item").forEach((item) => {
        item.addEventListener("click", () => {
          const link = decodeURIComponent(item.dataset.href);
          const name = decodeURIComponent(item.dataset.name);
          openReader(link, name);
        });
      });
    } catch (err) {
      app.innerHTML = `<div class="back-btn" id="backBtn">&larr; Kembali</div>${emptyBlock("Gagal memuat detail: " + err.message)}`;
      document.getElementById("backBtn").addEventListener("click", () => renderHome());
    }
  }

  function getChapterNeighbors(chapterUrl) {
    const chapters = state.detailData?.chapters || [];
    const idx = chapters.findIndex((c) => c.link === chapterUrl);
    if (idx === -1) return { prev: null, next: null };
    return {
      prev: idx < chapters.length - 1 ? chapters[idx + 1] : null,
      next: idx > 0 ? chapters[idx - 1] : null,
    };
  }

  async function openReader(chapterUrl, chapterName) {
    state.page = "reader";
    state.readerUrl = chapterUrl;
    state.readerChapterName = chapterName;
    setActiveNav("");

    app.innerHTML = `<div class="back-btn" id="backBtn">&larr; Kembali ke daftar chapter</div>${loadingBlock("Memuat halaman chapter...")}`;
    document.getElementById("backBtn").addEventListener("click", () => goToDetail(state.detailUrl));

    try {
      const json = await fetchJSON(ENDPOINTS.download(chapterUrl));
      const images = json.images || [];
      state.readerImages = images;

      const d = state.detailData;
      if (d) {
        pushHistory({
          detailUrl: state.detailUrl,
          chapterUrl,
          title: d.title,
          thumb: d.thumb,
          chapterName,
        });
      }

      const { prev, next } = getChapterNeighbors(chapterUrl);

      const navButtonsHTML = `
        <div class="chapter-nav">
          <button class="prevChapterBtn" ${!prev ? "disabled" : ""}>&larr; Sebelumnya</button>
          <button class="backToListBtn">Daftar Chapter</button>
          <button class="nextChapterBtn" ${!next ? "disabled" : ""}>Selanjutnya &rarr;</button>
        </div>
      `;

      app.innerHTML = `
        <div class="back-btn" id="backBtn">&larr; Kembali ke daftar chapter</div>
        <div class="reader-header">
          <h2>${chapterName}</h2>
        </div>
        ${navButtonsHTML}
        <div class="reader-images">
          ${images.map((src) => `<img src="${src}" loading="lazy" alt="page" />`).join("")}
        </div>
        ${navButtonsHTML}
      `;

      document.querySelectorAll("#backBtn, .backToListBtn").forEach((el) =>
        el.addEventListener("click", () => goToDetail(state.detailUrl))
      );
      document.querySelectorAll(".prevChapterBtn").forEach((el) =>
        el.addEventListener("click", () => {
          if (prev) openReader(prev.link, prev.name);
        })
      );
      document.querySelectorAll(".nextChapterBtn").forEach((el) =>
        el.addEventListener("click", () => {
          if (next) openReader(next.link, next.name);
        })
      );

      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (err) {
      app.innerHTML = `<div class="back-btn" id="backBtn">&larr; Kembali</div>${emptyBlock("Gagal memuat chapter: " + err.message)}`;
      document.getElementById("backBtn").addEventListener("click", () => goToDetail(state.detailUrl));
    }
  }

  return { renderHome, renderGenre, renderRiwayat, renderSearch, stopCarousel: clearCarouselInterval };
})();
