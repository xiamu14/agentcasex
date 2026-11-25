import fs from "node:fs";
import path from "node:path";
import {
  buildDailyDigestHtml,
  buildUnsubscribeUrl,
  isResendConfigured,
  listActiveSubscribersFromResend,
  sendDigestBatch,
} from "../server/newsletter.mjs";

const UPSTREAM = "https://agentusecases.ai";
const previewMode = process.argv.includes("--preview");

async function translateText(text) {
  if (!text || /[\u4e00-\u9fff]/.test(text)) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(
      text
    )}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return text;
    const data = await res.json();
    if (!Array.isArray(data?.[0])) return text;
    return data[0].map((seg) => seg[0] || "").join("") || text;
  } catch {
    return text;
  }
}

async function main() {
  const [catRes, trendRes] = await Promise.all([
    fetch(`${UPSTREAM}/api/catalog`, { signal: AbortSignal.timeout(15000) }),
    fetch(`${UPSTREAM}/api/trending`, { signal: AbortSignal.timeout(15000) }),
  ]);
  if (!catRes.ok) throw new Error(`Catalog HTTP ${catRes.status}`);

  const catalog = await catRes.json();
  const trending = trendRes.ok ? await trendRes.json() : { items: [] };

  // Pick 5 fresh/trending items without duplicates
  const picked = [];
  const seen = new Set();

  for (const t of trending?.items || []) {
    if (picked.length >= 2) break;
    const uc = t?.usecase;
    if (uc?.id && !seen.has(uc.id)) {
      seen.add(uc.id);
      picked.push(uc);
    }
  }

  const sortedNewest = [...(Array.isArray(catalog) ? catalog : [])].sort((a, b) =>
    (b.addedAt || "").localeCompare(a.addedAt || "")
  );
  for (const item of sortedNewest) {
    if (picked.length >= 5) break;
    if (item?.id && !seen.has(item.id)) {
      seen.add(item.id);
      picked.push(item);
    }
  }

  const zhItems = [];
  for (const item of picked) {
    const [title, summary] = await Promise.all([
      translateText(item.title),
      translateText(item.summary),
    ]);
    zhItems.push({
      id: item.id,
      title,
      summary,
      agents: item.agents?.labels?.length ? item.agents.labels : item.tools || [],
    });
  }

  const todayLabel = new Date().toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
  });
  const subject = `【Agent 晨报 ${todayLabel}】${zhItems[0]?.title || "今日 5 个精选 AI Agent 用例"}`;

  if (previewMode || !isResendConfigured()) {
    const cacheDir = path.resolve(process.cwd(), ".cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const previewFile = path.join(cacheDir, "digest-preview.html");
    const html = buildDailyDigestHtml({
      items: zhItems,
      dateLabel: todayLabel,
      unsubscribeUrl: buildUnsubscribeUrl("preview@example.com"),
    });
    fs.writeFileSync(previewFile, html, "utf-8");
    console.log(`[digest] Preview saved to ${previewFile}`);
    console.log(`[digest] Subject: ${subject}`);
    if (!previewMode) {
      console.log("[digest] RESEND_API_KEY / RESEND_AUDIENCE_ID not set; skipped sending.");
    }
    return;
  }

  const subscribers = await listActiveSubscribersFromResend();
  console.log(`[digest] Active subscribers: ${subscribers.length}`);
  if (subscribers.length === 0) return;

  const payloads = subscribers.map((email) => ({
    to: email,
    subject,
    html: buildDailyDigestHtml({
      items: zhItems,
      dateLabel: todayLabel,
      unsubscribeUrl: buildUnsubscribeUrl(email),
    }),
  }));

  await sendDigestBatch(payloads);
  console.log(`[digest] Sent ${payloads.length} emails successfully.`);
}

main().catch((err) => {
  console.error("[digest] Error:", err);
  process.exitCode = 1;
});
