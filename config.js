// Manga endpoints (proxy ke API Komiku lewat backend sendiri)
const ENDPOINTS = {
  home: `/api/manga/home`,
  info: (url) => `/api/manga/info?url=${encodeURIComponent(url)}`,
  download: (url) => `/api/manga/download?url=${encodeURIComponent(url)}`,
  search: (q) => `/api/manga/search?q=${encodeURIComponent(q)}`,
};

// Anime endpoints (proxy ke API Sanka/Animasu lewat backend sendiri)
// Catatan: home/ongoing/completed/movies/latest/schedule digabung jadi satu
// serverless function (api/anime/home.js) via query "type", biar gak kena
// limit 12 Serverless Functions di Vercel Hobby plan.
const ANIME_ENDPOINTS = {
  home: (page) => `/api/anime/home${page ? `?page=${page}` : ""}`,
  search: (q) => `/api/anime/search?q=${encodeURIComponent(q)}`,
  detail: (slug) => `/api/anime/detail?slug=${encodeURIComponent(slug)}`,
  episode: (slug) => `/api/anime/episode?slug=${encodeURIComponent(slug)}`,
  genres: () => `/api/anime/genres`,
  genre: (slug) => `/api/anime/genres?slug=${encodeURIComponent(slug)}`,
  schedule: () => `/api/anime/home?type=schedule`,
  ongoing: (page) => `/api/anime/home?type=ongoing${page ? `&page=${page}` : ""}`,
  completed: (page) => `/api/anime/home?type=completed${page ? `&page=${page}` : ""}`,
  movies: (page) => `/api/anime/home?type=movies${page ? `&page=${page}` : ""}`,
  latest: (page) => `/api/anime/home?type=latest${page ? `&page=${page}` : ""}`,
};
