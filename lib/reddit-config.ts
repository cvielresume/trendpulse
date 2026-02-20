// Curated subreddits for quality content only
// Skip meme-heavy subreddits like r/funny, r/memes, r/pics

export const subredditMapping: Record<string, string[]> = {
  trending: ["popular"], // Special case - will apply extra filtering
  
  tech: [
    "technology",
    "programming", 
    "compsci",
    "hardware",
    "webdev",
    "rust",
    "golang",
    "python",
  ],
  
  business: [
    "startups",
    "entrepreneur",
    "SaaS",
    "smallbusiness",
    "business",
    "Ecommerce",
    "marketing",
  ],
  
  ai: [
    "MachineLearning",
    "artificial",
    "LocalLLaMA",
    "OpenAI",
    "AnthropicAI",
    "StableDiffusion",
  ],
  
  crypto: [
    "Bitcoin",
    "ethereum",
    "CryptoCurrency",
    "defi",
  ],
  
  science: [
    "science",
    "space",
    "Futurology",
    "askscience",
    "physics",
    "biology",
  ],
  
  ideas: [
    "BusinessIdeas",
    "StartupIdeas",
    "SideProject",
    "AppIdeas",
    "microSaaS",
  ],
};

// Domains to skip (memes, images, videos)
export const blockedDomains = [
  "i.redd.it",
  "v.redd.it", 
  "imgur.com",
  "i.imgur.com",
  "gfycat.com",
  "giphy.com",
];

// Minimum comment-to-upvote ratio to be considered quality
// Below this = probably passive content (memes), not discussion
export const MIN_QUALITY_RATIO = 0.02; // 2 comments per 100 upvotes
