// src/lib/services/news-service.js - WITH CONFIGURABLE STRATEGY
import axios from 'axios';
import { CONFIG } from '../config.js';
import { withRetry } from '../utils.js';

// ==================== PROVIDER-SPECIFIC FETCHERS ====================

async function fetchFromNewsAPI(category) {
  const apiKey = import.meta.env.VITE_NEWSAPI_API_KEY;
  if (!apiKey || apiKey === 'your_newsapi_key_here') {
    throw new Error('Missing VITE_NEWSAPI_API_KEY in .env.local');
  }

  const params = {
    ...CONFIG.apiProviders.newsapi.params,
    category: category,
    apiKey: apiKey
  };

  console.log(`📡 [NewsAPI] Fetching ${category}...`);
  console.log('🔧 [NewsAPI] Request params:', { 
    category: params.category,
    pageSize: params.pageSize,
    country: params.country
  });

  try {
    const response = await axios.get(CONFIG.apiProviders.newsapi.baseUrl, {
      params,
      timeout: 10000
      // No headers to avoid CORS issues
    });

    if (!response.data?.articles) {
      console.warn(`⚠️ [NewsAPI] No articles field for ${category}`);
      return [];
    }

    console.log(`📊 [NewsAPI] Raw returned ${response.data.articles.length} articles for ${category}`);

    const validArticles = response.data.articles
      .filter(article => article.title && article.title.length > 10 && article.url)
      .map(article => ({
        title: article.title,
        link: article.url,
        source: article.source?.name || "Unknown Source",
        description: article.description || '',
        content: article.content || '',
        publishedAt: article.publishedAt,
        category: category.toUpperCase(),
        image: article.urlToImage || null,
        _provider: 'newsapi'
      }));

    console.log(`✅ [NewsAPI] Valid for ${category}: ${validArticles.length}`);
    return validArticles;

  } catch (error) {
    console.error(`❌ [NewsAPI] Fetch failed for ${category}:`, error.message);
    if (error.response) {
      console.error(`📊 [NewsAPI] HTTP ${error.response.status}:`, error.response.data?.message);
    }
    throw error;
  }
}

async function fetchFromNewsData(category) {
  const apiKey = import.meta.env.VITE_NEWSDATA_API_KEY;
  if (!apiKey || apiKey === 'your_actual_key_here') {
    throw new Error('Missing VITE_NEWSDATA_API_KEY in .env.local');
  }

  const params = {
    apikey: apiKey,
    ...CONFIG.apiProviders.newsdata.params,
    category: category,
  };

  console.log(`📡 [NewsData] Fetching ${category}...`);
  console.log('🔧 [NewsData] Request params:', { 
    category: params.category,
    size: params.size,
    country: params.country
  });

  try {
    const response = await axios.get(CONFIG.apiProviders.newsdata.baseUrl, {
      params,
      timeout: 10000,
      headers: {
        'User-Agent': 'GoodNewsApp/1.0 (Free Tier)',
        'Accept': 'application/json'
      }
    });

    if (!response.data?.results) {
      console.warn(`⚠️ [NewsData] No results field for ${category}`);
      return [];
    }

    console.log(`📊 [NewsData] Raw returned ${response.data.results.length} articles for ${category}`);

    const validArticles = response.data.results
      .filter(article => article.title && article.title.length > 10 && article.link)
      .map(article => ({
        title: article.title,
        link: article.link,
        source: article.source_id || "Unknown Source",
        description: article.description || '',
        content: article.content || '',
        publishedAt: article.pubDate || article.publishedAt,
        category: category.toUpperCase(),
        image: article.image_url || null,
        _provider: 'newsdata'
      }));

    console.log(`✅ [NewsData] Valid for ${category}: ${validArticles.length}`);
    return validArticles;

  } catch (error) {
    console.error(`❌ [NewsData] Fetch failed for ${category}:`, error.message);
    if (error.response) {
      console.error(`📊 [NewsData] HTTP ${error.response.status}:`, error.response.data?.message);
    }
    throw error;
  }
}

// ==================== STRATEGY MANAGEMENT ====================

function applyFetchStrategy() {
  const strategy = CONFIG.fetchStrategy || 'conservative';
  console.log(`🎯 Active fetch strategy: ${strategy.toUpperCase()}`);
  
  // Store original priority for restoration
  const originalNewsdataPriority = CONFIG.apiProviders.newsdata.priority;
  
  if (strategy === 'aggressive') {
    // Force NewsData to run in parallel (same priority as NewsAPI)
    CONFIG.apiProviders.newsdata.priority = CONFIG.apiProviders.newsapi.priority;
    console.log('⚡ AGGRESSIVE MODE: Both providers running in parallel.');
  } else {
    // Ensure conservative mode (NewsData as fallback)
    CONFIG.apiProviders.newsdata.priority = originalNewsdataPriority > CONFIG.apiProviders.newsapi.priority 
      ? originalNewsdataPriority 
      : CONFIG.apiProviders.newsapi.priority + 1;
  }
  
  return { strategy, originalNewsdataPriority };
}

function restoreProviderConfig(originalNewsdataPriority) {
  CONFIG.apiProviders.newsdata.priority = originalNewsdataPriority;
}

// ==================== PROVIDER DISPATCHER ====================

async function fetchFromProvider(providerName) {
  const provider = CONFIG.apiProviders[providerName];
  if (!provider || !provider.enabled) {
    console.log(`⚠️ Provider ${providerName} not enabled or configured`);
    return [];
  }

  console.log(`🚀 Starting ${providerName} parallel fetch...`);
  const startTime = Date.now();

  const articlePromises = provider.targetCategories.map(category => {
    return withRetry(
      () => {
        if (providerName === 'newsapi') {
          return fetchFromNewsAPI(category);
        } else {
          return fetchFromNewsData(category);
        }
      },
      2,
      2000
    ).catch(err => {
      console.warn(`⚠️ [${providerName}] Category ${category} failed, continuing:`, err.message);
      return [];
    });
  });

  const articleArrays = await Promise.all(articlePromises);
  const allArticles = articleArrays.flat();
  
  const duration = Date.now() - startTime;
  console.log(`🎉 [${providerName}] Fetch complete: ${allArticles.length} articles in ${duration}ms`);
  
  return allArticles;
}

// ==================== MAIN EXPORT ====================

export async function fetchArticlesFromProviders() {
  console.log("🚀 Starting multi-provider fetch...");
  const startTime = Date.now();
  
  // Apply strategy configuration
  const { strategy, originalNewsdataPriority } = applyFetchStrategy();
  
  // Get active providers sorted by priority
  const activeProviders = Object.entries(CONFIG.apiProviders)
    .filter(([_, config]) => config.enabled)
    .sort((a, b) => a[1].priority - b[1].priority);

  console.log(`📋 Provider execution order: ${activeProviders.map(([name]) => name).join(' → ')}`);
  
  let allArticles = [];
  const minArticleThreshold = 40; // Threshold for skipping fallback in conservative mode

  for (const [providerName, providerConfig] of activeProviders) {
    try {
      console.log(`\n🔄 Attempting provider: ${providerName} (priority ${providerConfig.priority})`);
      const providerArticles = await fetchFromProvider(providerName);
      allArticles = [...allArticles, ...providerArticles];

      // In conservative mode, skip fallback if we have enough articles
      if (strategy === 'conservative' && allArticles.length >= minArticleThreshold) {
        console.log(`✅ Sufficient articles (${allArticles.length}) from ${providerName}, skipping fallback.`);
        break;
      }
      
      if (strategy === 'conservative' && providerArticles.length > 0) {
        console.log(`⚠️ Moderate article count from ${providerName} (${providerArticles.length}), will try fallback.`);
      }

    } catch (error) {
      console.error(`💥 Provider ${providerName} failed completely:`, error.message);
      // Continue to next provider
    }
  }

  // Restore original provider configuration
  restoreProviderConfig(originalNewsdataPriority);

  // Deduplicate articles by link
  const uniqueArticles = deduplicateArticles(allArticles);
  const duration = Date.now() - startTime;
  
  // Calculate credits used
  const creditsUsed = calculateCreditsUsed(activeProviders, strategy, minArticleThreshold, allArticles.length);
  
  console.log(`\n🎉 FINAL RESULT (${strategy.toUpperCase()} mode):`);
  console.log(`   Total unique articles: ${uniqueArticles.length}`);
  console.log(`   Provider distribution:`, countByProvider(uniqueArticles));
  console.log(`   Estimated credits used: ${creditsUsed}`);
  console.log(`   Total time: ${duration}ms`);
  
  if (uniqueArticles.length === 0) {
    console.log(`⚠️ No articles fetched from any provider.`);
  } else {
    console.log(`   Sample: "${uniqueArticles[0]?.title?.substring(0, 60)}..."`);
  }

  return uniqueArticles;
}

// ==================== HELPER FUNCTIONS ====================

function deduplicateArticles(articles) {
  const seen = new Set();
  return articles.filter(article => {
    if (!article.link) return false;
    const key = article.link.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function countByProvider(articles) {
  const counts = {};
  articles.forEach(article => {
    const provider = article._provider || 'unknown';
    counts[provider] = (counts[provider] || 0) + 1;
  });
  return counts;
}

function calculateCreditsUsed(activeProviders, strategy, threshold, totalArticles) {
  if (strategy === 'aggressive') {
    // Aggressive uses all providers
    return activeProviders.reduce((sum, [_, config]) => sum + config.targetCategories.length, 0);
  } else {
    // Conservative: count until we hit threshold
    let credits = 0;
    let accumulatedArticles = 0;
    
    for (const [providerName, providerConfig] of activeProviders) {
      credits += providerConfig.targetCategories.length;
      // Simulate articles per provider (simplified)
      accumulatedArticles += providerName === 'newsapi' ? 56 : 40;
      
      if (accumulatedArticles >= threshold) {
        break;
      }
    }
    
    return credits;
  }
}

// ==================== COMPATIBILITY WRAPPER ====================

export async function fetchArticlesFromNewsDataEnhanced() {
  console.log("📝 Note: Using configurable multi-provider fetch");
  return await fetchArticlesFromProviders();
}

// ==================== STRATEGY TEST FUNCTIONS ====================

export async function testConservativeStrategy() {
  console.log("🧪 Testing CONSERVATIVE strategy...");
  const originalStrategy = CONFIG.fetchStrategy;
  CONFIG.fetchStrategy = 'conservative';
  const result = await fetchArticlesFromProviders();
  CONFIG.fetchStrategy = originalStrategy;
  return result;
}

export async function testAggressiveStrategy() {
  console.log("🧪 Testing AGGRESSIVE strategy...");
  const originalStrategy = CONFIG.fetchStrategy;
  CONFIG.fetchStrategy = 'aggressive';
  const result = await fetchArticlesFromProviders();
  CONFIG.fetchStrategy = originalStrategy;
  return result;
}