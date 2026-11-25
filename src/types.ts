export interface UseCaseSource {
  platform: string;
  url: string;
  author?: string | null;
  score?: number | null;
  date?: string | null;
}

export interface UseCaseAgents {
  filter: string[];
  labels: string[];
  known: boolean;
}

export interface UseCase {
  id: string;
  title: string;
  summary: string;
  category: string;
  tools: string[];
  link: string | null;
  source: UseCaseSource;
  addedAt: string;
  agents: UseCaseAgents;
  accounts: number;
  described: boolean;
  submittedBy?: string;
  isLocal?: boolean;
}

export interface TrendingItem {
  votes: number;
  usecase: UseCase;
}

export interface UseCaseDetail {
  id: string;
  whatTheyDid: string;
  howItWent: string;
  worthKnowing: string;
  prompt: string;
  originalUrl: string | null;
}

export interface SponsorItem {
  name: string;
  mark: string;
  tagline: string;
  url: string;
  isCta?: boolean;
}

export interface SyncStatus {
  enabled: boolean;
  intervalMinutes: number;
  syncing: boolean;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
  itemCount: number;
  newItemsCount: number;
  translatedCount: number;
}

export interface CollectionDef {
  id: string;
  label: string;
  pattern: string;
  description?: string;
}

export interface CandidateCollection extends CollectionDef {
  count: number;
  samples: string[];
  discoveredAt: string;
}

export type SortMode = "top" | "new";
export type TimeFilter = "all" | "week" | "today";
export type SpecialView = "none" | "saved" | `collection:${string}`;
