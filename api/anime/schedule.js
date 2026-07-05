const BASE = "https://www.sankavollerei.com/anime/animasu";

module.exports = async (req, res) => {
  try {
    const r = await fetch(`${BASE}/schedule`);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
