const BASE = "https://www.sankavollerei.com/anime/animasu";

const TYPE_PATH = {
  home: "home",
  ongoing: "ongoing",
  completed: "completed",
  movies: "movies",
  latest: "latest",
  schedule: "schedule",
};

module.exports = async (req, res) => {
  try {
    const { page, type } = req.query;
    const path = TYPE_PATH[type] || "home";
    const url = page ? `${BASE}/${path}?page=${encodeURIComponent(page)}` : `${BASE}/${path}`;
    const r = await fetch(url);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
