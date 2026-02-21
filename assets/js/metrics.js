(() => {
  const cfg = window.__SITE_CONFIG__ || {};
  const goatApi = cfg.goatApi;

  const reactionEls = Array.from(document.querySelectorAll("[data-reaction-count]"));
  const viewEls = Array.from(document.querySelectorAll("[data-view-count]"));

  function normalizePath(value) {
    let raw = (value || "").toString().trim();
    try {
      raw = new URL(raw, window.location.origin).pathname;
    } catch (_) {}
    try {
      raw = decodeURIComponent(raw);
    } catch (_) {}
    if (!raw.startsWith("/")) raw = `/${raw}`;
    if (raw.length > 1) raw = raw.replace(/\/+$/, "");
    return raw.toLowerCase();
  }

  function setReaction(el, count) {
    el.textContent = `Reactions ${count}`;
    const card = el.closest(".post-card");
    if (card) card.dataset.reactions = String(count);
  }

  function setView(el, count) {
    el.textContent = `Views ${count}`;
    const card = el.closest(".post-card");
    if (card) card.dataset.views = String(count);
  }

  async function fetchReactionMap() {
    if (reactionEls.length === 0) return new Map();
    try {
      const res = await fetch("/assets/data/reactions.json", { cache: "no-store" });
      if (!res.ok) return new Map();
      const data = await res.json();
      const source = data && typeof data === "object" && data.reactions
        ? data.reactions
        : data;

      const map = new Map();
      Object.entries(source || {}).forEach(([key, value]) => {
        map.set(normalizePath(key), Number(value || 0));
      });
      return map;
    } catch (_) {
      return new Map();
    }
  }

  function applyReactions(map) {
    reactionEls.forEach((el) => {
      const url = el.dataset.postUrl || window.location.pathname;
      const key = normalizePath(url);
      setReaction(el, map.get(key) || 0);
    });
  }

  function extractTotalReactions(payload) {
    if (!payload || typeof payload !== "object") return null;
    const giscus = payload.giscus;
    if (!giscus || typeof giscus !== "object") return null;

    const discussion = giscus.discussion || {};
    const directCandidates = [
      discussion?.reactions?.totalCount,
      discussion?.reactionCount,
      discussion?.totalReactions,
      giscus?.reactions?.totalCount,
      giscus?.reactionCount,
      giscus?.totalReactions
    ];
    for (const n of directCandidates) {
      if (Number.isFinite(Number(n))) return Number(n);
    }

    const groupCandidates = [discussion?.reactionGroups, giscus?.reactionGroups];
    for (const groups of groupCandidates) {
      if (Array.isArray(groups)) {
        return groups.reduce((sum, group) => sum + Number(group?.totalCount || 0), 0);
      }
    }

    return null;
  }

  function bindGiscusReactionSync() {
    if (reactionEls.length === 0) return;

    window.addEventListener("message", (event) => {
      if (event.origin !== "https://giscus.app") return;
      const total = extractTotalReactions(event.data);
      if (total === null) return;

      const currentPath = normalizePath(window.location.pathname);
      reactionEls.forEach((el) => {
        const elPath = normalizePath(el.dataset.postUrl || window.location.pathname);
        if (elPath === currentPath) setReaction(el, total);
      });

      sortAllGrids();
    });
  }

  async function fetchViews() {
    if (!goatApi || viewEls.length === 0) return;
    const uniqueUrls = Array.from(new Set(viewEls.map((el) => el.dataset.postUrl).filter(Boolean)));
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
      if (type === "reactions") sortGrid(grid, "reactions");
      if (type === "views") sortGrid(grid, "views");
    });
  }

  (async () => {
    const reactionMap = await fetchReactionMap();
    applyReactions(reactionMap);
    bindGiscusReactionSync();
    await fetchViews();
    sortAllGrids();
  })();
})();
