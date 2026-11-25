import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const UPSTREAM = "https://agentusecases.ai";
const KV_NAMESPACE_ID = "8badd0e7a93547b5976f7bdbb7a168b2";
const CACHE_DIR = path.resolve(process.cwd(), ".cache");
fs.mkdirSync(CACHE_DIR, { recursive: true });

const transFile = path.join(CACHE_DIR, "translations.json");
let translationsMap = {};
try {
  if (fs.existsSync(transFile)) {
    translationsMap = JSON.parse(fs.readFileSync(transFile, "utf-8"));
  }
} catch {}

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

async function translateGoogle(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(
    text
  )}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.[0])) throw new Error("Invalid response");
  return data[0].map((s) => s[0] || "").join("");
}

async function main() {
  console.log("[seed] Fetching upstream catalog, trending, votes...");
  const [catRes, trendRes, votesRes] = await Promise.all([
    fetch(`${UPSTREAM}/api/catalog`, { signal: AbortSignal.timeout(15000) }),
    fetch(`${UPSTREAM}/api/trending`, { signal: AbortSignal.timeout(15000) }),
    fetch(`${UPSTREAM}/api/votes`, { signal: AbortSignal.timeout(15000) }),
  ]);
  const catalog = await catRes.json();
  const trending = trendRes.ok ? await trendRes.json() : { items: [] };
  const votes = votesRes.ok ? await votesRes.json() : {};

  // Collect all missing texts
  const missing = [];
  const seen = new Set();
  const addText = (t) => {
    if (!t) return;
    const s = String(t).trim();
    if (!s || hasChinese(s) || translationsMap[s] || seen.has(s)) return;
    seen.add(s);
    missing.push(s);
  };

  for (const t of trending.items || []) {
    addText(t?.usecase?.title);
    addText(t?.usecase?.summary);
  }
  for (const item of catalog) {
    addText(item.title);
    addText(item.summary);
  }

  console.log(
    `[seed] Total catalog: ${catalog.length}, already translated: ${Object.keys(translationsMap).length}, remaining: ${missing.length}`
  );

  // Batch translate missing texts
  const SEP = "\n|||AUCSEP|||\n";
  const chunks = [];
  let cur = [];
  let curLen = 0;
  for (const m of missing) {
    if (cur.length >= 10 || curLen + m.length > 1500) {
      if (cur.length) chunks.push(cur);
      cur = [m];
      curLen = m.length;
    } else {
      cur.push(m);
      curLen += m.length + SEP.length;
    }
  }
  if (cur.length) chunks.push(cur);

  let doneCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    const group = chunks[i];
    const joined = group.join(SEP);
    let parts = null;
    try {
      const resText = await translateGoogle(joined);
      const split = resText.split(/\s*\|{2,3}\s*AUCSEP\s*\|{2,3}\s*/i);
      if (split.length === group.length) {
        parts = split.map((s) => s.trim());
      }
    } catch {}

    if (!parts) {
      parts = [];
      for (const item of group) {
        try {
          parts.push(await translateGoogle(item));
        } catch {
          parts.push(item);
        }
      }
    }

    group.forEach((orig, idx) => {
      const zh = parts[idx];
      if (zh && zh !== orig) {
        translationsMap[orig] = zh;
      }
    });

    doneCount += group.length;
    if ((i + 1) % 20 === 0 || i === chunks.length - 1) {
      fs.writeFileSync(transFile, JSON.stringify(translationsMap, null, 2));
      console.log(`[seed] Translated ${doneCount}/${missing.length}...`);
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  // Build pure-Chinese payloads
  const catalogZh = catalog.map((item) => ({
    ...item,
    title: translationsMap[item.title?.trim()] || item.title,
    summary: translationsMap[item.summary?.trim()] || item.summary,
  }));

  const trendingZh = {
    items: (trending.items || []).map((t) => ({
      ...t,
      usecase: {
        ...t.usecase,
        title: translationsMap[t.usecase.title?.trim()] || t.usecase.title,
        summary: translationsMap[t.usecase.summary?.trim()] || t.usecase.summary,
      },
    })),
  };

  const syncStatus = {
    enabled: true,
    intervalMinutes: 30,
    syncing: false,
    lastSyncAt: new Date().toISOString(),
    nextSyncAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    lastError: null,
    itemCount: catalogZh.length,
    translatedCount: Object.keys(translationsMap).length,
    source: "cloudflare-worker",
  };

  const kvPairs = [
    ["translations", translationsMap],
    ["catalog_zh", catalogZh],
    ["trending_zh", trendingZh],
    ["votes", votes],
    ["sync_status", syncStatus],
  ];

  for (const [key, val] of kvPairs) {
    const tmpPath = path.join(CACHE_DIR, `cf_${key}.json`);
    fs.writeFileSync(tmpPath, JSON.stringify(val), "utf-8");
    console.log(`[seed] Uploading KV key "${key}" (${(fs.statSync(tmpPath).size / 1024).toFixed(1)} KB)...`);
    execFileSync(
      "cf",
      ["kv", "keys", "put", "--namespace-id", KV_NAMESPACE_ID, key, "--file", tmpPath],
      { stdio: "inherit" }
    );
  }

  console.log("[seed] All KV keys seeded successfully!");
}

main().catch((err) => {
  console.error("[seed] Error:", err);
  process.exitCode = 1;
});
