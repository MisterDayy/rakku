const BASE = "https://www.sankavollerei.com/anime/animasu";

module.exports = async (req, res) => {
  try {
    const { page } = req.query;
    const url = page ? `${BASE}/latest?page=${encodeURIComponent(page)}` : `${BASE}/latest`;
    const r = await fetch(url);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
