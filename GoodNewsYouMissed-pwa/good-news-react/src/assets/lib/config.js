// src/lib/config.js - COMPLETE AI-READY VERSION WITH PARALLEL FETCH
export const CONFIG = {
  __DEBUG: "THIS IS THE CORRECT CONFIG FILE LOADED",
  version: "2.2.0",

    // NEW: FETCH STRATEGY CONFIGURATION
  // Options: 'conservative' (default) or 'aggressive'
  fetchStrategy: 'conservative',

  newsData: {
    baseUrl: "https://newsdata.io/api/1/latest",
    
    // FREE-TIER SAFE CORE PARAMETERS (VALIDATED)
    safeParams: {
      country: 'us',           // ONE country only (free tier)
      language: 'en',          // One language
      size: 10,                // MAX 10 for free tier
    },

    // DAILY THEME ROTATION (Keep for UI/fallback)
    dailyThemes: [
      { id: 'monday',    category: 'technology',  keyword: 'innovation' },
      { id: 'tuesday',   category: 'science',     keyword: 'discovery' },
      { id: 'wednesday', category: 'health',      keyword: 'wellbeing' },
      { id: 'thursday',  category: 'environment', keyword: 'sustainability' },
      { id: 'friday',    category: 'technology',  keyword: 'space' },
      { id: 'saturday',  category: 'science',     keyword: 'research' },
      { id: 'sunday',    category: 'health',      keyword: 'community' }
    ],

    // PARALLEL FETCHING STRATEGY (NEW - For Volume & Viability)
    parallelFetch: {
      // Core categories to fetch every cycle. 3-4 is optimal for free tier.
      targetCategories: ['technology', 'science', 'health', 'environment'],
      // Set to false to revert to single daily theme
      enabled: true,
    },

    // SAFETY & LIMITS
    limits: {
      maxArticlesPerRequest: 10,
      maxRequestsPerDay: 30,
      delayBetweenRequests: 30000,
      fallbackCacheHours: 72
    }
  },

   // NEW: MULTI-PROVIDER CONFIGURATION
  apiProviders: {
    // PRIMARY: NewsAPI.org (Better volume - 20 articles/request)
    newsapi: {
      baseUrl: "https://newsapi.org/v2/top-headlines",
      targetCategories: ['technology', 'science', 'health'],
      // Free Tier Limits: 100 requests/day, 20 articles/request
      limits: { maxArticlesPerRequest: 20, maxRequestsPerDay: 100 },
      enabled: true,
      priority: 1,
      params: {
        country: 'us',
        pageSize: 20, // NewsAPI allows 20 vs NewsData's 10
        apiKey: null // Will be filled from env
      }
    },
    // FALLBACK: NewsData.io (Your current reliable source)
    newsdata: {
      baseUrl: "https://newsdata.io/api/1/latest",
      targetCategories: ['technology', 'science', 'health', 'environment'],
      limits: { maxArticlesPerRequest: 10, maxRequestsPerDay: 30 },
      enabled: true,
      priority: 2,
      params: {
        country: 'us',
        language: 'en',
        size: 10
      }
    }
  },

  // COMPLETE AI CONFIGURATION (MATCHES FIREBASE STRUCTURE)
  ai: {
    // Gemini Model Configuration
    model: "gemini-2.5-flash",
    temperature: 0.1,
    maxOutputTokens: 2000,
    timeout: 30000,

    // Content Safety (for basicKeywordFilter fallback)
    contentSafety: {
      negativeKeywords: [
        'dead', 'killed', 'attack', 'crime', 'war', 
        'protest', 'disaster', 'tragedy', 'death'
      ],
      
      // Advanced patterns for filtering (from Firebase)
      unsafePatterns: [
        /violence/i,
        /hate/i,
        /sexual/i,
        /abuse/i,
        /harassment/i,
        /extremism/i
      ]
    },

    // API Rate Limits (for future use)
    apiRateLimits: {
      gemini: {
        callsPerMinute: 30  // Gemini free tier limit
      }
    }
  },

  // APPLICATION CATEGORIES (USED BY AI PROMPT)
  // This MUST match what the AI will output
  categories: [
    "SCIENCE", 
    "TECHNOLOGY", 
    "ENVIRONMENT", 
    "HEALTH", 
    "COMMUNITY", 
    "ANIMALS", 
    "INNOVATION"
  ],

  // TRENDING SCORES (for future engagement features)
  trendingWeights: {
    views: 1,
    saves: 2,
    shares: 3
  },

  // VALID SHARING PLATFORMS (for future sharing feature)
  validPlatforms: ['twitter', 'facebook', 'email', 'copy', 'whatsapp', 'reddit']
};