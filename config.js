// Manga endpoints (proxy ke API Komiku lewat backend sendiri)
const ENDPOINTS = {
  home: `/api/manga/home`,
  info: (url) => `/api/manga/info?url=${encodeURIComponent(url)}`,
  download: (url) => `/api/manga/download?url=${encodeURIComponent(url)}`,
  search: (q) => `/api/manga/search?q=${encodeURIComponent(q)}`,
};

// Anime endpoints (proxy ke API Sanka/Animasu lewat backend sendiri)
const ANIME_ENDPOINTS = {
  home: (page) => `/api/anime/home${page ? `?page=${page}` : ""}`,
  search: (q) => `/api/anime/search?q=${encodeURIComponent(q)}`,
  detail: (slug) => `/api/anime/detail?slug=${encodeURIComponent(slug)}`,
  episode: (slug) => `/api/anime/episode?slug=${encodeURIComponent(slug)}`,
  genres: () => `/api/anime/genres`,
  genre: (slug) => `/api/anime/genres?slug=${encodeURIComponent(slug)}`,
  schedule: () => `/api/anime/schedule`,
};
