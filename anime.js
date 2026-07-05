const AnimeApp = (function () {
  const app = document.getElementById("app");

  let state = {
    page: "home",
    detailSlug: "",
    detailData: null,
  };

  function setActiveNav(page) {
    if (window.setBottomNavActive) window.setBottomNavActive(page);
  }

  function loadingBlock(text) {
    return `<div class="loading"><div class="spinner"></div>${text || "Memuat..."}</div>`;
  }

  function emptyBlock(text) {
    return `<div class="empty-state">${text}</div>`;
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || json.status === "error") {
      throw new Error(json.message || "Gagal mengambil data (" + res.status + ")");
    }
    return json;
  }

  function cardHTML(item) {
    const safeTitle = item.title || "Tanpa Judul";
    return `
      <div class="card" data-slug="${encodeURIComponent(item.slug)}">
        <div class="card-thumb">
          <img src="${item.poster}" alt="${safeTitle}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=No+Image'" />
          <span class="card-chapter">${item.episode || ""}</span>
        </div>
        <div class="card-body">
          <div class="card-title">${safeTitle}</div>
          <div class="card-type">${item.type || ""} ${item.status_or_day ? "• " + item.status_or_day : ""}</div>
        </div>
      </div>
    `;
  }

  function attachCardListeners() {
    document.querySelectorAll(".card[data-slug]").forEach((card) => {
      card.addEventListener("click", () => {
        const slug = decodeURIComponent(card.dataset.slug);
        goToDetail(slug);
      });
    });
  }

  async function renderHome() {
    state.page = "home";
    setActiveNav("home");
    app.innerHTML = `
      <div class="section-title"><span class="st-bar"></span>Ongoing</div>
      <div id="ongoingGrid">${loadingBlock()}</div>
      <div class="section-title"><span class="st-bar"></span>Baru Ditambahkan</div>
      <div id="recentGrid"></div>
    `;

    try {
      const json = await fetchJSON(ANIME_ENDPOINTS.home());
      const ongoing = json.ongoing || [];
      const recent = json.recent || [];

      const ongoingGrid = document.getElementById("ongoingGrid");
      ongoingGrid.className = "grid";
      ongoingGrid.innerHTML = ongoing.length ? ongoing.map(cardHTML).join("") : emptyBlock("Tidak ada data.");

      const recentGrid = document.getElementById("recentGrid");
      recentGrid.className = "grid";
      recentGrid.innerHTML = recent.length ? recent.map(cardHTML).join("") : emptyBlock("Tidak ada data.");

      attachCardListeners();
    } catch (err) {
      app.innerHTML = emptyBlock("Gagal memuat data: " + err.message);
    }
  }

  async function renderSearch(query) {
    state.page = "search";
    setActiveNav("");
    app.innerHTML = `
      <div class="back-btn" id="backHome">&larr; Kembali</div>
      <div class="section-title"><span class="st-bar"></span>Hasil: "${query}"</div>
      <div id="searchGrid">${loadingBlock()}</div>
    `;
    document.getElementById("backHome").addEventListener("click", () => renderHome());

    try {
      const json = await fetchJSON(ANIME_ENDPOINTS.search(query));
      const data = json.animes || [];

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

  async function goToDetail(slug) {
    state.page = "detail";
    state.detailSlug = slug;
    setActiveNav("");

    app.innerHTML = `<div class="back-btn" id="backBtn">&larr; Kembali</div>${loadingBlock("Memuat detail anime...")}`;
    document.getElementById("backBtn").addEventListener("click", () => renderHome());

    try {
      const json = await fetchJSON(ANIME_ENDPOINTS.detail(slug));
      const d = json.detail;
      state.detailData = d;

      const genres = d.genres || [];

      app.innerHTML = `
        <div class="back-btn" id="backBtn">&larr; Kembali</div>
        <div class="detail-hero">
          <img src="${d.poster}" alt="${d.title}" />
          <div class="detail-info">
            <h1>${d.title}</h1>
            <div class="detail-stats">
              <div class="stat">Status: <b>${d.status || "-"}</b></div>
              <div class="stat">Tipe: <b>${d.type || "-"}</b></div>
              <div class="stat">Studio: <b>${d.studio || "-"}</b></div>
            </div>
            ${
              genres.length
                ? `<div class="genre-tags">${genres.map((g) => `<span class="genre-tag">${g.name}</span>`).join("")}</div>`
                : ""
            }
            <p class="synopsis">${d.synopsis || "Tidak ada sinopsis."}</p>
          </div>
        </div>
        <div class="section-title"><span class="st-bar"></span>Daftar Episode</div>
        <div class="chapter-list" id="episodeList">
          ${
            (d.episodes || [])
              .map(
                (ep) => `
            <div class="chapter-item" data-slug="${encodeURIComponent(ep.slug)}">
              <span class="cname">${ep.name}</span>
            </div>`
              )
              .join("")
          }
        </div>
      `;

      document.getElementById("backBtn").addEventListener("click", () => renderHome());
      document.querySelectorAll(".chapter-item").forEach((item) => {
        item.addEventListener("click", () => {
          const slug = decodeURIComponent(item.dataset.slug);
          const name = item.querySelector(".cname").textContent;
          openPlayer(slug, name);
        });
      });
    } catch (err) {
      app.innerHTML = `<div class="back-btn" id="backBtn">&larr; Kembali</div>${emptyBlock("Gagal memuat detail: " + err.message)}`;
      document.getElementById("backBtn").addEventListener("click", () => renderHome());
    }
  }

  function getEpisodeNeighbors(slug) {
    const episodes = state.detailData?.episodes || [];
    const idx = episodes.findIndex((e) => e.slug === slug);
    if (idx === -1) return { prev: null, next: null };
    return {
      prev: idx < episodes.length - 1 ? episodes[idx + 1] : null,
      next: idx > 0 ? episodes[idx - 1] : null,
    };
  }

  async function openPlayer(slug, episodeName) {
    state.page = "player";
    setActiveNav("");
    app.innerHTML = `<div class="back-btn" id="backBtn">&larr; Kembali ke daftar episode</div>${loadingBlock("Memuat link streaming...")}`;
    document.getElementById("backBtn").addEventListener("click", () => goToDetail(state.detailSlug));

    try {
      const json = await fetchJSON(ANIME_ENDPOINTS.episode(slug));
      const streams = json.streams || [];

      if (!streams.length) {
        app.innerHTML = `<div class="back-btn" id="backBtn">&larr; Kembali</div>${emptyBlock("Tidak ada link streaming tersedia.")}`;
        document.getElementById("backBtn").addEventListener("click", () => goToDetail(state.detailSlug));
        return;
      }

      const { prev, next } = getEpisodeNeighbors(slug);

      app.innerHTML = `
        <div class="back-btn" id="backBtn">&larr; Kembali ke daftar episode</div>
        <div class="reader-header"><h2>${json.title || episodeName}</h2></div>
        <div class="server-select">
          <label for="serverPicker">Pilih server:</label>
          <select id="serverPicker">
            ${streams.map((s, i) => `<option value="${i}">${s.name}</option>`).join("")}
          </select>
        </div>
        <div class="video-wrap">
          <iframe id="playerFrame" src="${streams[0].url}" allowfullscreen frameborder="0"></iframe>
        </div>
        <div class="chapter-nav">
          <button class="prevChapterBtn" ${!prev ? "disabled" : ""}>&larr; Sebelumnya</button>
          <button class="backToListBtn">Daftar Episode</button>
          <button class="nextChapterBtn" ${!next ? "disabled" : ""}>Selanjutnya &rarr;</button>
        </div>
      `;

      document.getElementById("serverPicker").addEventListener("change", (e) => {
        document.getElementById("playerFrame").src = streams[e.target.value].url;
      });
      document.querySelectorAll("#backBtn, .backToListBtn").forEach((el) =>
        el.addEventListener("click", () => goToDetail(state.detailSlug))
      );
      document.querySelectorAll(".prevChapterBtn").forEach((el) =>
        el.addEventListener("click", () => { if (prev) openPlayer(prev.slug, prev.name); })
      );
      document.querySelectorAll(".nextChapterBtn").forEach((el) =>
        el.addEventListener("click", () => { if (next) openPlayer(next.slug, next.name); })
      );

      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (err) {
      app.innerHTML = `<div class="back-btn" id="backBtn">&larr; Kembali</div>${emptyBlock("Gagal memuat episode: " + err.message)}`;
      document.getElementById("backBtn").addEventListener("click", () => goToDetail(state.detailSlug));
    }
  }

  return { renderHome, renderSearch };
})();
