const AnimeApp = (function () {
  const app = document.getElementById("app");

  let state = {
    page: "home",
    detailSlug: "",
    detailData: null,
    genreList: [],
    activeGenreSlug: "",
    jadwalData: null,
    jadwalDay: "",
  };

  const CONTENT_TYPE = "anime";

  async function getHistory() {
    const user = AuthApp.getCachedUser();
    if (!user) return [];

    const { data, error } = await supabaseClient
      .from("history")
      .select("*")
      .eq("user_id", user.id)
      .eq("content_type", CONTENT_TYPE)
      .order("updated_at", { ascending: false })
      .limit(40);

    if (error) {
      console.error("Gagal ambil riwayat:", error.message);
      return [];
    }

    return data.map((h) => ({
      slug: h.ref_id,
      episodeSlug: h.progress_id,
      episodeName: h.progress_name,
      title: h.title,
      poster: h.thumb,
    }));
  }

  async function pushHistory(entry) {
    const user = AuthApp.getCachedUser();
    if (!user) return;

    const { error } = await supabaseClient.from("history").upsert(
      {
        user_id: user.id,
        content_type: CONTENT_TYPE,
        ref_id: entry.slug,
        title: entry.title,
        thumb: entry.poster,
        progress_id: entry.episodeSlug,
        progress_name: entry.episodeName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,content_type,ref_id" }
    );

    if (error) console.error("Gagal simpan riwayat:", error.message);
  }

  async function clearHistory() {
    const user = AuthApp.getCachedUser();
    if (!user) return;
    await supabaseClient.from("history").delete().eq("user_id", user.id).eq("content_type", CONTENT_TYPE);
  }

  async function getHistoryCount() {
    const user = AuthApp.getCachedUser();
    if (!user) return 0;
    const { count } = await supabaseClient
      .from("history")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("content_type", CONTENT_TYPE);
    return count || 0;
  }

  async function isBookmarked(refId) {
    const user = AuthApp.getCachedUser();
    if (!user) return false;
    const { data } = await supabaseClient
      .from("bookmarks")
      .select("id")
      .eq("user_id", user.id)
      .eq("content_type", CONTENT_TYPE)
      .eq("ref_id", refId)
      .maybeSingle();
    return !!data;
  }

  async function toggleBookmark(refId, title, thumb) {
    const user = AuthApp.getCachedUser();
    if (!user) return false;

    const already = await isBookmarked(refId);
    if (already) {
      await supabaseClient
        .from("bookmarks")
        .delete()
        .eq("user_id", user.id)
        .eq("content_type", CONTENT_TYPE)
        .eq("ref_id", refId);
      return false;
    }

    await supabaseClient.from("bookmarks").insert({
      user_id: user.id,
      content_type: CONTENT_TYPE,
      ref_id: refId,
      title,
      thumb,
    });
    return true;
  }

  // Genre yang tidak ingin ditampilkan/diakses di aplikasi ini.
  const BLOCKED_GENRES = ["ecchi"];

  function isBlockedGenreName(name) {
    const n = (name || "").toLowerCase().trim();
    return BLOCKED_GENRES.includes(n);
  }

  function hasBlockedGenre(genres) {
    return (genres || []).some((g) => isBlockedGenreName(g?.name || g));
  }

  // Beberapa endpoint anime punya bentuk response yang tidak seragam,
  // jadi kita coba beberapa nama field yang umum sebelum fallback ke array pertama yang ketemu.
  function extractArray(json, keys) {
    for (const k of keys) {
      if (Array.isArray(json?.[k])) return json[k];
    }
    if (json && typeof json === "object") {
      for (const k in json) {
        if (Array.isArray(json[k])) return json[k];
      }
    }
    return [];
  }

  let carouselInterval = null;
  function clearCarouselInterval() {
    if (carouselInterval) clearInterval(carouselInterval);
    carouselInterval = null;
  }

  // ===== EXP nonton: per episode dibuka + per menit ditonton =====
  const EXP_PER_EPISODE_OPEN = 10;
  const EXP_PER_MINUTE = 2;
  const EXP_MAX_MINUTES_PER_SESSION = 10;

  let expTimer = null;
  let expMinuteCount = 0;

  function stopExpTimer() {
    if (expTimer) clearInterval(expTimer);
    expTimer = null;
    expMinuteCount = 0;
  }

  function showExpToast(amount) {
    const el = document.createElement("div");
    el.className = "exp-toast";
    el.textContent = `+${amount} EXP`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 1800);
  }

  async function awardExp(eventKey, amount) {
    try {
      const { data, error } = await supabaseClient.rpc("award_exp_once", {
        p_event_key: eventKey,
        p_amount: amount,
      });
      if (error) {
        console.error("Gagal kasih EXP:", error.message);
        return false;
      }
      if (data === true) showExpToast(amount);
      return data === true;
    } catch (err) {
      console.error("Gagal kasih EXP:", err.message);
      return false;
    }
  }

  function startExpTimer(animeSlug, episodeSlug) {
    stopExpTimer();
    expTimer = setInterval(() => {
      if (document.hidden) return; // tab tidak aktif, jangan hitung menit ini
      if (expMinuteCount >= EXP_MAX_MINUTES_PER_SESSION) {
        stopExpTimer();
        return;
      }
      const key = `anime_minute:${animeSlug}:${episodeSlug}:${expMinuteCount}`;
      expMinuteCount++;
      awardExp(key, EXP_PER_MINUTE);
    }, 60000);
  }

  function carouselSlideHTML(item) {
    const safeTitle = item.title || "Tanpa Judul";
    return `
      <div class="carousel-slide" data-slug="${encodeURIComponent(item.slug)}">
        <img src="${item.poster}" alt="${safeTitle}" onerror="this.src='https://via.placeholder.com/800x450?text=No+Image'" />
        <div class="carousel-overlay">
          <div class="carousel-info">
            ${item.type ? `<span class="carousel-badge">${item.type}</span>` : ""}
            <h2>${safeTitle}</h2>
            <p>${item.episode || item.status_or_day || ""}</p>
          </div>
        </div>
      </div>
    `;
  }

  function initCarousel(items) {
    clearCarouselInterval();
    if (!items.length) return;

    let idx = 0;
    const track = document.getElementById("animeCarouselTrack");
    const dotsWrap = document.getElementById("animeCarouselDots");
    const carouselEl = document.getElementById("animeCarousel");
    if (!track || !dotsWrap || !carouselEl) return;

    dotsWrap.innerHTML = items
      .map((_, i) => `<button class="carousel-dot ${i === 0 ? "active" : ""}" data-i="${i}"></button>`)
      .join("");

    function goTo(i) {
      idx = (i + items.length) % items.length;
      track.style.transform = `translateX(-${idx * 100}%)`;
      dotsWrap.querySelectorAll(".carousel-dot").forEach((d, di) => d.classList.toggle("active", di === idx));
    }

    document.getElementById("animeCarouselPrev")?.addEventListener("click", () => { goTo(idx - 1); restartAutoplay(); });
    document.getElementById("animeCarouselNext")?.addEventListener("click", () => { goTo(idx + 1); restartAutoplay(); });
    dotsWrap.querySelectorAll(".carousel-dot").forEach((dot) => {
      dot.addEventListener("click", () => { goTo(Number(dot.dataset.i)); restartAutoplay(); });
    });

    document.querySelectorAll("#animeCarouselTrack .carousel-slide").forEach((slide) => {
      slide.addEventListener("click", () => {
        const slug = decodeURIComponent(slide.dataset.slug);
        goToDetail(slug);
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

  const JELAJAH_TABS = [
    { key: "ongoing", label: "Ongoing", endpoint: (p) => ANIME_ENDPOINTS.ongoing(p) },
    { key: "completed", label: "Completed", endpoint: (p) => ANIME_ENDPOINTS.completed(p) },
    { key: "movie", label: "Movie", endpoint: (p) => ANIME_ENDPOINTS.movies(p) },
    { key: "terbaru", label: "Terbaru", endpoint: (p) => ANIME_ENDPOINTS.latest(p) },
  ];

  async function renderJelajah(tabKey, page) {
    clearCarouselInterval();
    stopExpTimer();
    state.page = "jelajah";
    setActiveNav("");

    const activeKey = tabKey || state.jelajahTab || "ongoing";
    const activePage = page || 1;
    state.jelajahTab = activeKey;
    state.jelajahPage = activePage;

    const tab = JELAJAH_TABS.find((t) => t.key === activeKey) || JELAJAH_TABS[0];

    app.innerHTML = `
      <div class="section-title"><span class="st-bar"></span>Jelajah Anime</div>
      <div class="genre-bar" id="jelajahTabBar">
        ${JELAJAH_TABS.map(
          (t) => `<div class="genre-chip ${t.key === activeKey ? "active" : ""}" data-tab="${t.key}">${t.label}</div>`
        ).join("")}
      </div>
      <div id="jelajahGrid">${loadingBlock("Memuat " + tab.label + "...")}</div>
      <div class="jelajah-pagination" id="jelajahPagination"></div>
    `;

    document.querySelectorAll("#jelajahTabBar .genre-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const key = chip.dataset.tab;
        if (key === activeKey) return;
        renderJelajah(key, 1);
      });
    });

    const grid = document.getElementById("jelajahGrid");
    const pagWrap = document.getElementById("jelajahPagination");

    try {
      const json = await fetchJSON(tab.endpoint(activePage));
      const data = (json.animes || []).filter((item) => !hasBlockedGenre(item.genres));

      if (!data.length) {
        grid.innerHTML = emptyBlock("Tidak ada data " + tab.label + ".");
      } else {
        grid.className = "grid";
        grid.innerHTML = data.map(cardHTML).join("");
        attachCardListeners();
      }

      const pag = json.pagination || {};
      const curPage = pag.currentPage || activePage;
      pagWrap.innerHTML = `
        <button class="jelajah-page-btn" id="jelajahPrev" ${pag.hasPrev ? "" : "disabled"}>&larr; Sebelumnya</button>
        <span class="jelajah-page-info">Hal ${curPage}</span>
        <button class="jelajah-page-btn" id="jelajahNext" ${pag.hasNext ? "" : "disabled"}>Selanjutnya &rarr;</button>
      `;
      document.getElementById("jelajahPrev")?.addEventListener("click", () => {
        if (pag.hasPrev) renderJelajah(activeKey, curPage - 1);
      });
      document.getElementById("jelajahNext")?.addEventListener("click", () => {
        if (pag.hasNext) renderJelajah(activeKey, curPage + 1);
      });
    } catch (err) {
      grid.innerHTML = emptyBlock("Gagal memuat data: " + err.message);
      pagWrap.innerHTML = "";
    }
  }

  async function renderGenre() {
    clearCarouselInterval();
    stopExpTimer();
    state.page = "genre";
    setActiveNav("genre");

    app.innerHTML = `
      <div class="section-title"><span class="st-bar"></span>Jelajahi Genre</div>
      <div id="genreBar">${loadingBlock("Memuat daftar genre...")}</div>
      <div id="genreGrid"></div>
    `;

    try {
      if (!state.genreList.length) {
        const json = await fetchJSON(ANIME_ENDPOINTS.genres());
        const allGenres = extractArray(json, ["genres", "data", "list"]);
        state.genreList = allGenres.filter((g) => !isBlockedGenreName(g.name || g.title || g.slug));
      }

      const bar = document.getElementById("genreBar");
      bar.className = "genre-bar";
      bar.innerHTML = state.genreList
        .map((g) => {
          const slug = g.slug || g.id || g.name;
          const name = g.name || g.title || slug;
          return `<div class="genre-chip" data-slug="${encodeURIComponent(slug)}" data-name="${name}">${name}</div>`;
        })
        .join("");

      document.getElementById("genreGrid").innerHTML = emptyBlock("Pilih salah satu genre di atas untuk melihat anime.");

      document.querySelectorAll("#genreBar .genre-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          document.querySelectorAll("#genreBar .genre-chip").forEach((c) => c.classList.remove("active"));
          chip.classList.add("active");
          loadGenreResults(decodeURIComponent(chip.dataset.slug), chip.dataset.name);
        });
      });
    } catch (err) {
      document.getElementById("genreBar").innerHTML = emptyBlock("Gagal memuat daftar genre: " + err.message);
    }
  }

  async function loadGenreResults(slug, name) {
    state.activeGenreSlug = slug;
    const grid = document.getElementById("genreGrid");
    grid.innerHTML = loadingBlock("Memuat anime genre " + name + "...");

    try {
      const json = await fetchJSON(ANIME_ENDPOINTS.genre(slug));
      const data = extractArray(json, ["anime", "animeList", "data", "recent", "result", "list"]);

      if (!data.length) {
        grid.innerHTML = emptyBlock("Tidak ditemukan anime untuk genre " + name + ".");
        return;
      }

      grid.className = "grid";
      grid.innerHTML = data.map(cardHTML).join("");
      attachCardListeners();
    } catch (err) {
      grid.innerHTML = emptyBlock("Gagal memuat data: " + err.message);
    }
  }

  const DAY_ORDER = ["minggu", "senin", "selasa", "rabu", "kamis", "jum'at", "sabtu", "random"];

  function dayLabel(key) {
    const labels = {
      minggu: "Minggu",
      senin: "Senin",
      selasa: "Selasa",
      rabu: "Rabu",
      kamis: "Kamis",
      "jum'at": "Jumat",
      sabtu: "Sabtu",
      random: "Lainnya",
    };
    return labels[key] || key;
  }

  function jadwalItemHTML(item) {
    const safeTitle = item.title || "Tanpa Judul";
    const info = [item.episode, item.status_or_day].filter(Boolean).join(" • ");
    return `
      <div class="hist-item" data-slug="${encodeURIComponent(item.slug)}">
        <img src="${item.poster}" alt="${safeTitle}" onerror="this.src='https://via.placeholder.com/80x110?text=No+Image'" />
        <div class="hist-info">
          <div class="hist-title">${safeTitle}</div>
          <div class="hist-chapter">${info || "-"}</div>
        </div>
      </div>
    `;
  }

  function renderJadwalList(dayKey) {
    const schedule = state.jadwalData || {};
    const items = (schedule[dayKey] || []).filter((item) => !hasBlockedGenre(item.genres));
    const listWrap = document.getElementById("jadwalList");
    if (!listWrap) return;

    if (!items.length) {
      listWrap.className = "";
      listWrap.innerHTML = emptyBlock("Tidak ada anime untuk hari ini.");
      return;
    }

    listWrap.className = "hist-list";
    listWrap.innerHTML = items.map(jadwalItemHTML).join("");

    listWrap.querySelectorAll(".hist-item[data-slug]").forEach((el) => {
      el.addEventListener("click", () => {
        const slug = decodeURIComponent(el.dataset.slug);
        goToDetail(slug);
      });
    });
  }

  async function renderJadwal(dayKey) {
    clearCarouselInterval();
    stopExpTimer();
    state.page = "jadwal";
    setActiveNav("");

    app.innerHTML = `
      <div class="section-title"><span class="st-bar"></span>Jadwal Rilis Anime</div>
      <div class="genre-bar" id="jadwalTabBar">${loadingBlock("Memuat jadwal...")}</div>
      <div id="jadwalList"></div>
    `;

    try {
      if (!state.jadwalData) {
        const json = await fetchJSON(ANIME_ENDPOINTS.schedule());
        state.jadwalData = json.schedule || {};
      }
      const schedule = state.jadwalData;
      const orderedKeys = DAY_ORDER.filter((k) => Array.isArray(schedule[k]) && schedule[k].length);

      if (!orderedKeys.length) {
        document.getElementById("jadwalTabBar").innerHTML = "";
        document.getElementById("jadwalList").innerHTML = emptyBlock("Tidak ada data jadwal saat ini.");
        return;
      }

      const activeKey = orderedKeys.includes(dayKey)
        ? dayKey
        : orderedKeys.includes(state.jadwalDay)
        ? state.jadwalDay
        : orderedKeys[0];
      state.jadwalDay = activeKey;

      const tabBar = document.getElementById("jadwalTabBar");
      tabBar.className = "genre-bar tab-scroll";
      tabBar.innerHTML = orderedKeys
        .map((k) => `<div class="genre-chip ${k === activeKey ? "active" : ""}" data-day="${k}">${dayLabel(k)}</div>`)
        .join("");

      tabBar.querySelectorAll(".genre-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          const key = chip.dataset.day;
          if (key === state.jadwalDay) return;
          state.jadwalDay = key;
          tabBar.querySelectorAll(".genre-chip").forEach((c) => c.classList.toggle("active", c === chip));
          renderJadwalList(key);
        });
      });

      renderJadwalList(activeKey);
    } catch (err) {
      document.getElementById("jadwalTabBar").innerHTML = "";
      document.getElementById("jadwalList").innerHTML = emptyBlock("Gagal memuat jadwal: " + err.message);
    }
  }

  async function renderHome() {
    stopExpTimer();
    state.page = "home";
    setActiveNav("home");
    app.innerHTML = `
      <div id="carouselWrap">${loadingBlock("Memuat highlight...")}</div>
      <div class="section-title"><span class="st-bar"></span>Ongoing</div>
      <div id="ongoingGrid">${loadingBlock()}</div>
      <div class="section-title"><span class="st-bar"></span>Baru Ditambahkan</div>
      <div id="recentGrid"></div>
    `;

    try {
      const json = await fetchJSON(ANIME_ENDPOINTS.home());
      const ongoing = json.ongoing || [];
      const recent = json.recent || [];

      const carouselWrap = document.getElementById("carouselWrap");
      const featured = ongoing.slice(0, 5);
      if (featured.length) {
        carouselWrap.innerHTML = `
          <div class="carousel" id="animeCarousel">
            <div class="carousel-track" id="animeCarouselTrack">${featured.map(carouselSlideHTML).join("")}</div>
            <button class="carousel-arrow carousel-prev" id="animeCarouselPrev" aria-label="Sebelumnya">&lsaquo;</button>
            <button class="carousel-arrow carousel-next" id="animeCarouselNext" aria-label="Selanjutnya">&rsaquo;</button>
            <div class="carousel-dots" id="animeCarouselDots"></div>
          </div>
        `;
        initCarousel(featured);
      } else {
        carouselWrap.innerHTML = "";
      }

      const ongoingGrid = document.getElementById("ongoingGrid");
      ongoingGrid.className = "grid";
      ongoingGrid.innerHTML = ongoing.length ? ongoing.map(cardHTML).join("") : emptyBlock("Tidak ada data.");

      const recentGrid = document.getElementById("recentGrid");
      recentGrid.className = "grid";
      recentGrid.innerHTML = recent.length ? recent.map(cardHTML).join("") : emptyBlock("Tidak ada data.");

      attachCardListeners();
    } catch (err) {
      document.getElementById("ongoingGrid").innerHTML = emptyBlock("Gagal memuat data: " + err.message);
    }
  }

  async function renderSearch(query) {
    clearCarouselInterval();
    stopExpTimer();
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
    clearCarouselInterval();
    stopExpTimer();
    state.page = "detail";
    state.detailSlug = slug;
    setActiveNav("");

    app.innerHTML = `<div class="back-btn" id="backBtn">&larr; Kembali</div>${loadingBlock("Memuat detail anime...")}`;
    document.getElementById("backBtn").addEventListener("click", () => renderHome());

    try {
      const json = await fetchJSON(ANIME_ENDPOINTS.detail(slug));
      const d = json.detail;

      const genres = d.genres || [];

      if (hasBlockedGenre(genres)) {
        state.detailData = null;
        app.innerHTML = `<div class="back-btn" id="backBtn">&larr; Kembali</div>${emptyBlock("Konten ini tidak tersedia di aplikasi.")}`;
        document.getElementById("backBtn").addEventListener("click", () => renderHome());
        return;
      }

      state.detailData = d;

      app.innerHTML = `
        <div class="back-btn" id="backBtn">&larr; Kembali</div>
        <div class="detail-hero">
          <img src="${d.poster}" alt="${d.title}" />
          <div class="detail-info">
            <div class="detail-title-row">
              <h1>${d.title}</h1>
              <button class="bookmark-btn" id="bookmarkBtn">☆ Simpan</button>
            </div>
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

      setupBookmarkButton(slug, d.title, d.poster);
    } catch (err) {
      app.innerHTML = `<div class="back-btn" id="backBtn">&larr; Kembali</div>${emptyBlock("Gagal memuat detail: " + err.message)}`;
      document.getElementById("backBtn").addEventListener("click", () => renderHome());
    }
  }

  function setupBookmarkButton(refId, title, thumb) {
    const btn = document.getElementById("bookmarkBtn");
    if (!btn) return;

    function paint(saved) {
      btn.textContent = saved ? "★ Tersimpan" : "☆ Simpan";
      btn.classList.toggle("saved", saved);
    }

    if (AuthApp.getCachedUser()) {
      isBookmarked(refId).then(paint);
    }

    btn.addEventListener("click", () => {
      window.requireAuth(async () => {
        btn.disabled = true;
        const saved = await toggleBookmark(refId, title, thumb);
        paint(saved);
        btn.disabled = false;
      });
    });
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
    clearCarouselInterval();
    stopExpTimer();
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

      const d = state.detailData;
      if (d) {
        pushHistory({
          slug: state.detailSlug,
          episodeSlug: slug,
          episodeName: json.title || episodeName,
          title: d.title,
          poster: d.poster,
        });
      }

      if (AuthApp.getCachedUser()) {
        awardExp(`anime_open:${state.detailSlug}:${slug}`, EXP_PER_EPISODE_OPEN);
        startExpTimer(state.detailSlug, slug);
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

  async function renderRiwayat() {
    clearCarouselInterval();
    stopExpTimer();
    state.page = "riwayat";
    setActiveNav("riwayat");

    app.innerHTML = `<div class="section-title"><span class="st-bar"></span>Riwayat Tonton</div><div id="histGrid">${loadingBlock("Memuat riwayat...")}</div>`;
    const hist = await getHistory();
    const grid = document.getElementById("histGrid");

    if (!hist.length) {
      grid.innerHTML = emptyBlock("Belum ada riwayat tonton.");
      return;
    }

    grid.className = "hist-list";
    grid.innerHTML = hist
      .map(
        (h) => `
      <div class="hist-item" data-slug="${encodeURIComponent(h.slug)}" data-episode-slug="${encodeURIComponent(h.episodeSlug || "")}" data-episode-name="${encodeURIComponent(h.episodeName || "")}">
        <img src="${h.poster || ""}" alt="${h.title}" onerror="this.src='https://via.placeholder.com/80x110?text=No+Image'" />
        <div class="hist-info">
          <div class="hist-title">${h.title}</div>
          <div class="hist-chapter">Terakhir ditonton: ${h.episodeName}</div>
        </div>
      </div>`
      )
      .join("");

    document.querySelectorAll(".hist-item[data-slug]").forEach((item) => {
      item.addEventListener("click", () => {
        const slug = decodeURIComponent(item.dataset.slug);
        const episodeSlug = item.dataset.episodeSlug ? decodeURIComponent(item.dataset.episodeSlug) : "";
        const episodeName = item.dataset.episodeName ? decodeURIComponent(item.dataset.episodeName) : "";
        if (episodeSlug) {
          continueWatching(slug, episodeSlug, episodeName);
        } else {
          goToDetail(slug);
        }
      });
    });
  }

  async function continueWatching(slug, episodeSlug, episodeName) {
    clearCarouselInterval();
    stopExpTimer();
    state.page = "detail";
    state.detailSlug = slug;
    setActiveNav("");
    app.innerHTML = loadingBlock("Membuka episode terakhir...");

    try {
      const json = await fetchJSON(ANIME_ENDPOINTS.detail(slug));
      const d = json.detail;

      if (hasBlockedGenre(d.genres)) {
        state.detailData = null;
        app.innerHTML = `<div class="back-btn" id="backBtn">&larr; Kembali</div>${emptyBlock("Konten ini tidak tersedia di aplikasi.")}`;
        document.getElementById("backBtn").addEventListener("click", () => renderHome());
        return;
      }

      state.detailData = d;
      openPlayer(episodeSlug, episodeName);
    } catch (err) {
      app.innerHTML = emptyBlock("Gagal memuat anime: " + err.message);
    }
  }

  return {
    renderHome,
    renderGenre,
    renderJelajah,
    renderJadwal,
    renderRiwayat,
    renderSearch,
    clearHistory,
    getHistoryCount,
    stopCarousel: clearCarouselInterval,
    stopExpTimer,
    goToDetail,
  };
})();
