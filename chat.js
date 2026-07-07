const ChatApp = (function () {
  const app = document.getElementById("app");
  const client = supabaseClient;
  let channel = null;
  let loadedIds = new Set();

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }

  function roleBadge(role) {
    if (role === "admin") return `<span class="admin-badge admin-badge-admin">admin</span>`;
    if (role === "moderator") return `<span class="admin-badge admin-badge-mod">mod</span>`;
    return "";
  }

  function canDeleteMsg(m, myId, isAdmin, isMod) {
    if (m.user_id === myId) return true;
    if (isAdmin) return true;
    if (isMod) return (m.role || "user") === "user";
    return false;
  }

  function msgHTML(m, myId, isAdmin, isMod) {
    const isMine = m.user_id === myId;
    const canDelete = canDeleteMsg(m, myId, isAdmin, isMod);
    return `
      <div class="chat-msg ${isMine ? "chat-msg-mine" : ""}" data-id="${m.id}">
        <div class="chat-msg-head">
          <span class="chat-msg-name">${escapeHtml(m.username || "User")}</span>
          ${m.is_unlimited ? `<span class="unlimited-icon" title="Unlimited">&#8734;</span>` : ""}
          ${roleBadge(m.role)}
          <span class="chat-msg-time">${formatTime(m.created_at)}</span>
          ${canDelete ? `<button class="chat-msg-delete" data-action="delete" title="Hapus pesan">&times;</button>` : ""}
        </div>
        <div class="chat-msg-body">${escapeHtml(m.message)}</div>
      </div>
    `;
  }

  function wireDeleteButton(el) {
    const btn = el?.querySelector('[data-action="delete"]');
    if (!btn) return;
    btn.addEventListener("click", async () => {
      if (!confirm("Hapus pesan ini?")) return;
      const id = el.dataset.id;
      const { error } = await client.from("global_chat_messages").delete().eq("id", id);
      if (error) alert("Gagal hapus pesan: " + error.message);
    });
  }

  function isNearBottom() {
    return window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
  }

  function appendMessage(m, myId, isAdmin, isMod) {
    if (loadedIds.has(m.id)) return;
    loadedIds.add(m.id);
    const wrap = document.getElementById("chatMessages");
    if (!wrap) return;
    const wasNearBottom = isNearBottom();
    wrap.querySelector(".empty-state")?.remove();
    wrap.insertAdjacentHTML("beforeend", msgHTML(m, myId, isAdmin, isMod));
    wireDeleteButton(wrap.lastElementChild);
    if (wasNearBottom) window.scrollTo(0, document.body.scrollHeight);
  }

  function removeMessage(id) {
    loadedIds.delete(id);
    const el = document.querySelector(`.chat-msg[data-id="${id}"]`);
    if (el) el.remove();
  }

  function subscribeRealtime(myId, isAdmin, isMod) {
    unsubscribeRealtime();
    channel = client
      .channel("public:global_chat_messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "global_chat_messages" }, (payload) => {
        appendMessage(payload.new, myId, isAdmin, isMod);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "global_chat_messages" }, (payload) => {
        removeMessage(payload.old.id);
      })
      .subscribe();
  }

  function unsubscribeRealtime() {
    if (channel) {
      client.removeChannel(channel);
      channel = null;
    }
  }

  async function renderChat() {
    if (window.setBottomNavActive) window.setBottomNavActive("");
    unsubscribeRealtime();
    loadedIds = new Set();

    const user = AuthApp.getCachedUser();
    if (!user) {
      AuthApp.renderLogin();
      return;
    }

    const isAdmin = AuthApp.isAdmin();
    const isMod = AuthApp.isStaff() && !isAdmin;

    app.innerHTML = `
      <div class="back-btn" id="chatBack">&larr; Kembali</div>
      <div class="section-title"><span class="st-bar"></span>Chat Global</div>
      <div class="chat-messages" id="chatMessages"><div class="loading"><div class="spinner"></div>Memuat chat...</div></div>
      <div class="chat-input-bar" id="chatInputBar">
        <input type="text" id="chatInput" class="chat-input" placeholder="Tulis pesan..." maxlength="500" autocomplete="off" />
        <button class="chat-send-btn" id="chatSendBtn">Kirim</button>
      </div>
    `;

    document.getElementById("chatBack").addEventListener("click", () => {
      unsubscribeRealtime();
      document.getElementById("chatInputBar")?.remove();
      if (currentMode === "manga") MangaApp.renderHome();
      else AnimeApp.renderHome();
    });

    const { data, error } = await client
      .from("global_chat_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    const wrap = document.getElementById("chatMessages");

    if (error) {
      wrap.innerHTML = `<div class="empty-state">Gagal memuat chat: ${escapeHtml(error.message)}</div>`;
      return;
    }

    const messages = (data || []).slice().reverse();
    wrap.innerHTML = messages.length
      ? messages.map((m) => msgHTML(m, user.id, isAdmin, isMod)).join("")
      : `<div class="empty-state">Belum ada obrolan. Jadilah yang pertama!</div>`;

    messages.forEach((m) => loadedIds.add(m.id));
    wrap.querySelectorAll(".chat-msg").forEach((el) => wireDeleteButton(el));

    window.scrollTo(0, document.body.scrollHeight);

    subscribeRealtime(user.id, isAdmin, isMod);

    const input = document.getElementById("chatInput");
    const sendBtn = document.getElementById("chatSendBtn");

    async function sendMessage() {
      const text = input.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      const { error: sendError } = await client.from("global_chat_messages").insert({ user_id: user.id, message: text });
      sendBtn.disabled = false;
      if (sendError) {
        alert("Gagal kirim pesan: " + sendError.message);
        return;
      }
      input.value = "";
      input.focus();
    }

    sendBtn.addEventListener("click", sendMessage);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  return { renderChat, unsubscribeRealtime };
})();

window.ChatApp = ChatApp;
