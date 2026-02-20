import { blockedDomains, MIN_QUALITY_RATIO } from "./reddit-config";

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  upvotes: number;
  comments: number;
  timeAgo: string;
  permalink: string;
  url: string;
  domain: string;
  postHint: string | null;
  createdAt: number;
  isRising: boolean; // Posts gaining momentum (from /rising)
}

interface RawRedditPost {
  data: {
    id: string;
    subreddit_name_prefixed: string;
    title: string;
    ups: number;
    num_comments: number;
    created_utc: number;
    permalink: string;
    url: string;
    domain: string;
    post_hint?: string;
    is_self: boolean;
    is_video: boolean;
  };
}

// Complaint/pain point keywords to search for (simplified for better results)
export const complaintKeywords = [
  "i hate",
  "frustrated",
  "annoying",
  "expensive",
  "why is",
  "i wish",
  "is there a tool",
  "how do i",
  "help me",
  "struggling with",
  "problem with",
  "sucks",
  "tired of",
];

// Search Reddit for pain points using search API
// Try multiple approaches since Reddit blocks cloud IPs
async function searchPainPoints(keywords: string[], limit = 100): Promise<{ posts: RawRedditPost[]; error?: string }> {
  // Build search query with proper encoding
  const searchQuery = encodeURIComponent(keywords.join(" OR "));
  
  // Try multiple endpoints
  const endpoints = [
    `https://old.reddit.com/search.json?q=${searchQuery}&sort=relevance&t=day&limit=${limit}`,
    `https://www.reddit.com/search.json?q=${searchQuery}&sort=relevance&t=day&limit=${limit}`,
  ];
  
  for (const url of endpoints) {
    try {
      console.log(`Trying: ${url}`);
      const response = await fetch(url, {
        headers: {
          "User-Agent": "TrendPulse/1.0 (personal project - https://github.com/cvielresume/trendpulse)",
          "Accept": "application/json",
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const posts = data.data?.children || [];
        console.log(`Found ${posts.length} pain point results`);
        return { posts };
      }
      
      console.log(`Failed: ${response.status}`);
    } catch (error) {
      console.log(`Error with endpoint: ${error}`);
    }
  }
  
  // All endpoints failed - return empty with error
  return { posts: [], error: "Reddit is blocking requests from cloud servers. Pain Points requires direct access." };
}

// Fetch posts from a single subreddit (hot or rising)
// Try multiple methods: RSS first (less blocked), then JSON API
async function fetchSubreddit(subreddit: string, sort: "hot" | "rising" = "hot", limit = 25): Promise<{ posts: RawRedditPost[]; error?: string }> {
  // Method 1: Try RSS feed (often works where JSON API is blocked)
  if (sort === "hot") {
    try {
      const rssUrl = `https://www.reddit.com/r/${subreddit}/.rss?limit=${limit}`;
      const response = await fetch(rssUrl, {
        headers: {
          "User-Agent": "TrendPulse/1.0 (personal project)",
          "Accept": "application/rss+xml, application/xml, text/xml",
        },
      });
      
      if (response.ok) {
        const xmlText = await response.text();
        const posts = parseRedditRSS(xmlText);
        if (posts.length > 0) {
          console.log(`Fetched ${posts.length} posts from r/${subreddit} via RSS`);
          return { posts };
        }
      }
    } catch (error) {
      console.log(`RSS failed for r/${subreddit}, trying JSON API...`);
    }
  }
  
  // Method 2: Try old.reddit.com JSON API
  try {
    const url = `https://old.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.reddit.com/",
      },
      redirect: "follow",
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`Failed to fetch r/${subreddit}/${sort}: ${response.status} - ${errorText.slice(0, 200)}`);
      return { posts: [], error: `Reddit returned ${response.status}` };
    }
    
    const data = await response.json();
    const posts = data.data?.children || [];
    console.log(`Fetched ${posts.length} posts from r/${subreddit}/${sort}`);
    return { posts };
  } catch (error) {
    console.error(`Error fetching r/${subreddit}/${sort}:`, error);
    return { posts: [], error: String(error) };
  }
}

// Parse Reddit RSS feed to extract posts
function parseRedditRSS(xml: string): RawRedditPost[] {
  const posts: RawRedditPost[] = [];
  
  // Simple regex-based parsing (no external XML parser needed)
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    
    // Extract fields
    const idMatch = entry.match(/<id>.*?\/comments\/([a-z0-9]+)\//i);
    const titleMatch = entry.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) || entry.match(/<title>(.*?)<\/title>/i);
    const subredditMatch = entry.match(/<category\s+term="([^"]+)"/i);
    const linkMatch = entry.match(/<link[^>]+href="([^"]+)"/i);
    const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i);
    const publishedMatch = entry.match(/<published>(.*?)<\/published>/i);
    
    if (!idMatch || !titleMatch) continue;
    
    // Extract upvotes and comments from content
    const content = contentMatch?.[1] || "";
    const upvotesMatch = content.match(/(\d+)\s*points?/i);
    const commentsMatch = content.match(/(\d+)\s*comments?/i);
    
    posts.push({
      data: {
        id: idMatch[1],
        subreddit_name_prefixed: `r/${subredditMatch?.[1] || "unknown"}`,
        title: titleMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
        ups: parseInt(upvotesMatch?.[1] || "0", 10),
        num_comments: parseInt(commentsMatch?.[1] || "0", 10),
        created_utc: publishedMatch?.[1] ? new Date(publishedMatch[1]).getTime() / 1000 : Date.now() / 1000,
        permalink: linkMatch?.[1] || "",
        url: linkMatch?.[1] || "",
        domain: "reddit.com",
        is_self: true,
        is_video: false,
        post_hint: "self",
      },
    });
  }
  
  return posts;
}

// Convert timestamp to relative time
function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return `${Math.floor(seconds / 604800)}w`;
}

// Check if post passes all quality filters (NO TIME FILTER - let all ages through)
function passesFilters(post: RawRedditPost): { passes: boolean; reason?: string } {
  const data = post.data;
  
  // Layer 2: Post type filter
  // Skip videos
  if (data.is_video) return { passes: false, reason: "video" };
  
  // Skip image posts (post_hint: 'image')
  if (data.post_hint === "image") return { passes: false, reason: "image" };
  
  // Layer 3: Domain filter
  const domain = data.domain.toLowerCase();
  if (blockedDomains.some(blocked => domain.includes(blocked))) {
    return { passes: false, reason: "blocked_domain" };
  }
  
  // Layer 5: Engagement quality score
  // Skip posts with very low comment-to-upvote ratio (passive content)
  if (data.ups > 100) { // Only apply to posts with significant upvotes
    const ratio = data.num_comments / data.ups;
    if (ratio < MIN_QUALITY_RATIO) {
      return { passes: false, reason: `low_ratio:${ratio.toFixed(4)}` };
    }
  }
  
  return { passes: true };
}

// Transform raw Reddit post to our format
function transformPost(post: RawRedditPost, isRising = false): RedditPost {
  const data = post.data;
  return {
    id: data.id,
    subreddit: data.subreddit_name_prefixed,
    title: data.title,
    upvotes: data.ups,
    comments: data.num_comments,
    timeAgo: timeAgo(data.created_utc),
    permalink: `https://reddit.com${data.permalink}`,
    url: data.url,
    domain: data.domain,
    postHint: data.post_hint || null,
    createdAt: data.created_utc * 1000,
    isRising,
  };
}

// Main fetch function - gets posts from multiple subreddits (hot + rising, no age filters)
export async function fetchCategoryPosts(
  subreddits: string[],
  limitPerSubreddit = 20
): Promise<{ posts: RedditPost[]; error?: string }> {
  const errors: string[] = [];
  
  // Fetch HOT posts (popular now, any age)
  const hotPromises = subreddits.map(sr => fetchSubreddit(sr, "hot", limitPerSubreddit));
  const hotResults = await Promise.all(hotPromises);
  const hotPosts = hotResults.flatMap(r => {
    if (r.error) errors.push(r.error);
    return r.posts;
  });
  
  // Fetch RISING posts (gaining momentum, any age)
  const risingPromises = subreddits.map(sr => fetchSubreddit(sr, "rising", Math.floor(limitPerSubreddit / 2)));
  const risingResults = await Promise.all(risingPromises);
  const risingPosts = risingResults.flatMap(r => {
    if (r.error) errors.push(r.error);
    return r.posts;
  });
  
  console.log(`Fetched ${hotPosts.length} hot + ${risingPosts.length} rising = ${hotPosts.length + risingPosts.length} total posts`);
  
  // If we got no posts, return the error
  if (hotPosts.length === 0 && risingPosts.length === 0 && errors.length > 0) {
    return { posts: [], error: errors[0] };
  }
  
  // Apply quality filters (no time filter)
  const filterStats: Record<string, number> = {};
  
  const filteredHot = hotPosts.filter(post => {
    const result = passesFilters(post);
    if (!result.passes && result.reason) {
      filterStats[result.reason] = (filterStats[result.reason] || 0) + 1;
    }
    return result.passes;
  });
  
  const filteredRising = risingPosts.filter(post => {
    const result = passesFilters(post);
    if (!result.passes && result.reason) {
      filterStats[result.reason] = (filterStats[result.reason] || 0) + 1;
    }
    return result.passes;
  });
  
  console.log("Filter stats:", filterStats);
  console.log(`${filteredHot.length} hot + ${filteredRising.length} rising passed filters`);
  
  // Transform to our format (mark rising posts)
  const transformedHot = filteredHot.map(post => transformPost(post, false));
  const transformedRising = filteredRising.map(post => transformPost(post, true));
  
  // Combine and remove duplicates (same post might be in both hot and rising)
  const allPosts = [...transformedRising, ...transformedHot];
  const seen = new Set<string>();
  const uniquePosts: RedditPost[] = [];
  
  for (const post of allPosts) {
    if (!seen.has(post.id)) {
      seen.add(post.id);
      uniquePosts.push(post);
    }
  }
  
  // Sort: Rising posts first (they're surging), then hot posts by upvotes
  const risingCount = uniquePosts.filter(p => p.isRising).length;
  const hotPosts_sorted = uniquePosts.filter(p => !p.isRising).sort((a, b) => b.upvotes - a.upvotes);
  const sortedPosts = [...uniquePosts.filter(p => p.isRising), ...hotPosts_sorted];
  
  console.log(`Returning ${sortedPosts.length} unique posts (${risingCount} rising)`);
  
  return { posts: sortedPosts };
}

// Fetch pain points from problem-focused subreddits (RSS works, search API is blocked)
export async function fetchPainPoints(): Promise<{ posts: RedditPost[]; error?: string }> {
  console.log("Fetching pain points from problem subreddits...");
  
  // Subreddits where people complain or ask for help
  const problemSubreddits = [
    "HelpMeFind",
    "Advice", 
    "NoStupidQuestions",
    "TooAfraidToAsk",
    "needadvice",
    "Help",
    "answers",
    "findareddit",
    "smallbusiness",
    "startups",
    "SaaS",
    "programming",
  ];
  
  // Fetch from these subreddits via RSS (works on Vercel)
  const promises = problemSubreddits.map(sr => fetchSubreddit(sr, "hot", 25));
  const results = await Promise.all(promises);
  const allRawPosts = results.flatMap(r => r.posts);
  
  console.log(`Fetched ${allRawPosts.length} total posts from problem subreddits`);
  
  // Filter for pain point keywords in title
  const painPointPosts = allRawPosts.filter(post => {
    const title = post.data.title.toLowerCase();
    return complaintKeywords.some(keyword => title.includes(keyword));
  });
  
  console.log(`Found ${painPointPosts.length} posts matching pain point keywords`);
  
  if (painPointPosts.length === 0) {
    return { posts: [], error: "No pain points found right now. Try again later." };
  }
  
  // Apply quality filters
  const filterStats: Record<string, number> = {};
  const filtered = painPointPosts.filter(post => {
    const result = passesFilters(post);
    if (!result.passes && result.reason) {
      filterStats[result.reason] = (filterStats[result.reason] || 0) + 1;
    }
    return result.passes;
  });
  
  console.log("Filter stats:", filterStats);
  console.log(`${filtered.length} pain points passed filters`);
  
  // Transform and sort by upvotes
  const transformed = filtered.map(post => transformPost(post, false));
  transformed.sort((a, b) => b.upvotes - a.upvotes);
  
  // Limit to top 50
  const limited = transformed.slice(0, 50);
  
  console.log(`Returning ${limited.length} pain points`);
  
  return { posts: limited };
}
