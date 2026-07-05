const BASE = "https://www.sankavollerei.com/anime/animasu";

module.exports = async (req, res) => {
  try {
    const { slug } = req.query;
    const url = slug ? `${BASE}/genre/${encodeURIComponent(slug)}` : `${BASE}/genres`;
    const r = await fetch(url);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
