// src/lib/services/news-service.js - FREE-TIER COMPLIANT
import axios from 'axios';
import { CONFIG } from '../config.js';
import { withRetry } from '../utils.js';

// Helper to get today's theme from config (UPDATED FOR FREE TIER)
function getTodaysTheme() {
  const today = new Date();
  const dayIndex = today.getDay(); // 0=Sunday, 1=Monday...
  
  // Map Sunday (0) to index 6, Monday (1) to 0, etc.
  const themeIndex = dayIndex === 0 ? 6 : dayIndex - 1;
  
  // Fallback if index is out of bounds
  const theme = CONFIG.newsData.dailyThemes[themeIndex] || 
               CONFIG.newsData.dailyThemes[0]; // Monday fallback
  
  console.log(`📅 Today is ${today.toLocaleDateString('en-US', { weekday: 'long' })}`);
  console.log(`📅 Using theme: ${theme.category} (${theme.keyword})`);
  
  return theme;
}

// Core single-theme fetch (RESPECTS 1-CATEGORY LIMIT)
async function fetchArticlesForTheme(theme) {
  console.log(`📡 Fetching for ${theme.category}...`);

  const apiKey = import.meta.env.VITE_NEWSDATA_API_KEY;
  if (!apiKey || apiKey === 'your_actual_key_here') {
    throw new Error('Missing API key. Add VITE_NEWSDATA_API_KEY to .env.local');
  }

  // FREE-TIER SAFE PARAMETERS (NO HALLUCINATIONS!)
  const params = {
    apikey: apiKey,
    ...CONFIG.newsData.safeParams,  // country: 'us', language: 'en', size: 10
    category: theme.category,       // SINGLE category only (free-tier limit)
    // Keyword search (OPTIONAL - keep under 100 chars)
    // q: theme.keyword.substring(0, 50)  // Free tier: 100 char max
  };

  // LOG THE EXACT REQUEST (for debugging)
  console.log('🔧 Request params:', { 
    country: params.country,
    language: params.language,
    category: params.category,
    size: params.size,
    hasKeyword: !!params.q
  });

  try {
    const response = await axios.get(CONFIG.newsData.baseUrl, {
      params,
      timeout: 10000,
      headers: {
        'User-Agent': 'GoodNewsApp/1.0 (Free Tier)',
        'Accept': 'application/json'
      }
    });

    if (!response.data?.results) {
      console.warn("⚠️ API returned no results field");
      return [];
    }

    console.log(`📊 Raw API returned ${response.data.results.length} articles`);

    // BASIC FILTERING (before AI)
    const validArticles = response.data.results.filter(article => {
      const hasTitle = article.title && article.title.length > 10;
      const hasLink = article.link;
      
      // Log filtered articles for debugging
      if (!hasTitle) {
        console.log(`❌ Filtered: Title too short or missing - "${article.title?.substring(0, 30)}..."`);
      }
      if (!hasLink) {
        console.log(`❌ Filtered: Missing link - "${article.title?.substring(0, 30)}..."`);
      }
      
      return hasTitle && hasLink;
    });

    console.log(`✅ Valid articles after basic filtering: ${validArticles.length}`);
    
    if (validArticles.length > 0) {
      console.log(`📰 Sample: "${validArticles[0].title?.substring(0, 60)}..."`);
    }
    
    return validArticles;

  } catch (error) {
    console.error(`❌ Fetch failed for ${theme.category}:`, error.message);
    
    // ENHANCED ERROR LOGGING
    if (error.response) {
      console.error(`📊 HTTP ${error.response.status}:`, error.response.data);
      
      if (error.response.status === 422) {
        console.error('🚨 422 Error - Likely free-tier parameter violation!');
        console.error('   Check: Single category, size ≤ 10, valid country');
      }
    }
    
    throw error; // Re-throw for withRetry
  }
}

// MAIN EXPORT: Your app calls this function
export async function fetchArticlesFromNewsDataEnhanced() {
  console.log("🚀 Starting free-tier scheduled fetch...");
  const startTime = Date.now();

  // 1. Get today's prescribed single category
  const todaysTheme = getTodaysTheme();

  try {
    // 2. Fetch articles with retry logic
    const articles = await withRetry(
      () => fetchArticlesForTheme(todaysTheme),
      2, // maxAttempts (free tier: be conservative)
      2000 // initialDelay (2 seconds - respect rate limits)
    );

    const duration = Date.now() - startTime;
    
    if (articles.length > 0) {
      console.log(`🎉 SUCCESS: ${articles.length} articles in ${duration}ms`);
      console.log(`   Category: ${todaysTheme.category}`);
      console.log(`   Credits used: 1 (${199} remaining today)`);
    } else {
      console.log(`ℹ️ No valid articles found for ${todaysTheme.category} (${duration}ms)`);
    }
    
    return articles;

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`💥 All fetch attempts failed after ${duration}ms`);
    
    // GRACEFUL FALLBACK: Return empty array, UI shows cached content
    return [];
  }
}

// ADVANCED: Multi-fetch scheduler (for future use)
export async function fetchScheduledDigest() {
  console.log("⏰ Scheduled digest running...");
  
  // Respect free-tier rate limits: 30 requests/15min
  const delayBetweenRequests = CONFIG.newsData.limits.delayBetweenRequests; // 30000ms
  
  const results = [];
  
  // Example: Fetch 2 themes with delay (morning & evening)
  const themesToFetch = [
    CONFIG.newsData.dailyThemes[0], // Monday tech
    CONFIG.newsData.dailyThemes[1]  // Tuesday science (or use logic for AM/PM)
  ];
  
  for (const theme of themesToFetch) {
    try {
      console.log(`⏳ Fetching ${theme.category}...`);
      const articles = await fetchArticlesForTheme(theme);
      results.push(...articles);
      
      // CRITICAL: Delay to respect 30 requests/15min rate limit
      await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
      
    } catch (error) {
      console.error(`Failed for ${theme.category}:`, error.message);
      // Continue with next theme
    }
  }
  
  return results;
}