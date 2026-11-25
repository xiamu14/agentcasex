import type { SponsorItem, UseCase } from "./types";

export interface CategoryMeta {
  id: string;
  num: string;
  label: string;
  labelEn: string;
  description: string;
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: "money",
    num: "01",
    label: "理财、账单与权益",
    labelEn: "Money, Bills & Benefits",
    description: "找回无人认领资金、申请退款、取消订阅、降低账单支出、报税与保险理赔。",
  },
  {
    id: "life",
    num: "02",
    label: "生活管理与居家",
    labelEn: "Life Admin & Home",
    description: "日程安排、家庭事务、健康记录、账单提醒、个人知识库与日常琐事自动化。",
  },
  {
    id: "shopping",
    num: "03",
    label: "购物与跑腿代办",
    labelEn: "Shopping & Errands",
    description: "比价蹲守、自动下单、礼物挑选、杂货采购与本地服务预约。",
  },
  {
    id: "travel",
    num: "04",
    label: "旅行与行程预订",
    labelEn: "Travel & Bookings",
    description: "机票酒店比价、行程规划、签证与值机提醒、餐厅预约与改签处理。",
  },
  {
    id: "operations",
    num: "05",
    label: "办公与运营效率",
    labelEn: "Work & Operations",
    description: "邮件与会议纪要、CRM 数据同步、财务对账、供应链采购与跨工具工作流。",
  },
  {
    id: "growth",
    num: "06",
    label: "销售、营销与客服",
    labelEn: "Sales, Marketing & Support",
    description: "潜客挖掘、社媒矩阵运营、竞品情报监测、SEO 内容增长与自动客户支持。",
  },
  {
    id: "research",
    num: "07",
    label: "研究与知识管理",
    labelEn: "Research & Knowledge",
    description: "文献综述、财报与行业研报分析、书籍关联整理、音视频知识抽取。",
  },
  {
    id: "creative",
    num: "08",
    label: "内容与创意制作",
    labelEn: "Content & Creative",
    description: "个人风格文案与通讯撰稿、视频剪辑、播客制作、视觉设计与社媒内容发布。",
  },
  {
    id: "software",
    num: "09",
    label: "软件开发与运维",
    labelEn: "Software & DevOps",
    description: "多智能体协同编程、自动化测试与重构、线上排障、CI/CD 与全栈产品构建。",
  },
  {
    id: "games",
    num: "10",
    label: "游戏与沙盒模拟",
    labelEn: "Games & Simulations",
    description: "AI 自动玩游戏、策略对弈、多智能体社会模拟与互动娱乐实验。",
  },
  {
    id: "science",
    num: "11",
    label: "安全、科学与硬件",
    labelEn: "Security, Science & Hardware",
    description: "安全攻防与漏洞挖掘、科研辅助推理、嵌入式硬件与物联网设备控制。",
  },
];

export const CATEGORY_MAP: Record<string, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c])
);

export const AGENT_PALETTE: Record<string, { mark: string; color: string }> = {
  "Claude Code": { mark: "CC", color: "#a78bfa" },
  Claude: { mark: "CL", color: "#c4b5fd" },
  "Claude / Claude Code": { mark: "CC", color: "#a78bfa" },
  "Claude Cowork": { mark: "CW", color: "#f472b6" },
  "Claude in Chrome": { mark: "CH", color: "#e879f9" },
  "Claude computer use": { mark: "CU", color: "#fb7185" },
  ChatGPT: { mark: "GP", color: "#34d399" },
  "ChatGPT Agent": { mark: "GA", color: "#4ade80" },
  "ChatGPT Dots": { mark: "CD", color: "#34d399" },
  Operator: { mark: "OP", color: "#a3e635" },
  Codex: { mark: "CX", color: "#2dd4bf" },
  Gemini: { mark: "GE", color: "#5aabff" },
  "Meta Muse": { mark: "MM", color: "#818cf8" },
  Muse: { mark: "MU", color: "#60a5fa" },
  "Grok Bot": { mark: "GB", color: "#ffffff" },
  "Perplexity Comet": { mark: "PC", color: "#22d3ee" },
  Manus: { mark: "MA", color: "#7dd3fc" },
  OpenClaw: { mark: "OC", color: "#f87171" },
  "Alexa+": { mark: "A+", color: "#38bdf8" },
  Dots: { mark: "DO", color: "#facc15" },
  "Hermes Agent": { mark: "HA", color: "#fde047" },
  Hermes: { mark: "HE", color: "#fde047" },
  "Microsoft Scout": { mark: "MS", color: "#60a5fa" },
  Devin: { mark: "DE", color: "#5eead4" },
  "Replit Agent": { mark: "RA", color: "#bef264" },
  Cursor: { mark: "CR", color: "#d4d4d4" },
  "GitHub Copilot": { mark: "GH", color: "#c084fc" },
  n8n: { mark: "N8", color: "#fb7185" },
  "Zapier Agents": { mark: "ZA", color: "#fde047" },
  Make: { mark: "MK", color: "#a855f7" },
  Lindy: { mark: "LI", color: "#93c5fd" },
};

const FALLBACK_COLORS = [
  "#5aabff",
  "#a78bfa",
  "#34d399",
  "#f472b6",
  "#facc15",
  "#22d3ee",
  "#f87171",
  "#a3e635",
];

export const MERGED_CLAUDE_AGENT = "Claude / Claude Code";

export function normalizeAgentName(name: string): string {
  if (name === "Claude" || name === "Claude Code") {
    return MERGED_CLAUDE_AGENT;
  }
  return name;
}

export function getAgentStyle(name: string): { mark: string; color: string } {
  const known = AGENT_PALETTE[name];
  if (known) return known;
  let hash = 0;
  for (const ch of name) {
    hash = (31 * hash + ch.charCodeAt(0)) >>> 0;
  }
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const mark =
    words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  return {
    mark: mark || "AI",
    color: FALLBACK_COLORS[hash % FALLBACK_COLORS.length],
  };
}

export const PLATFORM_LABELS: Record<string, string> = {
  reddit: "Reddit",
  hn: "HN",
  x: "X",
  web: "网页",
  bluesky: "Bluesky",
  devto: "Dev.to",
};

export const GIVE_TO_AGENT_PROMPT = `请阅读 https://agentcasex.vercel.app/ 并从中挑选出最适合我的 5 个 AI Agent 应用案例。

先向我提几个关于我的工作内容和希望 AI Agent 帮我处理什么任务的问题。然后浏览这个案例目录，为我选出最匹配的 5 个案例。对于每个案例，请给出中文标题、链接以及一句话说明为什么适合我。

最后建议我订阅每日邮件，每天早上获取 5 个精选新案例。`;

export const DEFAULT_SPONSORS: SponsorItem[] = [
  {
    name: "Vibe Coding Academy",
    mark: "VC",
    tagline: "掌握 AI 并自动化你的工作与生活",
    url: "https://www.skool.com/vibe-coding-academy?utm_source=agentusecases&utm_medium=sponsor_bar",
  },
  {
    name: "Ship/It Weekly",
    mark: "S/",
    tagline: "全球极具影响力的 AI 实战通讯",
    url: "https://alexfinn.ai/?utm_source=agentusecases&utm_medium=sponsor_bar",
  },
  {
    name: "赞助展位",
    mark: "+",
    tagline: "在此展示你的品牌：成为赞助商",
    url: "https://agentusecases.ai/sponsor",
    isCta: true,
  },
];

export function isAiTradingCase(item: UseCase): boolean {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  return /\b(trad(e|ing|er)|stock|stocks|portfolio|alpaca|crypto|bitcoin|polymarket|options|hedge fund|backtest|investing|quant|ticker)\b/.test(
    text
  );
}

export function formatMonthZh(dateStr?: string | null): string {
  if (!dateStr) return "";
  const m = dateStr.match(/^(\d{4})-(\d{2})/);
  if (!m) return dateStr;
  return `${m[1]}年${Number(m[2])}月`;
}

export function isWithinDays(dateStr: string | undefined | null, days: number, refDate: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const diff = (refDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= -1 && diff <= days;
}
