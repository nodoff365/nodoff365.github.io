(() => {
  const root = document.documentElement;
  const body = document.body;
  const themeBtn = document.getElementById("theme-toggle");
  const menuBtn = document.getElementById("menu-toggle");
  const overlay = document.getElementById("sidebar-overlay");

  function updateGiscusTheme(theme) {
    const frame = document.querySelector("iframe.giscus-frame");
    if (!frame) return;
    const cfg = window.__SITE_CONFIG__ || {};
    frame.contentWindow.postMessage(
      {
        giscus: {
          setConfig: {
            theme: theme === "dark"
              ? (cfg.giscusThemeDark || "noborder_dark")
              : (cfg.giscusThemeLight || "light")
          }
        }
      },
      "https://giscus.app"
    );
  }

  function syncGiscusThemeWhenReady() {
    let tries = 0;
    const maxTries = 60;
    const timer = setInterval(() => {
      tries += 1;
      const frame = document.querySelector("iframe.giscus-frame");
      if (frame) {
        clearInterval(timer);
        updateGiscusTheme(root.getAttribute("data-theme") || "light");
      } else if (tries >= maxTries) {
        clearInterval(timer);
      }
    }, 200);
  }

  function setTheme(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    updateGiscusTheme(theme);
  }

  const storedTheme = localStorage.getItem("theme");
  if (storedTheme === "dark" || storedTheme === "light") {
    setTheme(storedTheme);
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    setTheme("dark");
  } else {
    setTheme("light");
  }
  syncGiscusThemeWhenReady();

  themeBtn?.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    setTheme(next);
  });

  menuBtn?.addEventListener("click", () => {
    const open = body.classList.toggle("sidebar-open");
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  overlay?.addEventListener("click", () => {
    body.classList.remove("sidebar-open");
    menuBtn?.setAttribute("aria-expanded", "false");
  });

  document.querySelectorAll(".tree-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const node = btn.closest(".tree-node");
      if (!node) return;
      node.classList.toggle("open");
      const expanded = node.classList.contains("open");
      btn.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
  });

  const params = new URLSearchParams(window.location.search);
  const majorParam = params.get("major");
  const minorParam = params.get("minor");
  const tagParam = params.get("tag");
  const onPostsPath = window.location.pathname.replace(/\/+$/, "") === "/posts";

  if (majorParam) {
    const postsNode = document.querySelector(".posts-node");
    postsNode?.classList.add("open");

    document.querySelectorAll(".major-node").forEach((node) => {
      if (node.dataset.major === majorParam) {
        node.classList.add("open");
      }
    });
  }

  if (majorParam && !minorParam) {
    document.querySelectorAll(".major-link").forEach((link) => {
      if (link.dataset.major === majorParam) {
        link.classList.add("active");
      }
    });
  }

  if (minorParam) {
    const postsNode = document.querySelector(".posts-node");
    postsNode?.classList.add("open");
    document.querySelectorAll(".major-node").forEach((node) => {
      const hasMinor = Array.from(node.querySelectorAll(".minor-title-link"))
        .some((link) => link.dataset.minor === minorParam);
      if (hasMinor) node.classList.add("open");
    });
    document.querySelectorAll(".minor-title-link").forEach((link) => {
      if (link.dataset.minor === minorParam) {
        link.classList.add("active");
      }
    });
  }

  // Highlight only the current path item.
  if (onPostsPath && !majorParam && !minorParam && !tagParam) {
    document.querySelector(".posts-link")?.classList.add("active");
  }

  const postsList = document.getElementById("posts-list");
  if (postsList) {
    const paginationEl = document.getElementById("posts-pagination");
    const pageSize = 5;
    const cards = Array.from(postsList.querySelectorAll(".post-card"));

    const filtered = cards.filter((card) => {
      const cardMajor = card.dataset.major || "";
      const cardMinor = card.dataset.minor || "";
      const cardTags = (card.dataset.tags || "").split("|").filter(Boolean);

      const majorMatch = !majorParam || cardMajor === majorParam;
      const minorMatch = !minorParam || cardMinor === minorParam;
      const tagMatch = !tagParam || cardTags.includes(tagParam);
      return majorMatch && minorMatch && tagMatch;
    });

    cards.forEach((card) => {
      card.hidden = true;
    });

    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    let currentPage = Number(params.get("page") || "1");
    if (Number.isNaN(currentPage) || currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    filtered.slice(start, end).forEach((card) => {
      card.hidden = false;
    });

    const titleEl = document.getElementById("posts-title");
    const labelEl = document.getElementById("posts-filter-label");
    const emptyEl = document.getElementById("posts-empty");
    const baseTitle = postsList.dataset.baseTitle || "Posts";

    if (titleEl) {
      titleEl.textContent = baseTitle;
    }

    if (labelEl) {
      const parts = [];
      if (majorParam) parts.push(majorParam);
      if (minorParam) parts.push(minorParam);
      if (tagParam) parts.push(`#${tagParam}`);
      if (parts.length > 0) {
        labelEl.textContent = `${totalCount} posts in filter`;
      } else {
        labelEl.textContent = `${totalCount} posts total`;
      }
    }

    if (emptyEl) {
      emptyEl.hidden = totalCount > 0;
    }

    if (paginationEl) {
      paginationEl.innerHTML = "";
      if (totalCount > 0 && totalPages > 1) {
        const base = new URLSearchParams(params.toString());
        base.delete("page");

        function makeLink(label, page, isCurrent = false, disabled = false) {
          const el = document.createElement(isCurrent || disabled ? "span" : "a");
          el.textContent = label;

          if (isCurrent) {
            el.className = "current";
          } else if (disabled) {
            el.className = "disabled";
          } else {
            const p = new URLSearchParams(base.toString());
            p.set("page", String(page));
            el.href = `${window.location.pathname}?${p.toString()}`;
          }
          paginationEl.appendChild(el);
        }

        makeLink("Prev", currentPage - 1, false, currentPage === 1);
        for (let i = 1; i <= totalPages; i += 1) {
          makeLink(String(i), i, i === currentPage, false);
        }
        makeLink("Next", currentPage + 1, false, currentPage === totalPages);
      }
    }
  }

  const searchForm = document.getElementById("search-form");
  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");
  const searchResults = document.getElementById("search-results");
  const searchPageResults = document.getElementById("search-page-results");
  const searchPagePagination = document.getElementById("search-page-pagination");
  const searchPageCount = document.getElementById("search-page-count");
  const searchPageEmpty = document.getElementById("search-page-empty");
  const posts = window.__POST_SEARCH__ || [];
  const fuse = (typeof Fuse !== "undefined" && posts.length > 0)
    ? new Fuse(posts, {
        includeScore: true,
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: 2,
        keys: [
          { name: "title", weight: 0.5 },
          { name: "tags", weight: 0.2 },
          { name: "categories", weight: 0.15 },
          { name: "excerpt", weight: 0.1 },
          { name: "content", weight: 0.05 }
        ]
      })
    : null;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function updateFilterBreadcrumb() {
    const slot = document.getElementById("breadcrumb-filter");
    if (!slot) return;
    const crumbs = [];
    if (majorParam) crumbs.push({ label: majorParam, query: `major=${encodeURIComponent(majorParam)}` });
    if (minorParam) crumbs.push({ label: minorParam, query: `minor=${encodeURIComponent(minorParam)}` });
    if (tagParam) crumbs.push({ label: `#${tagParam}`, query: `tag=${encodeURIComponent(tagParam)}` });
    if (crumbs.length === 0) return;
    slot.innerHTML = crumbs
      .map((c) => `<span>&gt;</span><a href="${window.location.pathname}?${c.query}">${escapeHtml(c.label)}</a>`)
      .join("");
  }

  function renderSearch(items) {
    if (!searchResults) return;
    if (!items || items.length === 0) {
      searchResults.classList.remove("open");
      searchResults.innerHTML = "";
      return;
    }

    searchResults.innerHTML = items.slice(0, 8).map((post) => {
      const excerpt = (post.excerpt || "").slice(0, 64);
      return `<a href="${post.url}" class="search-item"><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(excerpt)}</small></a>`;
    }).join("");
    searchResults.classList.add("open");
  }

  function searchPosts(q) {
    if (!q) return [];
    if (fuse) return fuse.search(q).map((entry) => entry.item);

    const lower = q.toLowerCase();
    return posts.filter((p) => {
      const tags = Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags || "");
      const categories = Array.isArray(p.categories) ? p.categories.join(" ") : (p.categories || "");
      const joined = `${p.title} ${p.excerpt} ${p.content} ${tags} ${categories}`.toLowerCase();
      return joined.includes(lower);
    });
  }

  function renderSearchPage(q) {
    if (!searchPageResults || !searchPageCount || !searchPageEmpty || !searchPagePagination) return;
    searchPageResults.innerHTML = "";
    searchPagePagination.innerHTML = "";

    if (!q) {
      searchPageCount.textContent = "0 posts total";
      searchPageEmpty.hidden = true;
      return;
    }

    const result = searchPosts(q);
    const pageSize = 5;
    const total = result.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    let currentPage = Number(params.get("page") || "1");
    if (Number.isNaN(currentPage) || currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * pageSize;
    const paged = result.slice(start, start + pageSize);

    searchPageCount.textContent = `${total} posts total`;
    searchPageEmpty.hidden = total > 0;

    searchPageResults.innerHTML = paged.map((post) => {
      const safeTitle = escapeHtml(post.title || "");
      const safeExcerpt = escapeHtml((post.excerpt || "").slice(0, 140));
      const safeDate = escapeHtml(post.date || "");
      const safeUrl = escapeHtml(post.url || "");
      const safeSlug = escapeHtml(post.slug || "");
      const categories = Array.isArray(post.categories) ? post.categories : [];
      const major = escapeHtml(categories[0] || "");
      const minor = escapeHtml(categories[1] || "");
      const categoryText = minor ? `${major} / ${minor}` : major;
      return `
        <article class="post-card" data-post-url="${safeUrl}" data-post-slug="${safeSlug}" data-major="${major}" data-minor="${minor}" data-reactions="0" data-views="0">
          <a href="${safeUrl}" class="card-link">
            <h3>${safeTitle}</h3>
            <p>${safeExcerpt}</p>
          </a>
          <p class="card-meta">
            <span>${safeDate}</span>
            <span>&middot;</span>
            <span>${categoryText}</span>
            <span>&middot;</span>
            <span data-reaction-count data-post-url="${safeUrl}" data-post-slug="${safeSlug}">Likes 0</span>
            <span>&middot;</span>
            <span data-view-count data-post-url="${safeUrl}">Views 0</span>
          </p>
        </article>
      `;
    }).join("");

    if (total > 0 && totalPages > 1) {
      const base = new URLSearchParams(window.location.search);
      base.set("q", q);
      base.delete("page");

      function makeLink(label, page, isCurrent = false, disabled = false) {
        const el = document.createElement(isCurrent || disabled ? "span" : "a");
        el.textContent = label;
        if (isCurrent) {
          el.className = "current";
        } else if (disabled) {
          el.className = "disabled";
        } else {
          const p = new URLSearchParams(base.toString());
          p.set("page", String(page));
          el.href = `${window.location.pathname}?${p.toString()}`;
        }
        searchPagePagination.appendChild(el);
      }

      makeLink("Prev", currentPage - 1, false, currentPage === 1);
      for (let i = 1; i <= totalPages; i += 1) {
        makeLink(String(i), i, i === currentPage, false);
      }
      makeLink("Next", currentPage + 1, false, currentPage === totalPages);
    }
  }

  function updateSearchClearVisibility() {
    if (!searchClear || !searchInput) return;
    searchClear.hidden = !searchInput.value.trim();
  }

  searchInput?.addEventListener("input", (e) => {
    const q = e.target.value.trim();
    updateSearchClearVisibility();
    if (!q) {
      renderSearch([]);
      return;
    }
    renderSearch(searchPosts(q));
  });

  searchForm?.addEventListener("submit", (e) => {
    const q = (searchInput?.value || "").trim();
    if (!q) {
      e.preventDefault();
      renderSearch([]);
      return;
    }
    if (searchResults) searchResults.classList.remove("open");
  });

  searchClear?.addEventListener("click", () => {
    if (!searchInput) return;
    searchInput.value = "";
    renderSearch([]);
    updateSearchClearVisibility();
    searchInput.focus();
  });

  document.addEventListener("click", (e) => {
    if (!searchResults || !searchInput) return;
    if (!searchResults.contains(e.target) && e.target !== searchInput) {
      searchResults.classList.remove("open");
    }
  });

  const searchQuery = params.get("q") || "";
  if (searchInput && searchQuery) {
    searchInput.value = searchQuery;
  }
  updateSearchClearVisibility();
  renderSearchPage(searchQuery.trim());

  const postContent = document.querySelector(".post-content");
  const toc = document.getElementById("toc");

  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
  }

  if (postContent && toc) {
    const headings = Array.from(postContent.querySelectorAll("h1, h2, h3, h4, h5, h6"));

    if (headings.length > 0) {
      const list = document.createElement("ul");

      headings.forEach((h, idx) => {
        if (!h.id) {
          h.id = `${slugify(h.textContent)}-${idx}`;
        }
        const lv = Number(h.tagName.replace("H", ""));
        const li = document.createElement("li");
        li.className = `toc-l${lv}`;

        const a = document.createElement("a");
        a.href = `#${h.id}`;
        a.textContent = h.textContent;
        li.appendChild(a);
        list.appendChild(li);
      });

      toc.appendChild(list);

      const linkMap = new Map();
      toc.querySelectorAll("a").forEach((a) => {
        const id = a.getAttribute("href").slice(1);
        linkMap.set(id, a);
      });

      const headerOffset = Math.max(
        80,
        parseInt(getComputedStyle(root).getPropertyValue("--topbar-h"), 10) + 18
      );

      function setActiveByScroll() {
        const targetY = headerOffset;
        let current = headings[0];
        let bestDistance = Number.POSITIVE_INFINITY;

        headings.forEach((h) => {
          const rect = h.getBoundingClientRect();
          const distance = Math.abs(rect.top - targetY);
          if (distance < bestDistance) {
            bestDistance = distance;
            current = h;
          }
        });

        toc.querySelectorAll("a.active").forEach((el) => el.classList.remove("active"));
        const active = linkMap.get(current.id);
        if (active) active.classList.add("active");
      }

      setActiveByScroll();
      document.addEventListener("scroll", setActiveByScroll, { passive: true });
      window.addEventListener("resize", setActiveByScroll);
    }
  }

  updateFilterBreadcrumb();
})();
