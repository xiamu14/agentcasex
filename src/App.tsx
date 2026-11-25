import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_MAP,
  MERGED_CLAUDE_AGENT,
  isAiTradingCase,
  isWithinDays,
  normalizeAgentName,
} from "./constants";
import type {
  SortMode,
  SpecialView,
  SyncStatus,
  TimeFilter,
  TrendingItem,
  UseCase,
} from "./types";
import { useTranslator } from "./hooks/useTranslator";
import { Sidebar } from "./components/Sidebar";
import { TrendingSection } from "./components/TrendingSection";
import { UseCaseRow } from "./components/UseCaseRow";
import { DetailModal } from "./components/DetailModal";
import {
  AboutModal,
  SubmitModal,
  SubscribeModal,
} from "./components/ActionModals";

function readLocalSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function writeLocalSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {}
}

export default function App() {
  const [catalog, setCatalog] = useState<UseCase[]>([]);
  const [trending, setTrending] = useState<TrendingItem[]>([]);
  const [votesMap, setVotesMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const lastSyncRef = useRef<string | null>(null);

  // Theme
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("auc-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  });

  // Filters & navigation
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("new");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [specialView, setSpecialView] = useState<SpecialView>("none");
  const [visibleLimit, setVisibleLimit] = useState(30);

  // User local state
  const [votedIds, setVotedIds] = useState<Set<string>>(() =>
    readLocalSet("auc-voted")
  );
  const [savedIds, setSavedIds] = useState<Set<string>>(() =>
    readLocalSet("auc-saved")
  );

  // Modals
  const [activeItem, setActiveItem] = useState<UseCase | null>(null);
  const [pendingDetailItem, setPendingDetailItem] = useState<UseCase | null>(null);
  const [subscribeSource, setSubscribeSource] = useState<string>("sidebar");
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    const main = mainRef.current;
    if (!toolbar || !main) return;
    const updateHeight = () => {
      main.style.setProperty("--toolbar-h", `${toolbar.offsetHeight}px`);
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(toolbar);
    return () => ro.disconnect();
  }, []);

  const {
    tr,
    trSync,
    queueTranslate,
    translateNow,
    showOriginal,
    toggleLanguage,
    translating,
  } = useTranslator();

  // Sync theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("auc-theme", theme);
    } catch {}
  }, [theme]);

  // Load upstream data via local proxy
  const loadData = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const qs = force ? "?refresh=1" : "";
    try {
      const [catRes, trendRes, votesRes] = await Promise.all([
        fetch(`/api/catalog${qs}`),
        fetch(`/api/trending${qs}`),
        fetch(`/api/votes${qs}`),
      ]);
      if (!catRes.ok) throw new Error(`目录加载失败 (${catRes.status})`);

      const [catData, trendData, votesData] = await Promise.all([
        catRes.json(),
        trendRes.ok ? trendRes.json() : { items: [] },
        votesRes.ok ? votesRes.json() : {},
      ]);

      const trendItems: TrendingItem[] = Array.isArray(trendData?.items)
        ? trendData.items
        : [];
      const mergedVotes: Record<string, number> =
        votesData && typeof votesData === "object"
          ? { ...(votesData as Record<string, number>) }
          : {};
      for (const t of trendItems) {
        if (t?.usecase?.id && typeof t.votes === "number") {
          mergedVotes[t.usecase.id] = Math.max(
            mergedVotes[t.usecase.id] || 0,
            t.votes
          );
        }
      }

      setCatalog(Array.isArray(catData) ? catData : []);
      setTrending(trendItems);
      setVotesMap(mergedVotes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "数据加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Poll backend auto-sync status every 60s and silently refresh UI when new data arrives
  useEffect(() => {
    let active = true;
    async function checkSync() {
      try {
        const res = await fetch("/api/sync-status");
        if (!res.ok || !active) return;
        const st: SyncStatus = await res.json();
        setSyncStatus(st);
        if (st.lastSyncAt && lastSyncRef.current && st.lastSyncAt !== lastSyncRef.current) {
          loadData(false);
        }
        if (st.lastSyncAt) {
          lastSyncRef.current = st.lastSyncAt;
        }
      } catch {}
    }
    checkSync();
    const timer = window.setInterval(checkSync, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadData]);

  const handleManualSync = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/sync-now", { method: "POST" });
      if (res.ok) {
        const st: SyncStatus = await res.json();
        setSyncStatus(st);
        if (st.lastSyncAt) lastSyncRef.current = st.lastSyncAt;
      }
      await loadData(false);
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  // Support direct /use-case/:id URL & browser back/forward
  useEffect(() => {
    if (catalog.length === 0) return;
    function syncFromUrl() {
      const m = window.location.pathname.match(/^\/use-case\/([^/]+)/);
      if (m) {
        const found = catalog.find((c) => c.id === decodeURIComponent(m[1]));
        if (found) setActiveItem(found);
      } else {
        setActiveItem(null);
      }
    }
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [catalog]);

  // Keyboard shortcuts: Cmd+K / Ctrl+K / "/"
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (activeItem || subscribeOpen || submitOpen || aboutOpen) return;
      const inInput =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement;
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !inInput)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeItem, subscribeOpen, submitOpen, aboutOpen]);

  // Reference date based on latest addedAt in catalog so "Today" / "New this week" always stay accurate
  const refDate = useMemo(() => {
    let maxStr = "";
    for (const c of catalog) {
      if (c.addedAt && c.addedAt > maxStr) maxStr = c.addedAt;
    }
    return maxStr ? new Date(maxStr) : new Date();
  }, [catalog]);

  const latestDateStr = useMemo(() => {
    let maxStr = "";
    for (const c of catalog) {
      if (c.addedAt && c.addedAt > maxStr) maxStr = c.addedAt;
    }
    return maxStr;
  }, [catalog]);

  const todayCount = useMemo(
    () => catalog.filter((c) => c.addedAt === latestDateStr).length,
    [catalog, latestDateStr]
  );

  const weekCount = useMemo(
    () => catalog.filter((c) => isWithinDays(c.addedAt, 7, refDate)).length,
    [catalog, refDate]
  );

  const aiTradingCount = useMemo(
    () => catalog.filter(isAiTradingCase).length,
    [catalog]
  );

  // Agent counts (sorted descending, merging Claude & Claude Code, placing "Other or custom" at the end)
  const agentCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of catalog) {
      const seen = new Set<string>();
      for (const ag of item.agents?.filter || []) {
        seen.add(normalizeAgentName(ag));
      }
      for (const ag of seen) {
        map.set(ag, (map.get(ag) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        const aOther = a.name.toLowerCase().includes("other");
        const bOther = b.name.toLowerCase().includes("other");
        if (aOther && !bOther) return 1;
        if (!aOther && bOther) return -1;
        return b.count - a.count;
      });
  }, [catalog]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of catalog) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [catalog]);

  // Score helper for sorting
  const getVotes = useCallback(
    (id: string) => votesMap[id] || 0,
    [votesMap]
  );

  // Filtered & sorted list
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();

    let list = catalog.filter((item) => {
      if (specialView === "saved" && !savedIds.has(item.id)) return false;
      if (specialView === "collection:ai-trading" && !isAiTradingCase(item)) {
        return false;
      }
      if (timeFilter === "today" && item.addedAt !== latestDateStr) return false;
      if (timeFilter === "week" && !isWithinDays(item.addedAt, 7, refDate)) {
        return false;
      }
      if (selectedCategory && item.category !== selectedCategory) return false;
      if (selectedAgent) {
        if (selectedAgent === "Custom agent") {
          if (item.agents?.known) return false;
        } else if (selectedAgent === MERGED_CLAUDE_AGENT) {
          const allAgents = [
            ...(item.agents?.filter || []),
            ...(item.tools || []),
          ];
          if (!allAgents.includes("Claude") && !allAgents.includes("Claude Code")) {
            return false;
          }
        } else if (
          !(item.agents?.filter || []).includes(selectedAgent) &&
          !(item.tools || []).includes(selectedAgent)
        ) {
          return false;
        }
      }
      if (q) {
        const hay = [
          item.title,
          item.summary,
          trSync(item.title),
          trSync(item.summary),
          ...(item.tools || []),
          CATEGORY_MAP[item.category]?.label || "",
          item.source?.platform || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (a.isLocal && !b.isLocal) return -1;
      if (!a.isLocal && b.isLocal) return 1;
      if (sort === "new") {
        const dCmp = (b.addedAt || "").localeCompare(a.addedAt || "");
        if (dCmp !== 0) return dCmp;
        return (b.source?.date || "").localeCompare(a.source?.date || "");
      }
      const vDiff = getVotes(b.id) - getVotes(a.id);
      if (vDiff !== 0) return vDiff;
      const aDiff = (b.accounts || 1) - (a.accounts || 1);
      if (aDiff !== 0) return aDiff;
      return (b.addedAt || "").localeCompare(a.addedAt || "");
    });

    return list;
  }, [
    catalog,
    query,
    sort,
    timeFilter,
    selectedAgent,
    selectedCategory,
    specialView,
    savedIds,
    latestDateStr,
    refDate,
    getVotes,
    trSync,
  ]);

  // Unfiltered homepage check
  const isDefaultHome =
    !query.trim() &&
    timeFilter === "all" &&
    !selectedAgent &&
    !selectedCategory &&
    specialView === "none";

  // Grouped mode when user explicitly switches to "热门" on unfiltered homepage
  const isGroupedHome = isDefaultHome && sort === "top";

  const latestPreview = useMemo(() => {
    if (!isGroupedHome) return [];
    return [...catalog]
      .sort((a, b) => {
        if (a.isLocal && !b.isLocal) return -1;
        if (!a.isLocal && b.isLocal) return 1;
        return (b.addedAt || "").localeCompare(a.addedAt || "");
      })
      .slice(0, 5);
  }, [catalog, isGroupedHome]);

  const groupedSections = useMemo(() => {
    if (!isGroupedHome) return [];
    return CATEGORIES.map((cat) => {
      const items = filteredItems
        .filter((it) => it.category === cat.id)
        .slice(0, 5);
      return { cat, items };
    }).filter((sec) => sec.items.length > 0);
  }, [isGroupedHome, filteredItems]);

  const displayedFlatItems = useMemo(() => {
    if (isGroupedHome) return [];
    return filteredItems.slice(0, visibleLimit);
  }, [isGroupedHome, filteredItems, visibleLimit]);

  // Trigger batch translation for visible cards automatically (prioritize current view)
  useEffect(() => {
    if (showOriginal) return;
    const visible = isGroupedHome
      ? [
          ...latestPreview,
          ...groupedSections.flatMap((s) => s.items),
        ]
      : displayedFlatItems;

    if (visible.length > 0) {
      const texts: string[] = [];
      for (const it of visible) {
        texts.push(it.title, it.summary);
      }
      queueTranslate(texts, { replacePending: true });
    }
  }, [
    showOriginal,
    isGroupedHome,
    latestPreview,
    groupedSections,
    displayedFlatItems,
    queueTranslate,
  ]);

  // Handlers
  function openDetailDirect(item: UseCase) {
    setActiveItem(item);
    try {
      const nextPath = `/use-case/${item.id}`;
      if (window.location.pathname !== nextPath) {
        window.history.pushState({ aucDetail: true }, "", nextPath);
      }
    } catch {}
  }

  function openDetail(item: UseCase) {
    try {
      const openedOne = localStorage.getItem("auc-opened-one") === "1";
      const prompted = localStorage.getItem("auc-signup-prompted") === "1";
      const subscribed = localStorage.getItem("auc-subscribed") === "1";
      if (openedOne && !prompted && !subscribed) {
        localStorage.setItem("auc-signup-prompted", "1");
        setPendingDetailItem(item);
        setSubscribeSource("detail_gate");
        setSubscribeOpen(true);
        return;
      }
      if (!openedOne) {
        localStorage.setItem("auc-opened-one", "1");
      }
    } catch {}
    openDetailDirect(item);
  }

  function closeDetail() {
    setActiveItem(null);
    try {
      if (window.location.pathname.startsWith("/use-case/")) {
        window.history.pushState({}, "", "/");
      }
    } catch {}
  }

  function handleVote(id: string) {
    const isNowVoted = !votedIds.has(id);
    const nextVoted = new Set(votedIds);
    if (isNowVoted) nextVoted.add(id);
    else nextVoted.delete(id);
    setVotedIds(nextVoted);
    writeLocalSet("auc-voted", nextVoted);

    setVotesMap((prev) => ({
      ...prev,
      [id]: Math.max(0, (prev[id] || 0) + (isNowVoted ? 1 : -1)),
    }));

    fetch("/api/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, on: isNowVoted }),
    }).catch(() => {});
  }

  function handleSave(id: string) {
    const nextSaved = new Set(savedIds);
    if (nextSaved.has(id)) nextSaved.delete(id);
    else nextSaved.add(id);
    setSavedIds(nextSaved);
    writeLocalSet("auc-saved", nextSaved);
  }

  function resetAllFilters() {
    setQuery("");
    setSort("new");
    setTimeFilter("all");
    setSelectedAgent(null);
    setSelectedCategory(null);
    setSpecialView("none");
    setVisibleLimit(30);
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Prev/Next in detail modal
  const activeList = isGroupedHome
    ? [...latestPreview, ...groupedSections.flatMap((s) => s.items)]
    : filteredItems;
  const activeIdx = activeItem
    ? activeList.findIndex((it) => it.id === activeItem.id)
    : -1;
  const prevItem = activeIdx > 0 ? activeList[activeIdx - 1] : null;
  const nextItem =
    activeIdx >= 0 && activeIdx < activeList.length - 1
      ? activeList[activeIdx + 1]
      : null;

  return (
    <div className="min-h-full">
      <div className="frame mx-auto flex max-w-[1220px] flex-col lg:flex-row">
        {/* Left Sidebar */}
        <Sidebar
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          showOriginal={showOriginal}
          onToggleLanguage={toggleLanguage}
          onRefreshData={handleManualSync}
          refreshing={refreshing || Boolean(syncStatus?.syncing)}
          syncStatus={syncStatus}
          todayCount={todayCount}
          savedCount={savedIds.size}
          aiTradingCount={aiTradingCount}
          agentCounts={agentCounts}
          categoryCounts={categoryCounts}
          selectedAgent={selectedAgent}
          selectedCategory={selectedCategory}
          timeFilter={timeFilter}
          specialView={specialView}
          onSelectAgent={(ag) => {
            setSelectedAgent(ag ? normalizeAgentName(ag) : null);
            setSpecialView("none");
            setVisibleLimit(30);
            mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onSelectCategory={(cat) => {
            setSelectedCategory(cat);
            setSpecialView("none");
            setVisibleLimit(30);
            mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onSelectToday={() => {
            setTimeFilter((prev) => (prev === "today" ? "all" : "today"));
            setSort("new");
            setSpecialView("none");
            setVisibleLimit(30);
            mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onSelectSpecial={(view) => {
            setSpecialView(view);
            setSelectedAgent(null);
            setSelectedCategory(null);
            setTimeFilter("all");
            setVisibleLimit(30);
            mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onResetAll={resetAllFilters}
          onOpenSubscribe={() => {
            setPendingDetailItem(null);
            setSubscribeSource("sidebar");
            setSubscribeOpen(true);
          }}
          onOpenSubmit={() => setSubmitOpen(true)}
          onOpenAbout={() => setAboutOpen(true)}
        />

        {/* Right Main Content */}
        <main
          ref={mainRef}
          className="min-w-0 flex-1 pb-12 lg:h-dvh lg:overflow-y-auto"
        >
          {/* Sticky Search & Filter Toolbar */}
          <div
            ref={toolbarRef}
            className="sticky top-0 z-20 border-b border-dashed border-line bg-bg/95 px-4 py-4 backdrop-blur sm:px-6"
          >
            <div className="flex items-center gap-2.5">
              {/* Search box */}
              <div className="relative flex flex-1 items-center">
                <Search className="pointer-events-none absolute left-3 size-4 text-faint" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setVisibleLimit(30);
                  }}
                  placeholder="搜索 AI Agent 用例（支持中英文）"
                  className="h-10 w-full rounded-lg border border-line bg-panel pr-14 pl-9 text-[14px] text-text placeholder:text-faint focus:border-faint focus:bg-bg focus:outline-none"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="清空搜索"
                    className="absolute right-2.5 inline-flex size-6 items-center justify-center rounded text-faint hover:text-text"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : (
                  <kbd className="pointer-events-none absolute right-2.5 hidden rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[11px] text-faint sm:inline-block">
                    ⌘K
                  </kbd>
                )}
              </div>

              {/* Sort toggle: Top / New */}
              <div className="inline-flex h-10 shrink-0 items-center rounded-lg border border-line bg-bg p-1">
                <button
                  type="button"
                  onClick={() => setSort("top")}
                  className={`h-8 rounded-md px-3 text-[13px] font-medium transition-colors ${
                    sort === "top"
                      ? "bg-raise text-text"
                      : "text-muted hover:text-text"
                  }`}
                >
                  热门
                </button>
                <button
                  type="button"
                  onClick={() => setSort("new")}
                  className={`h-8 rounded-md px-3 text-[13px] font-medium transition-colors ${
                    sort === "new"
                      ? "bg-raise text-text"
                      : "text-muted hover:text-text"
                  }`}
                >
                  最新
                </button>
              </div>
            </div>

            {/* Filter pills */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setTimeFilter("all");
                  setSpecialView("none");
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
                  timeFilter === "all" && specialView === "none"
                    ? "bg-text text-bg"
                    : "border border-line text-muted hover:border-faint hover:text-text"
                }`}
              >
                <span>全部</span>
                <span className="font-mono text-[11.5px] opacity-75">
                  {catalog.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTimeFilter(timeFilter === "week" ? "all" : "week");
                  setSpecialView("none");
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
                  timeFilter === "week"
                    ? "bg-text text-bg"
                    : "border border-line text-muted hover:border-faint hover:text-text"
                }`}
              >
                <span>本周新增</span>
                <span className="font-mono text-[11.5px] opacity-75">
                  {weekCount}
                </span>
              </button>

              {timeFilter === "today" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-panel px-3 py-1 text-[12.5px] font-medium text-signal">
                  <span>今日新增 ({todayCount})</span>
                  <button
                    type="button"
                    onClick={() => setTimeFilter("all")}
                    aria-label="清除今日筛选"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              {selectedAgent && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-panel px-3 py-1 text-[12.5px] font-medium text-signal">
                  <span>代理：{selectedAgent}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedAgent(null)}
                    aria-label="清除代理筛选"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              {selectedCategory && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-panel px-3 py-1 text-[12.5px] font-medium text-signal">
                  <span>分类：{CATEGORY_MAP[selectedCategory]?.label}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    aria-label="清除分类筛选"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              {specialView === "saved" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-panel px-3 py-1 text-[12.5px] font-medium text-signal">
                  <span>我的收藏 ({savedIds.size})</span>
                  <button
                    type="button"
                    onClick={() => setSpecialView("none")}
                    aria-label="退出收藏视图"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              {specialView === "collection:ai-trading" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-panel px-3 py-1 text-[12.5px] font-medium text-signal">
                  <span>专题：AI 自动交易与量化</span>
                  <button
                    type="button"
                    onClick={() => setSpecialView("none")}
                    aria-label="退出专题视图"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
            </div>
          </div>

          {/* Loading / Error states */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-28 text-muted">
              <Loader2 className="size-6 animate-spin" />
              <p className="mt-3 text-sm">正在加载最新案例数据...</p>
            </div>
          ) : error ? (
            <div className="mx-6 my-12 rounded-xl border border-dashed border-line bg-panel p-6 text-center">
              <p className="text-sm font-medium text-danger">{error}</p>
              <button
                type="button"
                onClick={() => loadData(true)}
                className="mt-3 rounded-lg bg-text px-4 py-2 text-xs font-medium text-bg"
              >
                重试加载
              </button>
            </div>
          ) : (
            <>
              {/* Trending Today (shown on unfiltered homepage) */}
              {isDefaultHome && (
                <TrendingSection
                  items={trending}
                  refDate={refDate}
                  getVotes={getVotes}
                  votedIds={votedIds}
                  savedIds={savedIds}
                  tr={tr}
                  queueTranslate={queueTranslate}
                  onSelect={openDetail}
                  onVote={handleVote}
                  onSave={handleSave}
                  onSelectAgent={(ag) => setSelectedAgent(normalizeAgentName(ag))}
                />
              )}

              {/* Grouped Default Homepage */}
              {isGroupedHome ? (
                <div>
                  {/* Latest preview section */}
                  {latestPreview.length > 0 && (
                    <section className="border-b border-dashed border-line">
                      <div className="flex items-center justify-between border-b border-dashed border-line px-4 py-3 sm:px-6">
                        <span className="font-mono text-[11px] font-medium tracking-[0.14em] text-faint uppercase">
                          最新收录 · LATEST
                        </span>
                        <button
                          type="button"
                          onClick={() => setSort("new")}
                          className="text-[12.5px] font-medium text-signal hover:underline"
                        >
                          按时间查看全部 ↗
                        </button>
                      </div>
                      <ul>
                        {latestPreview.map((item) => (
                          <UseCaseRow
                            key={`latest-${item.id}`}
                            item={item}
                            votes={getVotes(item.id)}
                            voted={votedIds.has(item.id)}
                            saved={savedIds.has(item.id)}
                            refDate={refDate}
                            tr={tr}
                            onSelect={openDetail}
                            onVote={handleVote}
                            onSave={handleSave}
                            onSelectAgent={(ag) => setSelectedAgent(normalizeAgentName(ag))}
                          />
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* 01 ~ 11 Category sections */}
                  {groupedSections.map(({ cat, items }) => (
                    <section
                      key={cat.id}
                      className="border-b border-dashed border-line"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-dashed border-line bg-panel/45 px-4 py-3.5 sm:px-6">
                        <span className="font-mono text-[11px] text-faint">
                          {cat.num}
                        </span>
                        <h2 className="font-display text-[16px] font-bold text-text">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCategory(cat.id);
                              mainRef.current?.scrollTo({
                                top: 0,
                                behavior: "smooth",
                              });
                            }}
                            className="underline-offset-4 hover:underline"
                          >
                            {cat.label}
                          </button>
                        </h2>
                        <span className="font-mono text-[11px] text-faint">
                          {categoryCounts[cat.id] || 0}
                        </span>
                        <p className="w-full min-w-0 text-[13px] text-faint sm:w-auto sm:flex-1 sm:truncate">
                          {cat.description}
                        </p>
                      </div>

                      <ul>
                        {items.map((item) => (
                          <UseCaseRow
                            key={item.id}
                            item={item}
                            votes={getVotes(item.id)}
                            voted={votedIds.has(item.id)}
                            saved={savedIds.has(item.id)}
                            refDate={refDate}
                            tr={tr}
                            onSelect={openDetail}
                            onVote={handleVote}
                            onSave={handleSave}
                            onSelectAgent={(ag) => setSelectedAgent(normalizeAgentName(ag))}
                          />
                        ))}
                      </ul>

                      <div className="px-4 py-2.5 sm:px-6">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategory(cat.id);
                            mainRef.current?.scrollTo({
                              top: 0,
                              behavior: "smooth",
                            });
                          }}
                          className="font-mono text-[12px] text-muted hover:text-text hover:underline"
                        >
                          查看「{cat.label}」全部 {categoryCounts[cat.id] || 0} 个用例 →
                        </button>
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                /* Flat Filtered / Search / New View */
                <div>
                  <div className="sticky top-[var(--toolbar-h,111px)] z-10 flex items-center justify-between border-b border-dashed border-line bg-panel/95 px-4 py-3 font-mono text-[11.5px] text-faint backdrop-blur sm:px-6">
                    <span className="flex items-center gap-2">
                      <span>
                        {isDefaultHome ? (
                          <>
                            全部收录 · ALL USE CASES{" "}
                            <strong className="text-text">{filteredItems.length}</strong>
                          </>
                        ) : (
                          <>
                            共找到 <strong className="text-text">{filteredItems.length}</strong>{" "}
                            个用例
                          </>
                        )}
                      </span>
                      {translating && !showOriginal && (
                        <span className="inline-flex items-center gap-1 text-signal">
                          <Loader2 className="size-3 animate-spin" />
                          <span>正在翻译...</span>
                        </span>
                      )}
                    </span>
                    {!isDefaultHome && (
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="text-signal hover:underline"
                      >
                        重置筛选
                      </button>
                    )}
                  </div>

                  {displayedFlatItems.length === 0 ? (
                    <div className="px-6 py-20 text-center">
                      <p className="text-sm font-medium text-text">
                        没有找到匹配的用例
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        尝试更换关键词或清除筛选条件
                      </p>
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="mt-4 rounded-lg border border-line px-3.5 py-1.5 text-xs text-text hover:border-faint"
                      >
                        查看全部用例
                      </button>
                    </div>
                  ) : (
                    <>
                      <ul>
                        {displayedFlatItems.map((item) => (
                          <UseCaseRow
                            key={item.id}
                            item={item}
                            votes={getVotes(item.id)}
                            voted={votedIds.has(item.id)}
                            saved={savedIds.has(item.id)}
                            refDate={refDate}
                            tr={tr}
                            onSelect={openDetail}
                            onVote={handleVote}
                            onSave={handleSave}
                            onSelectAgent={(ag) => setSelectedAgent(normalizeAgentName(ag))}
                          />
                        ))}
                      </ul>

                      {visibleLimit < filteredItems.length && (
                        <div className="flex justify-center py-6">
                          <button
                            type="button"
                            onClick={() => setVisibleLimit((n) => n + 30)}
                            className="rounded-lg border border-line bg-bg px-5 py-2 text-sm font-medium text-text transition-colors hover:border-faint hover:bg-wash"
                          >
                            加载更多（还有 {filteredItems.length - visibleLimit} 条）
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      <DetailModal
        item={activeItem}
        prevItem={prevItem}
        nextItem={nextItem}
        votes={activeItem ? getVotes(activeItem.id) : 0}
        voted={activeItem ? votedIds.has(activeItem.id) : false}
        saved={activeItem ? savedIds.has(activeItem.id) : false}
        tr={tr}
        queueTranslate={translateNow}
        onClose={closeDetail}
        onSelect={openDetail}
        onVote={handleVote}
        onSave={handleSave}
        onSelectCategory={(cat) => setSelectedCategory(cat)}
        onSelectAgent={(ag) => setSelectedAgent(normalizeAgentName(ag))}
      />

      <SubscribeModal
        open={subscribeOpen}
        source={subscribeSource}
        hasPendingDetail={Boolean(pendingDetailItem)}
        onClose={() => {
          setSubscribeOpen(false);
          setPendingDetailItem(null);
        }}
        onSkipToDetail={() => {
          const item = pendingDetailItem;
          setSubscribeOpen(false);
          setPendingDetailItem(null);
          if (item) openDetailDirect(item);
        }}
      />

      <SubmitModal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onSubmitted={(newItem) => {
          setCatalog((prev) => [newItem, ...prev]);
          setSort("new");
          setSelectedAgent(null);
          setSelectedCategory(null);
          setSpecialView("none");
          setTimeFilter("all");
        }}
      />

      <AboutModal
        open={aboutOpen}
        totalCount={catalog.length}
        onClose={() => setAboutOpen(false)}
      />
    </div>
  );
}
