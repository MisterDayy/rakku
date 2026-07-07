const AdminApp = (function () {
  const app = document.getElementById("app");
  const client = supabaseClient;

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function roleBadgeClass(role) {
    if (role === "admin") return "admin-badge admin-badge-admin";
    if (role === "moderator") return "admin-badge admin-badge-mod";
    return "admin-badge admin-badge-user";
  }

  function guard() {
    if (!AuthApp.isStaff()) {
      app.innerHTML = `<div class="empty-state">Kamu tidak punya akses ke halaman ini.</div>`;
      return false;
    }
    return true;
  }

  // ===== List halaman utama admin =====
  async function renderAdminPanel(searchQuery) {
    if (window.setBottomNavActive) window.setBottomNavActive("");
    if (!AuthApp.isReady()) {
      app.innerHTML = `<div class="loading"><div class="spinner"></div>Memeriksa sesi...</div>`;
      await AuthApp.waitUntilReady();
    }
    if (!guard()) return;

    const q = (searchQuery || "").trim();

    app.innerHTML = `
      <div class="back-btn" id="adminBack">&larr; Kembali ke Profil</div>
      <div class="section-title"><span class="st-bar"></span>Panel Admin</div>
      <input type="text" id="adminSearchInput" class="admin-search-input" placeholder="Cari username..." value="${escapeHtml(q)}" />
      <div id="adminUserList"><div class="loading"><div class="spinner"></div>Memuat user...</div></div>
    `;

    document.getElementById("adminBack").addEventListener("click", () => window.renderProfile());

    const searchInput = document.getElementById("adminSearchInput");
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") renderAdminPanel(searchInput.value);
    });

    let query = client.from("profiles").select("*").order("created_at", { ascending: false }).limit(50);
    if (q) query = client.from("profiles").select("*").ilike("username", `%${q}%`).limit(50);

    const { data, error } = await query;
    const listBox = document.getElementById("adminUserList");

    if (error) {
      listBox.innerHTML = `<div class="empty-state">Gagal memuat: ${escapeHtml(error.message)}</div>`;
      return;
    }
    if (!data.length) {
      listBox.innerHTML = `<div class="empty-state">Tidak ada user ditemukan.</div>`;
      return;
    }

    listBox.className = "admin-list";
    listBox.innerHTML = data
      .map(
        (u) => `
      <div class="admin-user-row" data-id="${u.id}">
        <div class="admin-user-info">
          <div class="admin-user-name">${escapeHtml(u.username || "(tanpa nama)")}${u.has_unlimited ? ` <span class="unlimited-icon" title="Unlimited">&#8734;</span>` : ""}</div>
          <div class="admin-user-sub">Lv.${u.level} &middot; ${u.exp} EXP</div>
        </div>
        <div class="admin-user-badges">
          <span class="${roleBadgeClass(u.role)}">${u.role}</span>
          ${u.is_banned ? `<span class="admin-badge admin-badge-banned">banned</span>` : ""}
        </div>
      </div>`
      )
      .join("");

    listBox.querySelectorAll(".admin-user-row").forEach((row) => {
      row.addEventListener("click", () => renderAdminUserDetail(row.dataset.id, q));
    });
  }

  // ===== Detail 1 user =====
  async function renderAdminUserDetail(userId, backQuery) {
    if (!guard()) return;

    app.innerHTML = `<div class="loading"><div class="spinner"></div>Memuat detail user...</div>`;

    const { data: u, error } = await client.from("profiles").select("*").eq("id", userId).single();

    if (error || !u) {
      app.innerHTML = `<div class="empty-state">Gagal memuat user: ${escapeHtml(error?.message || "tidak ditemukan")}</div>`;
      return;
    }

    const me = AuthApp.getCachedUser();
    const isSelf = me && me.id === u.id;
    const iAmAdmin = AuthApp.isAdmin();
    // moderator gak boleh ban/unban sesama staff (admin/moderator) — dicek juga di server (RPC)
    const canModerateBan = iAmAdmin || u.role === "user";

    app.innerHTML = `
      <div class="back-btn" id="adminDetailBack">&larr; Kembali ke Daftar</div>
      <div class="section-title"><span class="st-bar"></span>${escapeHtml(u.username || "(tanpa nama)")}</div>

      <div class="admin-detail-card">
        <div class="admin-field-row"><span>Role saat ini</span><span class="${roleBadgeClass(u.role)}">${u.role}</span></div>
        <div class="admin-field-row"><span>Level</span><span>${u.level}</span></div>
        <div class="admin-field-row"><span>EXP</span><span>${u.exp}</span></div>
        <div class="admin-field-row"><span>Status</span><span>${u.is_banned ? `Banned${u.banned_reason ? " — " + escapeHtml(u.banned_reason) : ""}` : "Aktif"}</span></div>
      </div>

      ${iAmAdmin ? `
      <div class="section-title"><span class="st-bar"></span>Ubah Role</div>
      <div class="admin-action-card">
        <select id="roleSelect" class="admin-select">
          <option value="user" ${u.role === "user" ? "selected" : ""}>user</option>
          <option value="moderator" ${u.role === "moderator" ? "selected" : ""}>moderator</option>
          <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
        </select>
        <button class="admin-btn" id="saveRoleBtn" ${isSelf ? "disabled" : ""}>Simpan Role</button>
      </div>
      ${isSelf ? `<p class="admin-note">Kamu tidak bisa ganti role diri sendiri lewat panel ini.</p>` : ""}

      <div class="section-title"><span class="st-bar"></span>Ubah Level</div>
      <div class="admin-action-card">
        <input type="number" id="levelInput" class="admin-number-input" min="1" value="${u.level}" />
        <button class="admin-btn" id="saveLevelBtn">Simpan Level</button>
        <button class="admin-btn admin-btn-danger" id="resetLevelBtn">Reset ke 1</button>
      </div>

      <div class="section-title"><span class="st-bar"></span>Tambah EXP</div>
      <div class="admin-action-card">
        <input type="number" id="expInput" class="admin-number-input" placeholder="Jumlah EXP (bisa negatif)" />
        <button class="admin-btn" id="addExpBtn">Tambahkan</button>
      </div>

      <div class="section-title"><span class="st-bar"></span>Status Unlimited &#8734;</div>
      <div class="admin-action-card">
        <button class="admin-btn ${u.has_unlimited ? "admin-btn-danger" : ""}" id="toggleUnlimitedBtn">
          ${u.has_unlimited ? "Matikan Unlimited" : "Aktifkan Unlimited"}
        </button>
      </div>
      <p class="admin-note">Kalau aktif, ikon &#8734; muncul di sebelah nama user ini di Chat Global dan halaman Profil-nya.</p>
      ` : ""}

      <div class="section-title"><span class="st-bar"></span>${u.is_banned ? "Unban User" : "Ban User"}</div>
      <div class="admin-action-card admin-action-card-col">
        ${!canModerateBan
          ? `<p class="admin-note">Moderator tidak bisa ban/unban sesama staff (admin/moderator).</p>`
          : u.is_banned
          ? `<button class="admin-btn admin-btn-danger" id="unbanBtn" ${isSelf ? "disabled" : ""}>Unban User Ini</button>`
          : `
            <textarea id="banReasonInput" class="admin-textarea" placeholder="Alasan ban (opsional)"></textarea>
            <button class="admin-btn admin-btn-danger" id="banBtn" ${isSelf ? "disabled" : ""}>Ban User Ini</button>
          `}
      </div>
      ${isSelf ? `<p class="admin-note">Kamu tidak bisa ban diri sendiri.</p>` : ""}

      <div id="adminActionMsg" class="admin-msg"></div>
    `;

    document.getElementById("adminDetailBack").addEventListener("click", () => renderAdminPanel(backQuery));

    const msgBox = document.getElementById("adminActionMsg");
    function showMsg(text, isError) {
      msgBox.textContent = text;
      msgBox.className = "admin-msg" + (isError ? " admin-msg-error" : " admin-msg-ok");
    }

    const saveRoleBtn = document.getElementById("saveRoleBtn");
    if (saveRoleBtn) {
      saveRoleBtn.addEventListener("click", async () => {
        const newRole = document.getElementById("roleSelect").value;
        saveRoleBtn.disabled = true;
        const { error } = await client.rpc("admin_set_role", { target_id: u.id, new_role: newRole });
        saveRoleBtn.disabled = false;
        if (error) return showMsg("Gagal ubah role: " + error.message, true);
        showMsg("Role berhasil diubah.");
        renderAdminUserDetail(userId, backQuery);
      });
    }

    const saveLevelBtn = document.getElementById("saveLevelBtn");
    if (saveLevelBtn) {
      saveLevelBtn.addEventListener("click", async () => {
        const newLevel = parseInt(document.getElementById("levelInput").value, 10);
        if (!newLevel || newLevel < 1) return showMsg("Level minimal 1.", true);
        saveLevelBtn.disabled = true;
        const { error } = await client.rpc("admin_set_level", { target_id: u.id, new_level: newLevel });
        saveLevelBtn.disabled = false;
        if (error) return showMsg("Gagal ubah level: " + error.message, true);
        showMsg("Level berhasil diubah.");
        renderAdminUserDetail(userId, backQuery);
      });
    }

    const resetLevelBtn = document.getElementById("resetLevelBtn");
    if (resetLevelBtn) {
      resetLevelBtn.addEventListener("click", async () => {
        if (!confirm(`Reset level "${u.username}" ke 1?`)) return;
        resetLevelBtn.disabled = true;
        const { error } = await client.rpc("admin_set_level", { target_id: u.id, new_level: 1 });
        resetLevelBtn.disabled = false;
        if (error) return showMsg("Gagal reset level: " + error.message, true);
        showMsg("Level berhasil di-reset ke 1.");
        renderAdminUserDetail(userId, backQuery);
      });
    }

    const addExpBtn = document.getElementById("addExpBtn");
    if (addExpBtn) {
      addExpBtn.addEventListener("click", async () => {
        const amount = parseInt(document.getElementById("expInput").value, 10);
        if (!amount) return showMsg("Isi jumlah EXP dulu.", true);
        addExpBtn.disabled = true;
        const { error } = await client.rpc("admin_add_exp", { target_id: u.id, amount });
        addExpBtn.disabled = false;
        if (error) return showMsg("Gagal nambah EXP: " + error.message, true);
        showMsg("EXP berhasil ditambahkan.");
        renderAdminUserDetail(userId, backQuery);
      });
    }

    const toggleUnlimitedBtn = document.getElementById("toggleUnlimitedBtn");
    if (toggleUnlimitedBtn) {
      toggleUnlimitedBtn.addEventListener("click", async () => {
        const newStatus = !u.has_unlimited;
        toggleUnlimitedBtn.disabled = true;
        const { error } = await client.rpc("admin_set_unlimited", { target_id: u.id, enabled: newStatus });
        toggleUnlimitedBtn.disabled = false;
        if (error) return showMsg("Gagal ubah status unlimited: " + error.message, true);
        showMsg(newStatus ? "Unlimited diaktifkan." : "Unlimited dimatikan.");
        renderAdminUserDetail(userId, backQuery);
      });
    }

    const banBtn = document.getElementById("banBtn");
    if (banBtn) {
      banBtn.addEventListener("click", async () => {
        if (!confirm(`Yakin mau ban "${u.username}"?`)) return;
        const reason = document.getElementById("banReasonInput").value.trim() || null;
        banBtn.disabled = true;
        const { error } = await client.rpc("admin_ban_user", { target_id: u.id, reason });
        banBtn.disabled = false;
        if (error) return showMsg("Gagal ban user: " + error.message, true);
        showMsg("User berhasil dibanned.");
        renderAdminUserDetail(userId, backQuery);
      });
    }

    const unbanBtn = document.getElementById("unbanBtn");
    if (unbanBtn) {
      unbanBtn.addEventListener("click", async () => {
        if (!confirm(`Yakin mau unban "${u.username}"?`)) return;
        unbanBtn.disabled = true;
        const { error } = await client.rpc("admin_unban_user", { target_id: u.id });
        unbanBtn.disabled = false;
        if (error) return showMsg("Gagal unban user: " + error.message, true);
        showMsg("User berhasil di-unban.");
        renderAdminUserDetail(userId, backQuery);
      });
    }
  }

  return {
    renderAdminPanel,
    renderAdminUserDetail,
  };
})();

window.AdminApp = AdminApp;
