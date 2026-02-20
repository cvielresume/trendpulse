import { RedditPost } from "./reddit-fetcher";

const CACHE_PREFIX = "trendpulse_cache_";
const CACHE_TIMESTAMP_PREFIX = "trendpulse_time_";
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 500; // Max posts per category

export interface CachedData {
  posts: RedditPost[];
  fetchedAt: number;
  category: string;
}

// Save posts to localStorage
export function saveToCache(category: string, posts: RedditPost[]): void {
  if (typeof window === "undefined") return;
  
  try {
    const cacheKey = `${CACHE_PREFIX}${category}`;
    const timeKey = `${CACHE_TIMESTAMP_PREFIX}${category}`;
    
    // Cap the cache size
    const postsToSave = posts.slice(0, MAX_CACHE_SIZE);
    
    localStorage.setItem(cacheKey, JSON.stringify(postsToSave));
    localStorage.setItem(timeKey, Date.now().toString());
  } catch (error) {
    console.error("Failed to save to cache:", error);
    // If localStorage is full, clear old caches
    clearOldCaches();
  }
}

// Load posts from localStorage
export function loadFromCache(category: string): CachedData | null {
  if (typeof window === "undefined") return null;
  
  try {
    const cacheKey = `${CACHE_PREFIX}${category}`;
    const timeKey = `${CACHE_TIMESTAMP_PREFIX}${category}`;
    
    const cached = localStorage.getItem(cacheKey);
    const timestamp = localStorage.getItem(timeKey);
    
    if (!cached || !timestamp) return null;
    
    return {
      posts: JSON.parse(cached),
      fetchedAt: parseInt(timestamp, 10),
      category,
    };
  } catch (error) {
    console.error("Failed to load from cache:", error);
    return null;
  }
}

// Check if cache is still fresh (< 30 min old)
export function isCacheFresh(category: string): boolean {
  if (typeof window === "undefined") return false;
  
  const timeKey = `${CACHE_TIMESTAMP_PREFIX}${category}`;
  const timestamp = localStorage.getItem(timeKey);
  
  if (!timestamp) return false;
  
  const fetchedAt = parseInt(timestamp, 10);
  const age = Date.now() - fetchedAt;
  
  return age < CACHE_DURATION_MS;
}

// Get cache age in minutes
export function getCacheAge(category: string): number | null {
  if (typeof window === "undefined") return null;
  
  const timeKey = `${CACHE_TIMESTAMP_PREFIX}${category}`;
  const timestamp = localStorage.getItem(timeKey);
  
  if (!timestamp) return null;
  
  const fetchedAt = parseInt(timestamp, 10);
  return Math.floor((Date.now() - fetchedAt) / 60000);
}

// Clear cache for a specific category
export function clearCategoryCache(category: string): void {
  if (typeof window === "undefined") return;
  
  localStorage.removeItem(`${CACHE_PREFIX}${category}`);
  localStorage.removeItem(`${CACHE_TIMESTAMP_PREFIX}${category}`);
}

// Clear all caches
export function clearAllCaches(): void {
  if (typeof window === "undefined") return;
  
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith(CACHE_PREFIX) || key.startsWith(CACHE_TIMESTAMP_PREFIX)) {
      localStorage.removeItem(key);
    }
  });
}

// Clear old caches (keep recent ones)
function clearOldCaches(): void {
  if (typeof window === "undefined") return;
  
  const keys = Object.keys(localStorage);
  const cacheKeys = keys.filter(k => k.startsWith(CACHE_TIMESTAMP_PREFIX));
  
  // Sort by timestamp and remove oldest 50%
  const cachesWithTime = cacheKeys.map(key => ({
    key,
    time: parseInt(localStorage.getItem(key) || "0", 10),
  }));
  
  cachesWithTime.sort((a, b) => a.time - b.time);
  
  const toRemove = cachesWithTime.slice(0, Math.ceil(cachesWithTime.length / 2));
  toRemove.forEach(({ key }) => {
    const category = key.replace(CACHE_TIMESTAMP_PREFIX, "");
    clearCategoryCache(category);
  });
}
