import { writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const repoFull = process.env.GITHUB_REPOSITORY || "";
const categoryName = process.env.GISCUS_CATEGORY || "Comments";

if (!token) {
  throw new Error("GITHUB_TOKEN is required.");
}
if (!repoFull.includes("/")) {
  throw new Error("GITHUB_REPOSITORY is invalid.");
}

const [owner, name] = repoFull.split("/");

function normalizePath(value) {
  let raw = String(value || "").trim();
  try {
    raw = new URL(raw).pathname;
  } catch (_) {}
  try {
    raw = decodeURIComponent(raw);
  } catch (_) {}
  if (!raw.startsWith("/")) raw = `/${raw}`;
  if (raw.length > 1) raw = raw.replace(/\/+$/, "");
  return raw.toLowerCase();
}

const POSITIVE_SET = new Set(["THUMBS_UP", "HEART", "HOORAY", "ROCKET", "EYES", "LAUGH"]);
const NEGATIVE_SET = new Set(["THUMBS_DOWN", "CONFUSED"]);

function summarizeReactions(groups) {
  const summary = { positive: 0, negative: 0, score: 0, total: 0 };
  if (!Array.isArray(groups)) return summary;

  groups.forEach((g) => {
    const content = String(g?.content || "");
    const n = Number(g?.users?.totalCount || 0);
    if (!Number.isFinite(n) || n <= 0) return;
    summary.total += n;
    if (POSITIVE_SET.has(content)) summary.positive += n;
    if (NEGATIVE_SET.has(content)) summary.negative += n;
  });

  summary.score = summary.positive - summary.negative;
  return summary;
}

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

const query = `
  query($owner: String!, $name: String!, $after: String) {
    repository(owner: $owner, name: $name) {
      discussions(first: 100, after: $after) {
        nodes {
          number
          updatedAt
          title
          category { name }
          reactionGroups {
            content
            users { totalCount }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

let after = null;
const map = new Map();

while (true) {
  const data = await gql(query, { owner, name, after });
  const page = data?.repository?.discussions;
  const nodes = page?.nodes || [];

  nodes.forEach((d) => {
    if (!d || !d.title) return;
    if ((d.category?.name || "") !== categoryName) return;
    const key = normalizePath(d.title);
    const summary = summarizeReactions(d.reactionGroups);
    const prev = map.get(key);

    if (!prev) {
      map.set(key, {
        updatedAt: d.updatedAt || "",
        number: Number(d.number || 0),
        summary
      });
      return;
    }

    const prevUpdated = String(prev.updatedAt || "");
    const nextUpdated = String(d.updatedAt || "");
    const prevNumber = Number(prev.number || 0);
    const nextNumber = Number(d.number || 0);

    if (nextUpdated > prevUpdated || (nextUpdated === prevUpdated && nextNumber > prevNumber)) {
      map.set(key, {
        updatedAt: nextUpdated,
        number: nextNumber,
        summary
      });
    }
  });

  if (!page?.pageInfo?.hasNextPage) break;
  after = page.pageInfo.endCursor;
}

const out = {};
Array.from(map.entries())
  .sort((a, b) => a[0].localeCompare(b[0]))
  .forEach(([k, v]) => {
    out[k] = v.summary;
  });

await writeFile("assets/data/reactions.json", `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(`Updated assets/data/reactions.json with ${Object.keys(out).length} entries.`);
