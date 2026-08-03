const API_BASE = "https://api.theresav.biz.id/manga/komiku";
const API_KEY = process.env.API_KEY || "mykey-111";

module.exports = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Parameter 'url' wajib diisi" });

    const target = `${API_BASE}/download?url=${encodeURIComponent(url)}&apikey=${API_KEY}`;
    const r = await fetch(target);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
