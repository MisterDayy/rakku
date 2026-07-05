const BASE = "https://www.sankavollerei.com/anime/animasu";

module.exports = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ status: "error", message: "Parameter 'q' wajib diisi" });

    const url = `${BASE}/search/${encodeURIComponent(q)}`;
    const r = await fetch(url);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
