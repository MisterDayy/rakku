const API_BASE = "https://api.theresav.biz.id/manga/komiku";
const API_KEY = process.env.API_KEY || "mykey-111";

module.exports = async (req, res) => {
  try {
    const url = `${API_BASE}/home?apikey=${API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
