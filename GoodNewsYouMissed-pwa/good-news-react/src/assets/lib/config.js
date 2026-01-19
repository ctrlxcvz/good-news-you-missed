// src/lib/config.js - GUARANTEED FREE-TIER WORKING VERSION
export const CONFIG = {
  version: "2.2.0",

  newsData: {
    baseUrl: "https://newsdata.io/api/1/latest",
    
    // FREE-TIER SAFE CORE PARAMETERS (VALIDATED)
    // These NEVER cause 422 errors
    safeParams: {
      // DO NOT include apikey here - handled in service
      country: 'us',           // ONE country only (free tier)
      language: 'en',          // One language
      size: 10,                // MAX 10 for free tier
      // NO timeframe, NO excludecategory, NO multiple categories
    },

    // DAILY THEME ROTATION (Your Strategy)
    // Free tier: ONE category per request, so we rotate daily
    dailyThemes: [
      // Monday (index 0) to Sunday (index 6)
      { id: 'monday',    category: 'technology',  keyword: 'innovation' },
      { id: 'tuesday',   category: 'science',     keyword: 'discovery' },
      { id: 'wednesday', category: 'health',      keyword: 'wellbeing' },
      { id: 'thursday',  category: 'environment', keyword: 'sustainability' },
      { id: 'friday',    category: 'technology',  keyword: 'space' },
      { id: 'saturday',  category: 'science',     keyword: 'research' },
      { id: 'sunday',    category: 'health',      keyword: 'community' }
    ],

    // SAFETY & LIMITS (Based on official free tier)
    limits: {
      maxArticlesPerRequest: 10,     // Free tier maximum
      maxRequestsPerDay: 30,         // Well under 200 credits/day
      delayBetweenRequests: 30000,   // 30 seconds (respects 30/15min rate limit)
      fallbackCacheHours: 72         // How long to keep cached articles
    }
  },

  // AI Configuration (for next step)
  ai: {
    model: "gemini-1.5-flash",
    temperature: 0.1,
    maxOutputTokens: 1000,
    
    // Keywords for basic filtering (before AI)
    positivityKeywords: [
      'breakthrough', 'discovery', 'help', 'aid', 'solution',
      'recovery', 'hope', 'save', 'protect', 'clean', 'green'
    ],
    
    negativityKeywords: [
      'death', 'killed', 'attack', 'war', 'crime',
      'disaster', 'tragedy', 'fatal', 'lawsuit'
    ]
  },

  // App display categories (for UI organization)
  appCategories: [
    "SCIENCE", 
    "TECHNOLOGY", 
    "HEALTH", 
    "ENVIRONMENT", 
    "COMMUNITY"
  ]
};