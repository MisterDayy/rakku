const API_BASE = "https://api.theresav.biz.id/manga/komiku";
const API_KEY = process.env.API_KEY || "mykey-111";

module.exports = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: "Parameter 'q' wajib diisi" });

    const target = `${API_BASE}/search?q=${encodeURIComponent(q)}&apikey=${API_KEY}`;
    const r = await fetch(target);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
