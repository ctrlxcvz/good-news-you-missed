// src/lib/services/ai-service.js - SURGICALLY EXTRACTED & FIXED
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG } from '../config.js';
import { withRetry } from '../utils.js';

// Initialize Gemini AI client
function initGeminiClient() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing VITE_GEMINI_API_KEY in .env.local');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ 
    model: CONFIG.ai.model,
    generationConfig: {
      temperature: CONFIG.ai.temperature,
      maxOutputTokens: CONFIG.ai.maxOutputTokens || 2000,
    }
  });
}

/**
 * FIRST-PASS FILTER: Basic keyword-based positivity check
 * Extracted from Firebase basicKeywordFilter (lines 1096-1150)
 * @param {Array} articles - Raw articles from NewsData.io
 * @returns {Promise<Array>} Filtered articles with basic enrichment
 */
export async function basicKeywordFilter(articles) {
  console.log(`🔍 Running basic keyword filter on ${articles.length} articles...`);

  const positiveKeywords = {
    SCIENCE: ['discovery', 'breakthrough', 'research', 'scientists', 'study', 'finding'],
    TECHNOLOGY: ['innovation', 'app', 'software', 'tech', 'digital', 'robot', 'AI', 'artificial intelligence'],
    ENVIRONMENT: ['renewable', 'clean energy', 'conservation', 'wildlife', 'sustainable', 'eco-friendly'],
    HEALTH: ['medical', 'treatment', 'vaccine', 'healthcare', 'wellness', 'recovery', 'cure'],
    COMMUNITY: ['volunteer', 'donation', 'charity', 'community', 'helping', 'support'],
    ANIMALS: ['rescue', 'animal', 'pet', 'wildlife', 'species', 'protection'],
    INNOVATION: ['invention', 'new device', 'creative', 'solution', 'patent']
  };

  const filteredArticles = articles
    .filter(article => {
      if (!article.title) return false;
      const title = article.title.toLowerCase();
      
      // Check for negative keywords (from Firebase CONFIG.contentSafety.negativeKeywords)
      const hasNegative = CONFIG.ai.contentSafety.negativeKeywords?.some(keyword => 
        title.includes(keyword.toLowerCase())
      ) || [
        'dead', 'killed', 'attack', 'crime', 'war', 
        'protest', 'disaster', 'tragedy', 'death'
      ].some(keyword => title.includes(keyword));
      
      // Check for positive keywords
      const hasPositive = Object.values(positiveKeywords)
        .flat()
        .some(keyword => title.includes(keyword));
      
      return !hasNegative && hasPositive;
    })
    .map(article => {
      const title = article.title.toLowerCase();
      let category = 'COMMUNITY';
      
      // Determine category based on keywords
      for (const [cat, keywords] of Object.entries(positiveKeywords)) {
        if (keywords.some(keyword => title.includes(keyword))) {
          category = cat;
          break;
        }
      }
      
      return {
        uniqueId: article.link,
        title: article.title,
        summary: `A positive story about ${category.toLowerCase()}.`,
        category: category,
        link: article.link,
        source: article.source_id || article.source || "Unknown",
        publishedOriginal: article.pubDate || article.publishedAt || null,
        fetchedAt: new Date().toISOString(),
      };
    })
    .slice(0, 5); // Limit to 5 for fallback

  console.log(`✅ Basic filter: ${articles.length} → ${filteredArticles.length} articles`);
  return filteredArticles;
}

/**
 * MAIN AI ENGINE: Analyzes articles with Gemini AI for positivity and enrichment
 * Extracted from Firebase filterAndEnrichArticlesWithAI (lines 1014-1250)
 * Enhanced with article summarization feature
 * @param {Array} rawArticles - Articles from fetchArticlesFromNewsDataEnhanced()
 * @returns {Promise<Array>} Enriched articles with summaries, categories, and positivity scores
 */
export async function filterAndEnrichArticlesWithAI(rawArticles) {
  console.log(`🧠 Starting AI enrichment for ${rawArticles.length} articles...`);
  const startTime = Date.now();

  // Fallback to basic filter if no Gemini API key
  if (!import.meta.env.VITE_GEMINI_API_KEY) {
    console.warn('No Gemini API key, falling back to basic keyword filter');
    return await basicKeywordFilter(rawArticles);
  }

  try {
    const model = initGeminiClient();

        // 🧨 ADD THESE DEBUG LOGS HERE:
    console.log('🧨 DEBUG: CONFIG.ai.model is set to:', CONFIG.ai.model);
    console.log('🧨 DEBUG: Model object from initGeminiClient:', model);
    console.log('🧨 DEBUG: Full CONFIG.ai:', JSON.stringify(CONFIG.ai, null, 2));
    console.log('🧨 DEBUG: Is CONFIG defined?', typeof CONFIG !== 'undefined');
    console.log('🧨 DEBUG: config.js file location:', import.meta.resolve('../config.js'));
    console.log('🧨 DEBUG: config.js import path:', import.meta.url);
    console.log('🧨 DEBUG: Current directory:', new URL('.', import.meta.url).pathname);
    console.log('🧨 🔥 NUCLEAR DEBUG: Is CONFIG.__DEBUG defined?', CONFIG.__DEBUG);
    console.log('🧨 🔥 NUCLEAR DEBUG: Full CONFIG loaded:', CONFIG);
    
    // Prepare articles for AI analysis
    const articlesForAI = rawArticles.map(article => ({
      uniqueId: article.link,
      title: article.title,
      pubDate: article.pubDate || article.publishedAt,
      description: article.description || '',
      content: article.content || ''
    }));

    // PROMPT: Extracted from Firebase (lines 1055-1085) with summarization enhancement
    // FIX: Changed CONFIG.appCategories to CONFIG.categories
    const prompt = `
You are a "Good News" curator. Your task is to analyze the following list of news articles.

CRITERIA: Select ONLY articles that meet ALL of these conditions:
1. POSITIVE/UPLIFTING: The story is predominantly good, hopeful, or celebrates human/animal achievement.
2. NOT POLITICAL: Does not focus on elections, parties, protests, or political controversy.
3. NOT TRAGIC/CRIME: Does not focus on violence, disaster, death, or criminal activity.
4. HAS SUBSTANCE: Is not purely celebrity gossip or trivial entertainment.

OUTPUT FORMAT: For each article that meets the criteria, return an object in a JSON array with this EXACT structure:
{
  "uniqueId": "The exact 'uniqueId' string provided above (this is the article link)",
  "title": "The exact, original headline text",
  "summary": "A 1-2 sentence, uplifting summary of why this is good news",
  "category": "One of: ${CONFIG.categories ? CONFIG.categories.join(', ') : 'SCIENCE, TECHNOLOGY, ENVIRONMENT, HEALTH, COMMUNITY, ANIMALS, INNOVATION'}"
}

INSTRUCTIONS:
- Return a JSON array containing ONLY objects for articles that pass the filter.
- Omit articles that do not meet the criteria entirely.
- Do not include any other text, explanations, or markdown formatting.

ARTICLES TO ANALYZE:
${JSON.stringify(articlesForAI, null, 2)}
`;

    // AI API call with retry logic (adapted from Firebase withRetry)
    // FIX: Moved safetySettings OUTSIDE generationConfig to the top level
    const aiCall = async () => {
      try {
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ],
        });
        
        const responseText = result.response.text();
        
        if (!responseText || responseText.trim() === '') {
          throw new Error('AI returned empty response');
        }
        
        return responseText;
        
      } catch (error) {
        console.error('Gemini API error:', error.message);
        
        // Handle specific Gemini API errors (simplified from Firebase)
        const errorMessage = error.message || '';
        if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
          throw new Error('Gemini API quota exceeded - using fallback filter');
        } else if (errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('API key')) {
          throw new Error('Invalid Gemini API key - using fallback filter');
        }
        
        throw error;
      }
    };

    // Execute with retry (using our utils.js withRetry)
    const responseText = await withRetry(aiCall, 2, 2000);
    
    let enrichedArticles;
    try {
      enrichedArticles = JSON.parse(responseText);
      if (!Array.isArray(enrichedArticles)) {
        throw new Error('AI response was not an array');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError.message);
      return await basicKeywordFilter(rawArticles);
    }

    // Validate and filter AI response (simplified from Firebase)
    const validArticles = enrichedArticles.filter(article => 
      article.uniqueId && 
      article.title && 
      article.summary && 
      article.category &&
      article.title.length > 10
    );

    // Map back to original article data with enhanced fields
    const articleDataMap = new Map();
    rawArticles.forEach(a => {
      articleDataMap.set(a.link, { 
        source: a.source_id || a.source || "Unknown", 
        pubDate: a.pubDate || a.publishedAt || null,
        description: a.description || '',
        image: a.image_url || null
      });
    });

    const finalArticles = validArticles.map(item => {
      const data = articleDataMap.get(item.uniqueId) || {};
      
      // **ENHANCEMENT: Generate detailed summary if not already provided**
      let enhancedSummary = item.summary;
      if (data.description && item.summary.length < 100) {
        enhancedSummary = `${item.summary} ${data.description.substring(0, 150)}...`;
      }
      
      return {
        ...item,
        link: item.uniqueId,
        source: data.source,
        publishedAt: data.pubDate,
        description: data.description || enhancedSummary,
        image: data.image,
        summary: enhancedSummary, // Your requested summary feature
        aiProcessed: true,
        processedAt: new Date().toISOString(),
        positivityScore: calculatePositivityScore(item.title, item.summary)
      };
    });

    const duration = Date.now() - startTime;
    console.log(`🎉 AI enrichment complete: ${rawArticles.length} → ${finalArticles.length} articles (${duration}ms)`);
    
    return finalArticles;

  } catch (error) {
    console.error(`❌ AI enrichment failed: ${error.message}`);
    
    // Fallback to basic filter (as in Firebase)
    console.log('🔄 Falling back to basic keyword filter...');
    return await basicKeywordFilter(rawArticles);
  }
}

/**
 * HELPER: Calculate a simple positivity score (0-100)
 * Not in original Firebase code - added for your UI features
 */
function calculatePositivityScore(title, summary) {
  const positiveWords = [
    'breakthrough', 'discovery', 'help', 'aid', 'solution',
    'recovery', 'hope', 'save', 'protect', 'clean', 'green',
    'positive', 'good', 'better', 'improve', 'success'
  ];
  
  const text = `${title} ${summary}`.toLowerCase();
  let score = 50; // Neutral baseline
  
  positiveWords.forEach(word => {
    if (text.includes(word)) score += 5;
  });
  
  // Clamp between 0-100
  return Math.min(100, Math.max(0, score));
}

/**
 * HELPER: Generate standalone article summary
 * Your requested feature - not in original Firebase
 */
export async function generateArticleSummary(article) {
  if (!import.meta.env.VITE_GEMINI_API_KEY) {
    return 'Summary unavailable - AI service not configured';
  }

  try {
    const model = initGeminiClient();
    
    const prompt = `
In 2-3 clear, concise sentences, summarize the key positive development from this news article.
Focus on what makes it good/uplifting news.

Title: "${article.title}"
${article.description ? `Description: ${article.description.substring(0, 300)}` : ''}

Write a summary that:
1. Captures the main achievement or positive outcome
2. Explains why it matters
3. Is optimistic and clear

Summary:
`;
    
    const result = await model.generateContent(prompt);
    const summary = result.response.text();
    
    return summary.trim();
    
  } catch (error) {
    console.error('Summary generation failed:', error);
    return article.description 
      ? `${article.description.substring(0, 200)}...` 
      : 'Summary unavailable';
  }
}

/**
 * INTEGRATION FUNCTION: Use this in your main app
 * Combines fetching + AI processing for seamless integration
 */
export async function fetchAndProcessGoodNews() {
  console.log('🚀 Starting full good news pipeline...');
  
  try {
    // Import dynamically to avoid circular dependencies
    const { fetchArticlesFromNewsDataEnhanced } = await import('./news-service.js');
    
    // 1. Fetch articles using your working news-service
    const rawArticles = await fetchArticlesFromNewsDataEnhanced();
    
    if (!rawArticles || rawArticles.length === 0) {
      console.warn('No articles fetched, returning empty array');
      return [];
    }
    
    // 2. Process with AI
    const processedArticles = await filterAndEnrichArticlesWithAI(rawArticles);
    
    // 3. Optional: Add caching here (future Phase 5)
    
    return processedArticles;
    
  } catch (error) {
    console.error('Full pipeline failed:', error);
    return [];
  }
}