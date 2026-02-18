(() => {
  const cfg = window.__SITE_CONFIG__ || {};
  const repo = cfg.githubRepo;
  const goatApi = cfg.goatApi;

  const likeEls = Array.from(document.querySelectorAll("[data-like-count]"));
  const viewEls = Array.from(document.querySelectorAll("[data-view-count]"));

  function normalize(value) {
    return (value || "").toString().trim().toLowerCase().replace(/\/$/, "");
  }

  function setLike(el, count) {
    el.textContent = `??${count}`;
    const card = el.closest(".post-card");
    if (card) card.dataset.likes = String(count);
  }

  function setView(el, count) {
    el.textContent = `?몓 ${count}`;
    const card = el.closest(".post-card");
    if (card) card.dataset.views = String(count);
  }

  async function fetchLikes() {
    if (!repo || likeEls.length === 0) return;
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=all&per_page=100`);
      if (!res.ok) return;
      const issues = await res.json();
      const map = new Map();

      issues.forEach((issue) => {
        if (issue.pull_request) return;
        const key = normalize(issue.title);
        const reactions = issue.reactions || {};
        const score = (reactions["+1"] || 0) + (reactions.heart || 0);
        map.set(key, score);
      });

      likeEls.forEach((el) => {
        const byUrl = normalize(el.dataset.postUrl);
        const bySlug = normalize(el.dataset.postSlug);
        const count = map.get(byUrl) ?? map.get(bySlug) ?? 0;
        setLike(el, count);
      });
    } catch (_) {}
  }

  async function fetchViews() {
    if (!goatApi || viewEls.length === 0) return;
    const uniqueUrls = Array.from(
      new Set(viewEls.map((el) => el.dataset.postUrl).filter(Boolean))
    );

    const counts = new Map();

    await Promise.all(
      uniqueUrls.map(async (url) => {
        try {
          const endpoint = `${goatApi}${encodeURIComponent(url)}.json`;
          const res = await fetch(endpoint);
          if (!res.ok) {
            counts.set(url, 0);
            return;
          }
          const data = await res.json();
          counts.set(url, Number(data.count || 0));
        } catch (_) {
          counts.set(url, 0);
        }
      })
    );

    viewEls.forEach((el) => {
      const url = el.dataset.postUrl;
      setView(el, counts.get(url) || 0);
    });
  }

  function sortGrid(grid, key) {
    const cards = Array.from(grid.querySelectorAll(".post-card"));
    cards.sort((a, b) => Number(b.dataset[key] || 0) - Number(a.dataset[key] || 0));
    cards.forEach((card) => grid.appendChild(card));
    const limit = Number(grid.dataset.displayLimit || "0");
    if (limit > 0) {
      cards.forEach((card, idx) => {
        card.hidden = idx >= limit;
      });
    }
  }

  function sortAllGrids() {
    document.querySelectorAll(".sortable-grid").forEach((grid) => {
      const type = grid.dataset.sortType;
      if (type === "likes") sortGrid(grid, "likes");
      if (type === "views") sortGrid(grid, "views");
    });
  }

  (async () => {
    await fetchLikes();
    await fetchViews();
    sortAllGrids();
  })();
})();

