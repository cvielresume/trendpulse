"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RedditPost } from "@/lib/reddit-fetcher";
import { loadFromCache, saveToCache, isCacheFresh, getCacheAge, clearCategoryCache } from "@/lib/cache";
import { subredditMapping } from "@/lib/reddit-config";

const platforms = [
  { id: "all", name: "All" },
  { id: "reddit", name: "Reddit" },
  { id: "x", name: "X" },
  { id: "tiktok", name: "TikTok" },
  { id: "hn", name: "HN" },
];

const categoryToApiCategory: Record<string, string> = {
  Trending: "trending",
  Tech: "tech",
  Business: "business",
  AI: "ai",
  Crypto: "crypto",
  Science: "science",
  Ideas: "ideas",
  "Pain Points": "pain-points", // Call dedicated pain-points API
  Gaming: "trending",
  Politics: "trending",
  Sports: "trending",
  Comedy: "trending",
  Music: "trending",
  Dance: "trending",
  Startups: "business",
  "Show HN": "tech",
};

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
}

// Saved posts management
const SAVED_KEY = "trendpulse_saved";

function loadSavedPosts(): RedditPost[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(SAVED_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function savePostsToStorage(posts: RedditPost[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SAVED_KEY, JSON.stringify(posts));
}

export default function Home() {
  const [selectedPlatform, setSelectedPlatform] = useState("reddit");
  const [selectedCategory, setSelectedCategory] = useState("Trending");
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [savedPosts, setSavedPosts] = useState<RedditPost[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheAge, setCacheAge] = useState<number | null>(null);
  const pullStartY = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);

  // Load saved posts on mount
  useEffect(() => {
    setSavedPosts(loadSavedPosts());
  }, []);

  const toggleSave = (post: RedditPost) => {
    const isSaved = savedPosts.some(p => p.id === post.id);
    let newSaved: RedditPost[];
    
    if (isSaved) {
      newSaved = savedPosts.filter(p => p.id !== post.id);
    } else {
      newSaved = [post, ...savedPosts];
    }
    
    setSavedPosts(newSaved);
    savePostsToStorage(newSaved);
  };

  const isPostSaved = (postId: string) => savedPosts.some(p => p.id === postId);

  const categories: Record<string, string[]> = {
    all: ["Trending", "Tech", "Business", "AI", "Crypto", "Science"],
    reddit: ["Trending", "Tech", "Business", "AI", "Crypto", "Science", "Ideas", "Pain Points"],
    x: ["Trending", "Tech", "Business", "Politics", "Sports"],
    tiktok: ["Trending", "Tech", "Comedy", "Music", "Dance"],
    hn: ["Trending", "Tech", "Startups", "Show HN"],
  };

  // Complaint/pain point keywords
  const complaintKeywords = [
    "i hate", "hate when", "hated",
    "frustrated", "frustrating", "frustration",
    "annoying", "annoyed", "annoyance",
    "expensive", "overpriced", "costly",
    "broken", "doesn't work", "not working",
    "why is", "why does", "why can't",
    "can't believe", "unbelievable",
    "terrible", "awful", "horrible", "worst",
    "i wish", "wish there was", "wish i could",
    "is there a tool", "is there an app", "is there a way",
    "does anyone know how", "how do i", "help me",
    "struggling with", "struggle to",
    "pain point", "pain in the",
    "sucks", "suck at",
    "tired of", "sick of",
    "problem with", "issue with",
    "needs to be fixed", "should be",
    "why isn't there", "missing feature",
    "clunky", "confusing", "complicated",
  ];

  // Check if post is a pain point
  const isPainPoint = (post: RedditPost): boolean => {
    const titleLower = post.title.toLowerCase();
    return complaintKeywords.some(keyword => titleLower.includes(keyword));
  };

  // Fetch posts from API
  const fetchPosts = useCallback(async (category: string, forceRefresh = false) => {
    const apiCategory = categoryToApiCategory[category] || "trending";
    
    // Try to load from cache first
    const cached = loadFromCache(apiCategory);
    if (cached && !forceRefresh) {
      setPosts(cached.posts);
      setCacheAge(getCacheAge(apiCategory));
      
      // If cache is fresh, don't fetch
      if (isCacheFresh(apiCategory)) {
        return;
      }
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `/api/posts?category=${apiCategory}${forceRefresh ? "&refresh=true" : ""}`
      );
      const data = await response.json();
      
      if (data.success && data.posts.length > 0) {
        setPosts(data.posts);
        saveToCache(apiCategory, data.posts);
        setCacheAge(0);
      } else if (data.posts.length === 0 && !cached) {
        setError("No posts found. Try a different category.");
      }
    } catch (err) {
      console.error("Failed to fetch:", err);
      if (!cached) {
        setError("Failed to load posts. Pull down to retry.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Get display posts (API already filters pain points)
  const displayPosts = posts;
  useEffect(() => {
    if (selectedPlatform === "reddit") {
      fetchPosts(selectedCategory);
    }
  }, [selectedPlatform, selectedCategory, fetchPosts]);

  // Handle platform change
  const handlePlatformChange = (platformId: string) => {
    setSelectedPlatform(platformId);
    // Reset to first category of new platform
    const newCategories = categories[platformId] || categories.all;
    setSelectedCategory(newCategories[0]);
    setPosts([]);
    setError(null);
  };

  // Pull to refresh handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    pullStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      const distance = e.touches[0].clientY - pullStartY.current;
      if (distance > 0) {
        setPullDistance(Math.min(distance, 80));
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 60) {
      setIsRefreshing(true);
      const apiCategory = categoryToApiCategory[selectedCategory] || "trending";
      clearCategoryCache(apiCategory);
      fetchPosts(selectedCategory, true);
    }
    setPullDistance(0);
  };

  // Format cache age display
  const getCacheAgeDisplay = () => {
    if (cacheAge === null) return null;
    if (cacheAge === 0) return "Just now";
    if (cacheAge < 60) return `${cacheAge}m ago`;
    return `${Math.floor(cacheAge / 60)}h ago`;
  };

  // Non-Reddit platforms - show placeholder
  const showPlaceholder = selectedPlatform !== "reddit";

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--paper-white)",
        maxWidth: "100vw",
        paddingBottom: "80px",
        touchAction: "pan-y",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      {!showSaved && pullDistance > 0 && (
        <div
          style={{
            height: pullDistance,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-secondary)",
            fontSize: "13px",
            transition: pullDistance === 0 ? "height 0.2s ease" : "none",
          }}
        >
          {pullDistance > 60 ? "↓ Release to refresh" : "↓ Pull to refresh"}
        </div>
      )}

      {/* Header */}
      {!showSaved && (
        <header
          style={{
            position: "sticky",
            top: 0,
            backgroundColor: "var(--paper-white)",
            zIndex: 100,
          }}
        >
          {/* Title */}
          <div
            style={{
              padding: "16px 20px 12px",
              borderBottom: "1px solid var(--divider)",
            }}
          >
            <h1
              style={{
                fontSize: "22px",
                fontWeight: 700,
                margin: 0,
                letterSpacing: "-0.5px",
              }}
            >
              TrendPulse
            </h1>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-secondary)",
                margin: "4px 0 0 0",
              }}
            >
              What&apos;s trending across platforms
            </p>
          </div>

          {/* Platform Tabs */}
          <div
            style={{
              display: "flex",
              gap: "0",
              borderBottom: "1px solid var(--divider)",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {platforms.map((platform) => (
              <button
                key={platform.id}
                onClick={() => handlePlatformChange(platform.id)}
                style={{
                  flex: 1,
                  minWidth: "60px",
                  padding: "14px 8px",
                  background: "none",
                  border: "none",
                  borderBottom:
                    selectedPlatform === platform.id
                      ? "3px solid var(--accent-coral)"
                      : "3px solid transparent",
                  fontSize: "14px",
                  fontWeight: selectedPlatform === platform.id ? 600 : 500,
                  color:
                    selectedPlatform === platform.id
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {platform.name}
              </button>
            ))}
          </div>

          {/* Category Pills */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              padding: "12px 16px",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              backgroundColor: "var(--paper-white)",
            }}
          >
            {(categories[selectedPlatform] || categories.all).map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "20px",
                  border:
                    selectedCategory === category
                      ? "none"
                      : "1px solid var(--divider)",
                  backgroundColor:
                    selectedCategory === category
                      ? "var(--accent-coral)"
                      : "transparent",
                  color:
                    selectedCategory === category
                      ? "white"
                      : "var(--text-secondary)",
                  fontSize: "13px",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {category}
              </button>
            ))}
          </div>
        </header>
      )}

      {/* Saved header */}
      {showSaved && (
        <header
          style={{
            position: "sticky",
            top: 0,
            backgroundColor: "var(--paper-white)",
            zIndex: 100,
            padding: "16px 20px",
            borderBottom: "1px solid var(--divider)",
          }}
        >
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              margin: 0,
              letterSpacing: "-0.5px",
            }}
          >
            Saved
          </h1>
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-secondary)",
              margin: "4px 0 0 0",
            }}
          >
            Your bookmarked posts
          </p>
        </header>
      )}

      {/* Content */}
      <div style={{ padding: "8px 0" }}>
        {/* Loading state */}
        {isLoading && displayPosts.length === 0 && (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--text-secondary)",
            }}
          >
            <div style={{ fontSize: "16px", marginBottom: "8px" }}>Loading...</div>
            <div style={{ fontSize: "13px" }}>
              {selectedCategory === "Pain Points" 
                ? "Scanning for pain points..." 
                : `Fetching from r/${subredditMapping[selectedCategory.toLowerCase()]?.join(", r/") || "Reddit"}`}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--text-secondary)",
            }}
          >
            <div style={{ fontSize: "16px", marginBottom: "8px" }}>{error}</div>
            <button
              onClick={() => fetchPosts(selectedCategory, true)}
              style={{
                padding: "10px 20px",
                backgroundColor: "var(--accent-coral)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Placeholder for non-Reddit platforms */}
        {showPlaceholder && !isLoading && (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--text-secondary)",
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🚧</div>
            <div style={{ fontSize: "16px", marginBottom: "8px" }}>
              {platforms.find(p => p.id === selectedPlatform)?.name} coming soon
            </div>
            <div style={{ fontSize: "13px" }}>
              Reddit is live — other platforms in progress
            </div>
          </div>
        )}

        {/* Posts list */}
        {!showPlaceholder && !showSaved && displayPosts.length > 0 && (
          <>
            {/* Cache age indicator */}
            {cacheAge !== null && (
              <div
                style={{
                  padding: "8px 16px",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  textAlign: "center",
                }}
              >
                {isRefreshing ? "Refreshing..." : getCacheAgeDisplay()}
                {selectedCategory === "Pain Points" && ` • ${displayPosts.length} pain points found`}
              </div>
            )}

            {displayPosts.map((post) => {
              const saved = isPostSaved(post.id);
              const isPain = isPainPoint(post);
              return (
                <article
                  key={post.id}
                  style={{
                    backgroundColor: "var(--paper-warm)",
                    borderLeft: isPain ? "3px solid #D32F2F" : "3px solid var(--accent-coral)",
                    margin: "12px 16px",
                    padding: "16px",
                    borderRadius: "0 8px 8px 0",
                    position: "relative",
                  }}
                >
                  {/* Save button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleSave(post);
                    }}
                    style={{
                      position: "absolute",
                      top: "12px",
                      right: "12px",
                      background: "none",
                      border: "none",
                      fontSize: "20px",
                      cursor: "pointer",
                      opacity: saved ? 1 : 0.4,
                      transition: "opacity 0.15s ease",
                    }}
                    title={saved ? "Remove from saved" : "Save post"}
                  >
                    {saved ? "🔖" : "📑"}
                  </button>

                  {/* Subreddit */}
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: isPain ? "#D32F2F" : "var(--accent-coral)",
                      marginBottom: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      paddingRight: "36px",
                    }}
                  >
                    {post.subreddit}
                    {post.isRising && (
                      <span
                        style={{
                          fontSize: "11px",
                          backgroundColor: "var(--accent-coral)",
                          color: "white",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: 500,
                        }}
                      >
                        surging
                      </span>
                    )}
                    {isPain && (
                      <span
                        style={{
                          fontSize: "11px",
                          backgroundColor: "#D32F2F",
                          color: "white",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: 500,
                        }}
                      >
                        pain point
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <a
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "block",
                    }}
                  >
                    <h2
                      style={{
                        fontSize: "16px",
                        fontWeight: 500,
                        lineHeight: 1.4,
                        margin: 0,
                        color: "var(--text-primary)",
                        paddingRight: "36px",
                      }}
                    >
                      {post.title}
                    </h2>
                  </a>

                  {/* Meta */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      marginTop: "12px",
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--accent-amber)",
                        fontWeight: 500,
                      }}
                    >
                      ▲ {formatNumber(post.upvotes)}
                    </span>
                    <span>💬 {formatNumber(post.comments)}</span>
                    <span>{post.timeAgo}</span>
                  </div>
                </article>
              );
            })}
          </>
        )}

        {/* Empty state for Pain Points */}
        {!showPlaceholder && !showSaved && selectedCategory === "Pain Points" && displayPosts.length === 0 && !isLoading && (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--text-secondary)",
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔍</div>
            <div style={{ fontSize: "16px", marginBottom: "8px" }}>
              No pain points found in current posts
            </div>
            <div style={{ fontSize: "13px" }}>
              Try a different category or pull to refresh
            </div>
          </div>
        )}

        {/* Saved posts view */}
        {showSaved && (
          <div style={{ padding: "8px 0" }}>
            <div
              style={{
                padding: "16px 20px 8px",
                fontSize: "14px",
                color: "var(--text-secondary)",
                borderBottom: "1px solid var(--divider)",
              }}
            >
              {savedPosts.length} saved post{savedPosts.length !== 1 ? "s" : ""}
            </div>

            {savedPosts.length === 0 ? (
              <div
                style={{
                  padding: "60px 20px",
                  textAlign: "center",
                  color: "var(--text-secondary)",
                }}
              >
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>📑</div>
                <div style={{ fontSize: "16px", marginBottom: "8px" }}>
                  No saved posts yet
                </div>
                <div style={{ fontSize: "13px" }}>
                  Tap the bookmark icon to save posts for later
                </div>
              </div>
            ) : (
              savedPosts.map((post) => (
                <article
                  key={post.id}
                  style={{
                    backgroundColor: "var(--paper-warm)",
                    borderLeft: "3px solid var(--accent-amber)",
                    margin: "12px 16px",
                    padding: "16px",
                    borderRadius: "0 8px 8px 0",
                    position: "relative",
                  }}
                >
                  {/* Remove button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleSave(post);
                    }}
                    style={{
                      position: "absolute",
                      top: "12px",
                      right: "12px",
                      background: "none",
                      border: "none",
                      fontSize: "20px",
                      cursor: "pointer",
                      opacity: 1,
                    }}
                    title="Remove from saved"
                  >
                    🔖
                  </button>

                  {/* Subreddit */}
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--accent-coral)",
                      marginBottom: "6px",
                      paddingRight: "36px",
                    }}
                  >
                    {post.subreddit}
                    {post.isRising && (
                      <span
                        style={{
                          fontSize: "11px",
                          backgroundColor: "var(--accent-coral)",
                          color: "white",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: 500,
                          marginLeft: "6px",
                        }}
                      >
                        surging
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <a
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "block",
                    }}
                  >
                    <h2
                      style={{
                        fontSize: "16px",
                        fontWeight: 500,
                        lineHeight: 1.4,
                        margin: 0,
                        color: "var(--text-primary)",
                        paddingRight: "36px",
                      }}
                    >
                      {post.title}
                    </h2>
                  </a>

                  {/* Meta */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      marginTop: "12px",
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--accent-amber)",
                        fontWeight: 500,
                      }}
                    >
                      ▲ {formatNumber(post.upvotes)}
                    </span>
                    <span>💬 {formatNumber(post.comments)}</span>
                    <span>{post.timeAgo}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: "var(--paper-white)",
          borderTop: "1px solid var(--divider)",
          padding: "12px 24px",
          display: "flex",
          justifyContent: "space-around",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
        }}
      >
        <button
          onClick={() => setShowSaved(false)}
          style={{
            background: "none",
            border: "none",
            fontSize: "13px",
            fontWeight: !showSaved ? 600 : 500,
            color: !showSaved ? "var(--accent-coral)" : "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          Browse
        </button>
        <button
          onClick={() => setShowSaved(true)}
          style={{
            background: "none",
            border: "none",
            fontSize: "13px",
            fontWeight: showSaved ? 600 : 500,
            color: showSaved ? "var(--accent-coral)" : "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          Saved
          {savedPosts.length > 0 && (
            <span
              style={{
                backgroundColor: "var(--accent-coral)",
                color: "white",
                fontSize: "10px",
                padding: "2px 6px",
                borderRadius: "10px",
              }}
            >
              {savedPosts.length}
            </span>
          )}
        </button>
      </nav>
    </main>
  );
}
