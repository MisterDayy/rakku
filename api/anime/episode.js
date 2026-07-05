const BASE = "https://www.sankavollerei.com/anime/animasu";

module.exports = async (req, res) => {
  try {
    const { slug } = req.query;
    if (!slug) return res.status(400).json({ status: "error", message: "Parameter 'slug' wajib diisi" });

    const url = `${BASE}/episode/${encodeURIComponent(slug)}`;
    const r = await fetch(url);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
