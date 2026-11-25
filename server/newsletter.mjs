import crypto from "node:crypto";

const SITE_URL = process.env.SITE_URL || "https://agentcasex.vercel.app";
const DEFAULT_FROM = process.env.RESEND_FROM || "agentcasex.ai <onboarding@resend.dev>";

function getSecret() {
  return (
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.RESEND_API_KEY ||
    "agentcasex-dev-secret"
  );
}

export function createUnsubscribeToken(email) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(String(email).trim().toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

export function verifyUnsubscribeToken(email, token) {
  const expected = createUnsubscribeToken(email);
  return typeof token === "string" && token === expected;
}

export function buildUnsubscribeUrl(email) {
  const clean = String(email).trim().toLowerCase();
  const token = createUnsubscribeToken(clean);
  return `${SITE_URL}/api/unsubscribe?email=${encodeURIComponent(clean)}&token=${token}`;
}

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID);
}

async function resendRequest(endpoint, options = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const res = await fetch(`https://api.resend.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(12000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `Resend HTTP ${res.status}`);
  }
  return data;
}

export async function addSubscriberToResend(email) {
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const clean = String(email).trim().toLowerCase();
  const contact = await resendRequest(`/audiences/${audienceId}/contacts`, {
    method: "POST",
    body: JSON.stringify({ email: clean, unsubscribed: false }),
  });

  // Send a welcome email on new subscription (best-effort)
  const unsubUrl = buildUnsubscribeUrl(clean);
  await resendRequest("/emails", {
    method: "POST",
    body: JSON.stringify({
      from: DEFAULT_FROM,
      to: [clean],
      subject: "欢迎订阅 agentcasex.ai 每日 AI Agent 精选",
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;line-height:1.65;">
          <h2 style="margin:0 0 12px;font-size:20px;">欢迎订阅 agentcasex.ai 每日精选</h2>
          <p style="margin:0 0 14px;color:#444;">从明天开始，每天早上 8:00 你都会收到 5 个真实可落地的 AI Agent 应用案例，每个案例均附带可直接复用的提示词。</p>
          <p style="margin:20px 0;">
            <a href="${SITE_URL}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">浏览全部 AI Agent 案例 →</a>
          </p>
          <hr style="border:none;border-top:1px dashed #d4d4d4;margin:24px 0;" />
          <p style="font-size:12px;color:#737373;margin:0;">
            不想继续接收？<a href="${unsubUrl}" style="color:#737373;">点击这里一键退订</a>
          </p>
        </div>
      `,
    }),
  }).catch((err) => {
    console.warn("[resend] welcome email skipped:", err.message);
  });

  return contact;
}

export async function unsubscribeFromResend(email) {
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const clean = String(email).trim().toLowerCase();
  return resendRequest(
    `/audiences/${audienceId}/contacts/${encodeURIComponent(clean)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ unsubscribed: true }),
    }
  );
}

export async function listActiveSubscribersFromResend() {
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const data = await resendRequest(`/audiences/${audienceId}/contacts`, {
    method: "GET",
  });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.filter((c) => !c.unsubscribed && c.email).map((c) => c.email);
}

export function buildDailyDigestHtml({ items, dateLabel, unsubscribeUrl }) {
  const rowsHtml = items
    .map((item, idx) => {
      const link = `${SITE_URL}/use-case/${encodeURIComponent(item.id)}`;
      const agents = (item.agents || []).join(" · ") || "AI Agent";
      return `
        <tr>
          <td style="padding:18px 0;border-bottom:1px dashed #d4d4d4;">
            <div style="font-size:11px;color:#6b6b6b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin-bottom:6px;">
              0${idx + 1} · ${agents}
            </div>
            <a href="${link}" style="display:block;font-size:16px;font-weight:700;color:#000;text-decoration:none;line-height:1.4;margin-bottom:6px;">
              ${item.title}
            </a>
            <p style="margin:0 0 10px;font-size:14px;color:#525252;line-height:1.6;">
              ${item.summary}
            </p>
            <a href="${link}" style="font-size:12.5px;font-weight:600;color:#0b63ce;text-decoration:none;">
              查看完整实践与提示词 →
            </a>
          </td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d4d4d4;border-radius:14px;padding:28px;">
            <tr>
              <td style="padding-bottom:16px;border-bottom:1px dashed #d4d4d4;">
                <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:0.12em;color:#6b6b6b;text-transform:uppercase;">
                  AGENTCASEX.AI · 每日精选 (${dateLabel})
                </div>
                <h1 style="margin:8px 0 6px;font-size:22px;color:#000;line-height:1.3;">
                  今天人们在用 AI Agent 做的 5 件真实事情
                </h1>
                <p style="margin:0;font-size:13.5px;color:#525252;">
                  每个案例均附带可复用的提示词与原帖来源。
                </p>
              </td>
            </tr>

            ${rowsHtml}

            <tr>
              <td style="padding-top:22px;text-align:center;">
                <a href="${SITE_URL}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600;">
                  去 agentcasex.ai 探索全部案例
                </a>
                <p style="margin:18px 0 0;font-size:12px;color:#737373;">
                  收到此邮件是因为你订阅了 agentcasex.ai 每日精选。
                  <a href="${unsubscribeUrl}" style="color:#737373;text-decoration:underline;">一键退订</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendDigestBatch(emailsPayload) {
  const results = [];
  for (let i = 0; i < emailsPayload.length; i += 100) {
    const chunk = emailsPayload.slice(i, i + 100);
    const res = await resendRequest("/emails/batch", {
      method: "POST",
      body: JSON.stringify(
        chunk.map((item) => ({
          from: DEFAULT_FROM,
          to: [item.to],
          subject: item.subject,
          html: item.html,
        }))
      ),
    });
    results.push(res);
  }
  return results;
}
