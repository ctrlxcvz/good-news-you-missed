// ========== DEPENDENCIES ==========
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const crypto = require("crypto");

// =============================================
// VERSION TRACKING
// =============================================
/**
 * @constant {string} VERSION - Semantic version (Major.Minor.Patch)
 * Major: Breaking changes
 * Minor: New features (backward compatible)
 * Patch: Bug fixes (backward compatible)
 */
const VERSION = "2.2.0"; // Updated for deployment enhancements

// =============================================
// CENTRALIZED CONFIGURATION MANAGEMENT
// =============================================
const CONFIG = {
  version: VERSION,
  
  // Firestore configuration
  firestore: {
    batchLimit: 500,
    cleanupBatchLimit: 500,
    articleTTL: 48 * 60 * 60 * 1000, // 48 hours
    metadataTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
    bookmarkBatchSize: 10,
    maxArticlesPerCall: 100
  },
  
  // Application limits
  limits: {
    dailyArticles: 40,
    bookmarkLimit: 30,
    trendingLimit: 50,
    maxRetries: 3,
    initialRetryDelay: 1000
  },
  
  // Cache configuration
  cache: {
    categoryStatsTTL: 5, // 5 minutes
    trendingTTL: 2, // 2 minutes
    defaultTTL: 5, // 5 minutes,
    immediateInvalidation: 0.1 // 6 seconds
  },
  
  // AI configuration
  ai: {
    model: "gemini-1.5-flash",
    temperature: 0.1,
    maxTokens: 2000,
    timeout: 30000
  },
  
  // API rate limiting
  apiRateLimits: {
    newsData: {
      callsPerMinute: 30,
      timeout: 10000
    },
    gemini: {
      callsPerMinute: 30
    }
  },
  
  // NewsData.io API configuration
  newsData: {
    baseUrl: process.env.NEWSDATA_BASE_URL || "https://newsdata.io/api/1/latest",
    params: {
      country: process.env.NEWSDATA_COUNTRIES || 'us,ca,gb,au',
      language: process.env.NEWSDATA_LANGUAGE || 'en',
      prioritydomain: process.env.NEWSDATA_PRIORITY_DOMAIN || 'top',
      category: process.env.NEWSDATA_CATEGORY || 'top',
      excludecategory: process.env.NEWSDATA_EXCLUDE_CATEGORY || 'politics,crime,war',
      removeduplicate: parseInt(process.env.NEWSDATA_REMOVE_DUPLICATE || '1'),
      full_content: parseInt(process.env.NEWSDATA_FULL_CONTENT || '0'),
      size: parseInt(process.env.NEWSDATA_SIZE || '10'),
      timeframe: parseInt(process.env.NEWSDATA_TIMEFRAME || '24'),
    }
  },
  
  // Content safety configuration
  contentSafety: {
    unsafePatterns: [
      /violence/i,
      /hate/i,
      /sexual/i,
      /abuse/i,
      /harassment/i,
      /extremism/i
    ],
    negativeKeywords: [
      'dead', 'killed', 'attack', 'crime', 'war', 
      'protest', 'disaster', 'tragedy', 'death'
    ]
  },
  
  // Application categories
  categories: [
    "SCIENCE", 
    "TECHNOLOGY", 
    "ENVIRONMENT", 
    "HEALTH", 
    "COMMUNITY", 
    "ANIMALS", 
    "INNOVATION"
  ],
  
  // Trending score weights
  trendingWeights: {
    views: 1,
    saves: 2,
    shares: 3
  },
  
  // Valid platforms for sharing
  validPlatforms: ['twitter', 'facebook', 'email', 'copy', 'whatsapp', 'reddit'],
  
  // Security settings
  security: {
    maxRequestSizeKB: 10, // 10KB max request payload
    memoryWarningThresholdMB: 500,
    maxConcurrentRequests: 5, // Maximum concurrent requests per user
    requestTimeWindowMs: 30000, // 30 seconds window for concurrent requests
    cleanupIntervalMs: 30000 // Cleanup old requests every 30 seconds
  }
};

// =============================================
// CONFIGURATION VALIDATION
// =============================================
function validateConfig() {
  const issues = [];
  const warnings = [];
  
  logger.info(`Validating configuration for version ${VERSION}...`, {
    timestamp: new Date().toISOString()
  });
  
  // Validate Firestore limits
  const firestoreKeys = Object.keys(CONFIG.firestore);
  for (const key of firestoreKeys) {
    const value = CONFIG.firestore[key];
    if (typeof value === 'number' && value <= 0) {
      issues.push(`Firestore.${key} must be positive (got ${value})`);
    }
  }
  
  // Validate API rate limits
  if (CONFIG.apiRateLimits.newsData.callsPerMinute <= 0) {
    issues.push('apiRateLimits.newsData.callsPerMinute must be positive');
  }
  if (CONFIG.apiRateLimits.gemini.callsPerMinute <= 0) {
    issues.push('apiRateLimits.gemini.callsPerMinute must be positive');
  }
  
  // Validate application limits
  if (CONFIG.limits.dailyArticles <= 0) {
    issues.push('limits.dailyArticles must be positive');
  }
  if (CONFIG.limits.bookmarkLimit <= 0) {
    issues.push('limits.bookmarkLimit must be positive');
  }
  if (CONFIG.limits.trendingLimit <= 0) {
    issues.push('limits.trendingLimit must be positive');
  }
  
  // Validate TTLs
  if (CONFIG.cache.defaultTTL <= 0) {
    issues.push('cache.defaultTTL must be positive');
  }
  if (CONFIG.firestore.articleTTL <= 0) {
    issues.push('firestore.articleTTL must be positive');
  }
  
  // Check for required configuration values
  if (!CONFIG.categories || CONFIG.categories.length === 0) {
    warnings.push('No categories defined in configuration');
  }
  
  // Validate trending weights
  const weightKeys = Object.keys(CONFIG.trendingWeights);
  for (const key of weightKeys) {
    if (CONFIG.trendingWeights[key] < 0) {
      issues.push(`trendingWeights.${key} must be non-negative (got ${CONFIG.trendingWeights[key]})`);
    }
  }
  
  // Validate security settings
  if (CONFIG.security.maxRequestSizeKB <= 0) {
    issues.push('security.maxRequestSizeKB must be positive');
  }
  if (CONFIG.security.memoryWarningThresholdMB <= 0) {
    issues.push('security.memoryWarningThresholdMB must be positive');
  }
  if (CONFIG.security.maxConcurrentRequests <= 0) {
    issues.push('security.maxConcurrentRequests must be positive');
  }
  if (CONFIG.security.requestTimeWindowMs <= 0) {
    issues.push('security.requestTimeWindowMs must be positive');
  }
  if (CONFIG.security.cleanupIntervalMs <= 0) {
    issues.push('security.cleanupIntervalMs must be positive');
  }
  
  // Log validation results
  if (issues.length > 0) {
    logger.error(`Configuration validation failed with ${issues.length} issue(s):`, {
      issues,
      timestamp: new Date().toISOString()
    });
    throw new Error(`Configuration validation failed: ${issues.join('; ')}`);
  }
  
  if (warnings.length > 0) {
    logger.warn(`Configuration validation warnings: ${warnings.join('; ')}`, {
      warnings,
      timestamp: new Date().toISOString()
    });
  }
  
  logger.info(`Configuration validated successfully. Version: ${VERSION}`, {
    timestamp: new Date().toISOString(),
    issueCount: issues.length,
    warningCount: warnings.length
  });
}

// Call configuration validation on initialization
validateConfig();

// =============================================
// INITIALIZATION AND SETUP
// =============================================
initializeApp();
const db = getFirestore();

// Instance ID for debugging (multiple function instances)
const INSTANCE_ID = crypto.randomBytes(4).toString('hex');

// =============================================
// CUSTOM ERROR CLASSES FOR ENHANCED ERROR HANDLING
// =============================================
class RateLimitError extends Error {
  constructor(message, service, retryAfter = 60) {
    super(message);
    this.name = "RateLimitError";
    this.service = service;
    this.retryAfter = retryAfter;
    this.statusCode = 429;
  }
}

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.statusCode = 400;
  }
}

class ResourceNotFoundError extends Error {
  constructor(message, resource) {
    super(message);
    this.name = "ResourceNotFoundError";
    this.resource = resource;
    this.statusCode = 404;
  }
}

class ApiError extends Error {
  constructor(message, service, statusCode) {
    super(message);
    this.name = "ApiError";
    this.service = service;
    this.statusCode = statusCode || 500;
  }
}

class DatabaseError extends Error {
  constructor(message, operation) {
    super(message);
    this.name = "DatabaseError";
    this.operation = operation;
    this.statusCode = 500;
  }
}

// =============================================
// REQUEST SIZE VALIDATION HELPER
// =============================================
/**
 * Validates request payload size
 * @param {Object} data - Request data object
 * @param {number} maxSizeKB - Maximum size in KB (default: 10KB)
 * @throws {ValidationError} If request exceeds size limit
 */
function validateRequestSize(data, maxSizeKB = CONFIG.security.maxRequestSizeKB) {
  try {
    // Calculate approximate size in bytes
    const sizeInBytes = Buffer.byteLength(JSON.stringify(data || {}), 'utf8');
    const sizeInKB = sizeInBytes / 1024;
    
    if (sizeInKB > maxSizeKB) {
      throw new ValidationError(
        `Request payload too large (${sizeInKB.toFixed(2)}KB). Maximum allowed is ${maxSizeKB}KB.`,
        'requestSize'
      );
    }
    
    return {
      sizeInBytes,
      sizeInKB,
      isValid: true
    };
  } catch (error) {
    // If we can't calculate size, log warning but don't block
    logger.warn(`Unable to calculate request size: ${error.message}`, {
      instanceId: INSTANCE_ID,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    return {
      sizeInBytes: 0,
      sizeInKB: 0,
      isValid: true, // Fail-safe: allow request if size calculation fails
      error: error.message
    };
  }
}

// =============================================
// CONCURRENT REQUEST LIMITING SYSTEM
// =============================================
/**
 * @class ConcurrentRequestTracker
 * Tracks concurrent requests per user to prevent abuse
 */
class ConcurrentRequestTracker {
  constructor() {
    // Map structure: userId -> { timestamps: number[], lastCleanup: number }
    this.requestCounters = new Map();
    this.instanceId = INSTANCE_ID;
    this.cleanupInterval = null;
    this.startCleanupInterval();
  }

  /**
   * Starts periodic cleanup of old request timestamps
   */
  startCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldRequests();
    }, CONFIG.security.cleanupIntervalMs);
    
    // Ensure cleanup runs when the function instance stops
    if (typeof process.on === 'function') {
      process.on('exit', () => this.stopCleanupInterval());
    }
  }

  /**
   * Stops the cleanup interval
   */
  stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Cleans up request timestamps older than the time window
   */
  cleanupOldRequests() {
    const now = Date.now();
    const cutoff = now - CONFIG.security.requestTimeWindowMs;
    let cleanedCount = 0;
    let removedUsers = 0;

    for (const [userId, data] of this.requestCounters.entries()) {
      if (!data || !data.timestamps) {
        this.requestCounters.delete(userId);
        removedUsers++;
        continue;
      }

      const originalLength = data.timestamps.length;
      data.timestamps = data.timestamps.filter(ts => ts > cutoff);
      cleanedCount += (originalLength - data.timestamps.length);

      // Remove user entry if no active timestamps
      if (data.timestamps.length === 0) {
        this.requestCounters.delete(userId);
        removedUsers++;
      }
    }

    if (cleanedCount > 0 || removedUsers > 0) {
      logger.debug(`Concurrent request cleanup: removed ${cleanedCount} old timestamps, ${removedUsers} empty users`, {
        instanceId: this.instanceId,
        cleanedCount,
        removedUsers,
        remainingUsers: this.requestCounters.size
      });
    }
  }

  /**
   * Tracks a new request for a user
   * @param {string} userId - The user ID
   * @param {string} functionName - The function being called
   * @returns {boolean} True if request is allowed, false if limit exceeded
   */
  trackRequest(userId, functionName) {
    try {
      if (!userId) {
        logger.warn(`Attempted to track request without userId for function ${functionName}`, {
          instanceId: this.instanceId,
          functionName
        });
        return true; // Allow requests without userId (fail-safe)
      }

      // Cleanup before checking
      this.cleanupOldRequests();

      if (!this.requestCounters.has(userId)) {
        this.requestCounters.set(userId, {
          timestamps: [],
          lastCleanup: Date.now()
        });
      }

      const userData = this.requestCounters.get(userId);
      const now = Date.now();

      // Count active requests within time window
      const activeRequests = userData.timestamps.filter(ts => 
        (now - ts) < CONFIG.security.requestTimeWindowMs
      ).length;

      if (activeRequests >= CONFIG.security.maxConcurrentRequests) {
        logger.warn(`Concurrent request limit exceeded for user ${userId}`, {
          instanceId: this.instanceId,
          userId,
          functionName,
          activeRequests,
          limit: CONFIG.security.maxConcurrentRequests,
          timestamp: new Date().toISOString()
        });
        return false;
      }

      // Add current request timestamp
      userData.timestamps.push(now);
      userData.lastCleanup = now;

      // Trim array if it grows too large (safety measure)
      if (userData.timestamps.length > CONFIG.security.maxConcurrentRequests * 10) {
        userData.timestamps = userData.timestamps.slice(-CONFIG.security.maxConcurrentRequests * 2);
        logger.warn(`Trimmed request timestamps array for user ${userId}`, {
          instanceId: this.instanceId,
          userId,
          originalLength: userData.timestamps.length,
          newLength: CONFIG.security.maxConcurrentRequests * 2
        });
      }

      return true;
    } catch (error) {
      // Fail-safe: if tracking fails, allow the request
      logger.error(`Error tracking concurrent request for user ${userId}: ${error.message}`, {
        instanceId: this.instanceId,
        userId,
        functionName,
        error: error.message
      });
      return true;
    }
  }

  /**
   * Gets current request counts for monitoring
   * @returns {Object} Current tracking statistics
   */
  getStats() {
    const now = Date.now();
    const cutoff = now - CONFIG.security.requestTimeWindowMs;
    let totalActiveRequests = 0;
    const userStats = {};

    for (const [userId, data] of this.requestCounters.entries()) {
      if (!data || !data.timestamps) continue;
      const activeRequests = data.timestamps.filter(ts => ts > cutoff).length;
      userStats[userId] = activeRequests;
      totalActiveRequests += activeRequests;
    }

    return {
      instanceId: this.instanceId,
      totalUsers: this.requestCounters.size,
      totalActiveRequests,
      maxConcurrentRequests: CONFIG.security.maxConcurrentRequests,
      userStats,
      timestamp: new Date().toISOString()
    };
  }
}

// Initialize the concurrent request tracker
const concurrentRequestTracker = new ConcurrentRequestTracker();

/**
 * Wrapper function to enforce concurrent request limits
 * @param {string} userId - The user ID
 * @param {string} functionName - The function name
 * @param {Function} fn - The function to execute
 * @returns {Promise<any>} The result of the function
 * @throws {HttpsError} If concurrent request limit is exceeded
 */
async function withConcurrentLimit(userId, functionName, fn) {
  // Allow requests without userId (unauthenticated users)
  if (!userId) {
    logger.debug(`No userId provided for concurrent limit check in ${functionName}`, {
      instanceId: INSTANCE_ID,
      functionName
    });
    return fn();
  }

  // Check if request is allowed
  const isAllowed = concurrentRequestTracker.trackRequest(userId, functionName);
  
  if (!isAllowed) {
    throw new HttpsError(
      'resource-exhausted',
      `Too many concurrent requests. Maximum ${CONFIG.security.maxConcurrentRequests} requests per ${CONFIG.security.requestTimeWindowMs/1000} seconds allowed.`,
      {
        code: 'CONCURRENT_REQUEST_LIMIT_EXCEEDED',
        retryAfter: 30,
        limit: CONFIG.security.maxConcurrentRequests,
        windowSeconds: CONFIG.security.requestTimeWindowMs / 1000,
        version: VERSION
      }
    );
  }

  try {
    const result = await fn();
    return result;
  } catch (error) {
    // Re-throw the error so it can be handled by the calling function
    throw error;
  } finally {
    // Note: We don't remove the timestamp here because we track by time window
    // The cleanup interval will handle removing old timestamps
  }
}

// =============================================
// RATE LIMITING IMPLEMENTATION WITH ENHANCED SAFETY
// =============================================
const rateLimiters = new Map();

class RateLimiter {
  constructor(service, callsPerMinute) {
    this.service = service;
    this.callsPerMinute = callsPerMinute;
    this.calls = [];
    this.isEnabled = true;
    this.errorCount = 0;
  }

  checkAndWait() {
    if (!this.isEnabled) {
      logger.debug(`Rate limiter for ${this.service} is disabled due to errors`, {
        instanceId: INSTANCE_ID,
        service: this.service,
        errorCount: this.errorCount
      });
      return 0;
    }
    
    try {
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      
      // Remove calls older than 1 minute (handle potential clock skew by adding buffer)
      const buffer = 5000; // 5 second buffer for clock skew
      this.calls = this.calls.filter(callTime => callTime > (oneMinuteAgo - buffer));
      
      // If we've reached the limit, calculate wait time
      if (this.calls.length >= this.callsPerMinute) {
        const oldestCall = this.calls[0];
        const waitTime = Math.max(100, 60000 - (now - oldestCall) + 100); // Minimum 100ms wait
        
        logger.warn(`Rate limit reached for ${this.service}, waiting ${waitTime}ms`, {
          instanceId: INSTANCE_ID,
          service: this.service,
          currentCalls: this.calls.length,
          limit: this.callsPerMinute,
          waitTime,
          timestamp: new Date().toISOString()
        });
        
        return waitTime;
      }
      
      return 0;
    } catch (error) {
      this.errorCount++;
      logger.error(`Rate limiter error for ${this.service}: ${error.message}`, {
        instanceId: INSTANCE_ID,
        service: this.service,
        error: error.message,
        errorCount: this.errorCount,
        timestamp: new Date().toISOString()
      });
      
      // Disable rate limiter after multiple consecutive errors (fail-safe)
      if (this.errorCount >= 5) {
        this.isEnabled = false;
        logger.error(`Rate limiter for ${this.service} disabled after ${this.errorCount} errors`, {
          instanceId: INSTANCE_ID,
          service: this.service
        });
      }
      
      return 0; // Fail-safe: allow request through
    }
  }

  addCall() {
    if (!this.isEnabled) return;
    
    try {
      this.calls.push(Date.now());
      this.errorCount = 0; // Reset error count on successful operation
      
      // Trim array if it grows too large (safety measure)
      if (this.calls.length > this.callsPerMinute * 10) {
        logger.warn(`Rate limiter array too large for ${this.service}, trimming`, {
          instanceId: INSTANCE_ID,
          service: this.service,
          arrayLength: this.calls.length,
          limit: this.callsPerMinute
        });
        this.calls = this.calls.slice(-this.callsPerMinute * 2);
      }
    } catch (error) {
      this.errorCount++;
      logger.error(`Error adding call to rate limiter for ${this.service}: ${error.message}`, {
        instanceId: INSTANCE_ID,
        service: this.service,
        error: error.message
      });
    }
  }
}

async function checkAndWaitForRateLimit(service, callsPerMinute) {
  try {
    if (!rateLimiters.has(service)) {
      rateLimiters.set(service, new RateLimiter(service, callsPerMinute));
    }
    
    const limiter = rateLimiters.get(service);
    const waitTime = limiter.checkAndWait();
    
    if (waitTime > 0) {
      logger.info(`Waiting ${waitTime}ms for ${service} rate limit`, {
        instanceId: INSTANCE_ID,
        service,
        waitTime
      });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    limiter.addCall();
    return true;
  } catch (error) {
    logger.error(`Rate limiting failed for ${service}: ${error.message}`, {
      instanceId: INSTANCE_ID,
      service,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    // Fail-safe: allow request through if rate limiting fails
    return true;
  }
}

// =============================================
// VALIDATION HELPERS
// =============================================
function isValidArticleId(id) {
  return typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
}

function isValidCategory(category) {
  return CONFIG.categories.includes(category);
}

function sanitizePlatform(platform) {
  return CONFIG.validPlatforms.includes(platform) ? platform : 'other';
}

function isValidOrderField(field) {
  const validFields = ['publishedAt', 'trendingScore', 'views', 'saves', 'shares'];
  return validFields.includes(field);
}

function isContentSafe(text) {
  if (!text) return true;
  return !CONFIG.contentSafety.unsafePatterns.some(pattern => pattern.test(text));
}

// =============================================
// LOGGING AND METRICS WITH MEMORY MONITORING
// =============================================
function logFunctionCall(functionName, request, startTime = null) {
  const logData = {
    instanceId: INSTANCE_ID,
    userId: request.auth?.uid || 'anonymous',
    function: functionName,
    timestamp: new Date().toISOString(),
    version: VERSION
  };
  
  if (startTime) {
    const duration = Date.now() - startTime;
    logData.duration = duration;
    
    // Memory usage tracking
    const memoryUsage = process.memoryUsage();
    logData.memoryUsage = {
      rssMB: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100,
      heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100
    };
    
    // Warning if heap usage is high
    if (memoryUsage.heapUsed > CONFIG.security.memoryWarningThresholdMB * 1024 * 1024) {
      logger.warn(`High memory usage in ${functionName}: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`, logData);
    }
    
    logger.info(`✅ ${functionName} completed in ${duration}ms`, logData);
  } else {
    logger.info(`📞 ${functionName} called`, {
      ...logData,
      data: Object.keys(request.data || {}).filter(k => k !== 'password' && k !== 'token')
    });
  }
}

const performanceMetrics = {
  functions: new Map(),
  apiCalls: new Map(),
  dbOperations: new Map(),
  memoryWarnings: 0,
  
  trackFunctionStart(functionName) {
    this.functions.set(functionName, Date.now());
    return this.functions.get(functionName);
  },
  
  trackFunctionEnd(functionName, startTime) {
    if (!this.functions.has(functionName)) return 0;
    
    const duration = Date.now() - startTime;
    const memoryUsage = process.memoryUsage();
    
    // Check for memory warning
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    if (heapUsedMB > CONFIG.security.memoryWarningThresholdMB) {
      this.memoryWarnings++;
      logger.warn(`High memory usage in ${functionName}: ${heapUsedMB.toFixed(2)}MB`, {
        instanceId: INSTANCE_ID,
        function: functionName,
        heapUsedMB,
        thresholdMB: CONFIG.security.memoryWarningThresholdMB,
        timestamp: new Date().toISOString()
      });
    }
    
    logger.info(`📊 Performance: ${functionName} took ${duration}ms`, {
      instanceId: INSTANCE_ID,
      function: functionName,
      duration,
      memoryUsage: {
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100,
        heapUsedMB: Math.round(heapUsedMB * 100) / 100,
        heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
        externalMB: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100
      },
      timestamp: new Date().toISOString()
    });
    
    this.functions.delete(functionName);
    return duration;
  },
  
  trackApiCall(service, duration) {
    if (!this.apiCalls.has(service)) {
      this.apiCalls.set(service, { count: 0, totalDuration: 0 });
    }
    const stats = this.apiCalls.get(service);
    stats.count++;
    stats.totalDuration += duration;
  },
  
  getMetrics() {
    const memoryUsage = process.memoryUsage();
    const concurrentStats = concurrentRequestTracker.getStats();
    
    return {
      instanceId: INSTANCE_ID,
      version: VERSION,
      functionCount: this.functions.size,
      apiCalls: Object.fromEntries(this.apiCalls),
      dbOperations: Object.fromEntries(this.dbOperations),
      memoryUsage: {
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100,
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
        externalMB: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100,
        arrayBuffersMB: Math.round(memoryUsage.arrayBuffers / 1024 / 1024 * 100) / 100
      },
      concurrentRequests: concurrentStats,
      memoryWarnings: this.memoryWarnings,
      timestamp: new Date().toISOString()
    };
  }
};

// =============================================
// CACHE MANAGEMENT SYSTEM
// =============================================
async function getSharedCache(key, ttlMinutes = CONFIG.cache.defaultTTL) {
  try {
    const cacheRef = db.collection('shared_cache').doc(key);
    const doc = await cacheRef.get();
    
    if (!doc.exists) return null;
    
    const data = doc.data();
    const age = Date.now() - data.timestamp;
    
    if (age < ttlMinutes * 60 * 1000) {
      logger.info(`Cache hit: ${key} (${Math.round(age/1000)}s old)`, {
        instanceId: INSTANCE_ID,
        key,
        ageSeconds: Math.round(age/1000),
        ttlMinutes
      });
      return data.value;
    }
    
    logger.info(`Cache expired: ${key}`, { instanceId: INSTANCE_ID, key });
    return null;
  } catch (error) {
    logger.error(`Cache read error for ${key}:`, {
      instanceId: INSTANCE_ID,
      key,
      error: error.message
    });
    return null;
  }
}

async function setSharedCache(key, value, ttlMinutes = CONFIG.cache.defaultTTL) {
  try {
    const cacheRef = db.collection('shared_cache').doc(key);
    await cacheRef.set({
      value: value,
      timestamp: Date.now(),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + ttlMinutes * 60 * 1000))
    }, { merge: true });
    
    logger.info(`Cache set: ${key} (TTL: ${ttlMinutes}m)`, {
      instanceId: INSTANCE_ID,
      key,
      ttlMinutes
    });
  } catch (error) {
    logger.error(`Cache write error for ${key}:`, {
      instanceId: INSTANCE_ID,
      key,
      error: error.message
    });
  }
}

async function invalidateRelatedCaches(articleId = null, category = null) {
  const cacheKeys = [
    'categoryStats',
    'trendingArticles',
    'trending_10',
    'trending_20',
    'batchMetadata'
  ];
  
  if (category) {
    cacheKeys.push(`category_${category}`);
  }
  
  const invalidationPromises = cacheKeys.map(key => 
    setSharedCache(key, null, CONFIG.cache.immediateInvalidation)
  );
  
  await Promise.all(invalidationPromises);
  
  logger.info(`Caches invalidated for article ${articleId || 'system'}`, {
    instanceId: INSTANCE_ID,
    articleId,
    category,
    cacheKeysInvalidated: cacheKeys.length,
    timestamp: new Date().toISOString()
  });
}

// =============================================
// HELPER FUNCTIONS WITH RETRY LOGIC
// =============================================
async function withRetry(fn, maxAttempts = CONFIG.limits.maxRetries, initialDelay = CONFIG.limits.initialRetryDelay) {
  let attempt = 1;
  let delay = initialDelay;
  
  while (attempt <= maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxAttempts || error instanceof RateLimitError) {
        throw error;
      }
      
      // Add jitter to prevent thundering herd
      const jitter = delay * 0.1 * Math.random();
      const actualDelay = delay + jitter;
      
      logger.warn(`Retry attempt ${attempt}/${maxAttempts} failed. Waiting ${Math.round(actualDelay)}ms...`, {
        instanceId: INSTANCE_ID,
        attempt,
        maxAttempts,
        delay: Math.round(actualDelay),
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      await new Promise(resolve => setTimeout(resolve, actualDelay));
      delay *= 2;
      attempt++;
    }
  }
}

function generateArticleId(url) {
  if (!url || typeof url !== 'string') {
    throw new ValidationError('Invalid URL provided for ID generation', 'url');
  }
  
  return crypto.createHash('sha256')
    .update(url)
    .digest('hex')
    .substring(0, 32);
}

// =============================================
// DAILY COUNTER MANAGEMENT
// =============================================
async function getDailyProcessedCount() {
  const today = new Date().toISOString().split('T')[0];
  const statsRef = db.collection('daily_stats').doc(today);
  const doc = await statsRef.get();
  return doc.exists ? doc.data().count : 0;
}

async function incrementDailyProcessedCount(amount) {
  const today = new Date().toISOString().split('T')[0];
  const statsRef = db.collection('daily_stats').doc(today);
  await statsRef.set({
    count: FieldValue.increment(amount),
    date: today,
    lastUpdated: Timestamp.now()
  }, { merge: true });
}

// =============================================
// ENVIRONMENT VALIDATION
// =============================================
const requiredEnvVars = ['NEWSDATA_API_KEY', 'GEMINI_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  logger.error("CRITICAL: Missing required environment variables", {
    missing: missingVars,
    required: requiredEnvVars,
    instanceId: INSTANCE_ID,
    version: VERSION,
    timestamp: new Date().toISOString()
  });
  throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
}

// =============================================
// DEPLOYMENT AUTOMATION & SELF-HEALING
// =============================================

/**
 * @class DeploymentAssistant
 * Self-healing and deployment automation features
 */
class DeploymentAssistant {
  constructor() {
    this.instanceId = INSTANCE_ID;
    this.initialized = false;
    this.indexCreationAttempts = new Map();
    this.maxIndexAttempts = 3;
  }

  /**
   * Initialize deployment assistant on function startup
   */
  async initialize() {
    if (this.initialized) return;
    
    logger.info(`DeploymentAssistant initializing for instance ${this.instanceId}`, {
      instanceId: this.instanceId,
      version: VERSION,
      timestamp: new Date().toISOString()
    });

    try {
      // Perform initial health checks
      await this.performStartupChecks();
      
      // Set up automatic index creation monitoring
      await this.setupIndexMonitoring();
      
      this.initialized = true;
      
      logger.info(`DeploymentAssistant initialized successfully`, {
        instanceId: this.instanceId,
        version: VERSION,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`DeploymentAssistant initialization failed: ${error.message}`, {
        instanceId: this.instanceId,
        error: error.message,
        version: VERSION,
        timestamp: new Date().toISOString()
      });
      // Don't throw - fail gracefully
    }
  }

  /**
   * Perform startup health checks
   */
  async performStartupChecks() {
    const checks = [
      this.checkEnvironmentVariables(),
      this.checkFirestoreConnection(),
      this.checkApiConnectivity()
    ];

    const results = await Promise.allSettled(checks);
    
    const report = results.map((result, index) => ({
      check: ['Environment', 'Firestore', 'APIs'][index],
      status: result.status === 'fulfilled' ? 'PASS' : 'FAIL',
      error: result.status === 'rejected' ? result.reason.message : undefined
    }));

    logger.info(`Startup health check results:`, {
      instanceId: this.instanceId,
      report,
      version: VERSION,
      timestamp: new Date().toISOString()
    });

    // If critical checks fail, log but don't throw (fail-safe)
    const criticalFailures = report.filter(r => r.status === 'FAIL' && r.check !== 'APIs');
    if (criticalFailures.length > 0) {
      logger.warn(`Critical startup checks failed: ${criticalFailures.map(f => f.check).join(', ')}`, {
        instanceId: this.instanceId,
        failedChecks: criticalFailures,
        version: VERSION,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Check required environment variables
   */
  async checkEnvironmentVariables() {
    const requiredVars = ['NEWSDATA_API_KEY', 'GEMINI_API_KEY'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
    }
    
    return { status: 'ok', requiredVars: requiredVars.length };
  }

  /**
   * Check Firestore connection
   */
  async checkFirestoreConnection() {
    try {
      const testRef = db.collection('deployment_health').doc('connection_test');
      await testRef.set({
        test: true,
        timestamp: Timestamp.now(),
        instanceId: this.instanceId
      }, { merge: true });
      
      await testRef.delete();
      
      return { status: 'ok', operation: 'write_delete' };
    } catch (error) {
      throw new Error(`Firestore connection failed: ${error.message}`);
    }
  }

  /**
   * Check API connectivity (non-blocking)
   */
  async checkApiConnectivity() {
    const checks = [];
    
    // Check NewsData API (lightweight)
    if (process.env.NEWSDATA_API_KEY) {
      checks.push(this.testNewsDataApi());
    }
    
    // Check Gemini API (lightweight)
    if (process.env.GEMINI_API_KEY) {
      checks.push(this.testGeminiApi());
    }
    
    const results = await Promise.allSettled(checks);
    
    return {
      status: results.some(r => r.status === 'fulfilled') ? 'partial' : 'failed',
      details: results.map(r => ({
        service: r.status === 'fulfilled' ? r.value.service : 'unknown',
        status: r.status,
        error: r.status === 'rejected' ? r.reason.message : undefined
      }))
    };
  }

  async testNewsDataApi() {
    try {
      await axios.get('https://newsdata.io/api/1/status', {
        params: { apikey: process.env.NEWSDATA_API_KEY },
        timeout: 5000
      });
      return { service: 'newsdata', status: 'ok' };
    } catch (error) {
      // Don't throw - API might be temporarily unavailable
      return { service: 'newsdata', status: 'error', error: error.message };
    }
  }

  async testGeminiApi() {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Minimal test prompt
      await model.generateContent({
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
        generationConfig: { maxOutputTokens: 1 }
      });
      
      return { service: 'gemini', status: 'ok' };
    } catch (error) {
      return { service: 'gemini', status: 'error', error: error.message };
    }
  }

  /**
   * Set up index monitoring and auto-creation suggestions
   */
  async setupIndexMonitoring() {
    // Schedule periodic index checks (non-blocking)
    setInterval(async () => {
      try {
        await this.monitorAndSuggestIndexes();
      } catch (error) {
        // Don't crash on monitoring errors
        logger.debug(`Index monitoring error: ${error.message}`, {
          instanceId: this.instanceId,
          error: error.message
        });
      }
    }, 300000); // Check every 5 minutes
  }

  /**
   * Monitor and suggest missing indexes
   */
  async monitorAndSuggestIndexes() {
    const requiredQueries = [
      {
        name: 'articles_by_category',
        query: db.collection("news_articles")
          .where("category", "==", "SCIENCE")
          .where("isActive", "==", true)
          .orderBy("publishedAt", "desc")
          .limit(1),
        fields: ['category', 'isActive', 'publishedAt'],
        collection: 'news_articles'
      },
      {
        name: 'trending_articles',
        query: db.collection("news_articles")
          .where("isActive", "==", true)
          .where("publishedAt", ">", Timestamp.fromDate(new Date(Date.now() - 86400000)))
          .orderBy("trendingScore", "desc")
          .limit(1),
        fields: ['isActive', 'publishedAt', 'trendingScore'],
        collection: 'news_articles'
      },
      {
        name: 'cleanup_old_articles',
        query: db.collection("news_articles")
          .where("publishedAt", "<", Timestamp.fromDate(new Date(Date.now() - CONFIG.firestore.articleTTL)))
          .limit(1),
        fields: ['publishedAt'],
        collection: 'news_articles'
      }
    ];

    const results = [];
    
    for (const queryInfo of requiredQueries) {
      try {
        await queryInfo.query.get();
        results.push({
          name: queryInfo.name,
          status: 'PASS',
          indexed: true
        });
      } catch (error) {
        if (error.message && error.message.includes('requires an index')) {
          const indexKey = queryInfo.name;
          const attempts = this.indexCreationAttempts.get(indexKey) || 0;
          
          if (attempts < this.maxIndexAttempts) {
            this.indexCreationAttempts.set(indexKey, attempts + 1);
            
            const indexCreationLink = await this.generateIndexCreationLink(queryInfo);
            
            logger.warn(`Missing Firestore index detected: ${queryInfo.name}`, {
              instanceId: this.instanceId,
              indexName: queryInfo.name,
              fields: queryInfo.fields,
              collection: queryInfo.collection,
              attempts: attempts + 1,
              indexCreationLink,
              autoFixAvailable: false,
              error: error.message.substring(0, 200),
              timestamp: new Date().toISOString()
            });
            
            // Store in Firestore for admin reference
            await this.logMissingIndex(queryInfo, indexCreationLink);
          }
          
          results.push({
            name: queryInfo.name,
            status: 'FAIL',
            indexed: false,
            fields: queryInfo.fields,
            collection: queryInfo.collection,
            indexCreationLink
          });
        } else {
          results.push({
            name: queryInfo.name,
            status: 'ERROR',
            error: error.message
          });
        }
      }
    }

    return results;
  }

  /**
   * Generate Firebase console index creation link
   */
  async generateIndexCreationLink(queryInfo) {
    try {
      // Get project ID from Firestore
      const projectId = process.env.GCLOUD_PROJECT || 'unknown-project';
      
      // Create Firebase Console link format
      const fields = queryInfo.fields.map(field => `${field}:asc`).join(',');
      const compositeId = `${queryInfo.collection}:${fields}:COLLECTION`;
      
      return `https://console.firebase.google.com/project/${projectId}/firestore/indexes?create_composite=${compositeId}`;
    } catch (error) {
      return 'Unable to generate link. Please create index manually in Firebase Console.';
    }
  }

  /**
   * Log missing index for admin reference
   */
  async logMissingIndex(queryInfo, creationLink) {
    try {
      const logRef = db.collection('deployment_logs').doc(`missing_index_${queryInfo.name}_${Date.now()}`);
      
      await logRef.set({
        indexName: queryInfo.name,
        collection: queryInfo.collection,
        fields: queryInfo.fields,
        creationLink,
        detectedAt: Timestamp.now(),
        instanceId: this.instanceId,
        version: VERSION,
        status: 'pending'
      }, { merge: true });
      
      // Auto-cleanup old logs after 7 days
      setTimeout(async () => {
        try {
          await logRef.delete();
        } catch (e) {
          // Ignore cleanup errors
        }
      }, 7 * 24 * 60 * 60 * 1000);
      
    } catch (error) {
      // Don't throw - logging failures shouldn't break the app
      logger.debug(`Failed to log missing index: ${error.message}`, {
        instanceId: this.instanceId,
        error: error.message
      });
    }
  }

  /**
   * Generate deployment report
   */
  async generateDeploymentReport() {
    const report = {
      instanceId: this.instanceId,
      version: VERSION,
      timestamp: new Date().toISOString(),
      checks: {}
    };

    try {
      // Environment check
      report.checks.environment = await this.checkEnvironmentVariables();
    } catch (error) {
      report.checks.environment = { status: 'FAIL', error: error.message };
    }

    try {
      // Firestore check
      report.checks.firestore = await this.checkFirestoreConnection();
    } catch (error) {
      report.checks.firestore = { status: 'FAIL', error: error.message };
    }

    try {
      // API check
      report.checks.apis = await this.checkApiConnectivity();
    } catch (error) {
      report.checks.apis = { status: 'FAIL', error: error.message };
    }

    try {
      // Index check
      report.checks.indexes = await this.monitorAndSuggestIndexes();
    } catch (error) {
      report.checks.indexes = { status: 'ERROR', error: error.message };
    }

    // Calculate overall status
    const failedChecks = Object.values(report.checks).filter(
      check => check.status && check.status !== 'ok' && check.status !== 'partial'
    );
    
    report.overallStatus = failedChecks.length === 0 ? 'HEALTHY' : 'DEGRADED';
    report.issues = failedChecks.length;
    
    return report;
  }
}

// Initialize Deployment Assistant
const deploymentAssistant = new DeploymentAssistant();

// =============================================
// AUTO-RECOVERY & GRACEFUL DEGRADATION
// =============================================

/**
 * Auto-recovery wrapper for API calls
 */
async function withAutoRecovery(service, fn, fallbackFn = null, maxAttempts = 2) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      
      // Reset any previous failure tracking
      await recordServiceRecovery(service);
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Log the failure
      await recordServiceFailure(service, error);
      
      // If this is the last attempt, try fallback
      if (attempt === maxAttempts) {
        logger.warn(`Service ${service} failed after ${maxAttempts} attempts`, {
          instanceId: INSTANCE_ID,
          service,
          attempts: maxAttempts,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        if (fallbackFn) {
          logger.info(`Attempting fallback for ${service}`, {
            instanceId: INSTANCE_ID,
            service
          });
          return await fallbackFn();
        }
      } else {
        // Exponential backoff with jitter
        const delay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 10000);
        logger.info(`Retrying ${service} in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`, {
          instanceId: INSTANCE_ID,
          service,
          attempt,
          maxAttempts,
          delay
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Record service failure for monitoring
 */
async function recordServiceFailure(service, error) {
  try {
    const failureRef = db.collection('service_health').doc(`${service}_${Date.now()}`);
    
    await failureRef.set({
      service,
      error: error.message.substring(0, 500),
      errorType: error.name,
      timestamp: Timestamp.now(),
      instanceId: INSTANCE_ID,
      version: VERSION
    }, { merge: true });
    
    // Auto-cleanup old failures (keep last 100)
    const oldFailures = await db.collection('service_health')
      .where('service', '==', service)
      .orderBy('timestamp', 'desc')
      .offset(100)
      .get();
    
    const deletePromises = oldFailures.docs.map(doc => doc.ref.delete());
    await Promise.allSettled(deletePromises);
    
  } catch (logError) {
    // Don't throw - failure logging shouldn't break the app
    logger.debug(`Failed to record service failure: ${logError.message}`, {
      instanceId: INSTANCE_ID,
      service
    });
  }
}

/**
 * Record service recovery
 */
async function recordServiceRecovery(service) {
  try {
    const recoveryRef = db.collection('service_recoveries').doc(`${service}_${Date.now()}`);
    
    await recoveryRef.set({
      service,
      timestamp: Timestamp.now(),
      instanceId: INSTANCE_ID,
      version: VERSION
    }, { merge: true });
    
  } catch (error) {
    logger.debug(`Failed to record service recovery: ${error.message}`, {
      instanceId: INSTANCE_ID,
      service
    });
  }
}

// =============================================
// ENHANCED CONFIGURATION LOADER WITH FALLBACKS
// =============================================

class ConfigurationManager {
  constructor() {
    this.config = CONFIG;
    this.envOverrides = {};
    this.firestoreConfig = null;
  }

  /**
   * Load configuration with environment overrides
   */
  async loadConfiguration() {
    try {
      // Load environment-specific overrides
      await this.loadEnvOverrides();
      
      // Try to load from Firestore (if available)
      await this.loadFirestoreConfig();
      
      // Apply overrides
      this.applyOverrides();
      
      logger.info(`Configuration loaded successfully`, {
        instanceId: INSTANCE_ID,
        version: VERSION,
        source: this.firestoreConfig ? 'firestore' : 'default',
        overrides: Object.keys(this.envOverrides).length,
        timestamp: new Date().toISOString()
      });
      
      return this.config;
    } catch (error) {
      logger.warn(`Configuration loading failed, using defaults: ${error.message}`, {
        instanceId: INSTANCE_ID,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      return this.config; // Return defaults
    }
  }

  /**
   * Load environment variable overrides
   */
  async loadEnvOverrides() {
    // Read rate limits from environment
    if (process.env.NEWSDATA_RATE_LIMIT) {
      this.envOverrides.apiRateLimits = {
        ...this.envOverrides.apiRateLimits,
        newsData: {
          callsPerMinute: parseInt(process.env.NEWSDATA_RATE_LIMIT) || CONFIG.apiRateLimits.newsData.callsPerMinute
        }
      };
    }
    
    if (process.env.GEMINI_RATE_LIMIT) {
      this.envOverrides.apiRateLimits = {
        ...this.envOverrides.apiRateLimits,
        gemini: {
          callsPerMinute: parseInt(process.env.GEMINI_RATE_LIMIT) || CONFIG.apiRateLimits.gemini.callsPerMinute
        }
      };
    }
    
    // Read daily article limit
    if (process.env.DAILY_ARTICLE_LIMIT) {
      this.envOverrides.limits = {
        ...this.envOverrides.limits,
        dailyArticles: parseInt(process.env.DAILY_ARTICLE_LIMIT) || CONFIG.limits.dailyArticles
      };
    }
    
    // Read cache TTLs
    if (process.env.CACHE_TTL_MINUTES) {
      this.envOverrides.cache = {
        ...this.envOverrides.cache,
        defaultTTL: parseInt(process.env.CACHE_TTL_MINUTES) || CONFIG.cache.defaultTTL
      };
    }
  }

  /**
   * Load configuration from Firestore (optional)
   */
  async loadFirestoreConfig() {
    try {
      const configRef = db.collection('app_config').doc('runtime');
      const doc = await configRef.get();
      
      if (doc.exists) {
        this.firestoreConfig = doc.data();
        logger.info(`Loaded configuration from Firestore`, {
          instanceId: INSTANCE_ID,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      // Silent fail - Firestore config is optional
      logger.debug(`Firestore config not available: ${error.message}`, {
        instanceId: INSTANCE_ID
      });
    }
  }

  /**
   * Apply configuration overrides
   */
  applyOverrides() {
    // Apply Firestore config first (if available)
    if (this.firestoreConfig) {
      this.config = this.deepMerge(this.config, this.firestoreConfig);
    }
    
    // Apply environment overrides
    this.config = this.deepMerge(this.config, this.envOverrides);
    
    // Validate the merged config
    validateConfig();
  }

  /**
   * Deep merge objects
   */
  deepMerge(target, source) {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }
    
    return output;
  }

  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Get current configuration (with runtime info)
   */
  getRuntimeConfig() {
    return {
      ...this.config,
      runtime: {
        instanceId: INSTANCE_ID,
        startedAt: new Date().toISOString(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    };
  }
}

// Initialize Configuration Manager
const configManager = new ConfigurationManager();

// =============================================
// API INTEGRATION: NEWSDATA.IO
// =============================================
async function fetchArticlesFromNewsData() {
  const startTime = Date.now();
  logger.info("Fetching headlines from NewsData.io...", {
    instanceId: INSTANCE_ID,
    version: VERSION,
    timestamp: new Date().toISOString()
  });
  
  await checkAndWaitForRateLimit('newsData', CONFIG.apiRateLimits.newsData.callsPerMinute);
  
  const apiCall = async () => {
    const response = await axios.get(CONFIG.newsData.baseUrl, {
      params: {
        apikey: process.env.NEWSDATA_API_KEY,
        ...CONFIG.newsData.params
      },
      timeout: CONFIG.apiRateLimits.newsData.timeout,
      headers: {
        'User-Agent': 'GoodNewsApp/1.0',
        'Accept': 'application/json'
      }
    });
    
    const duration = Date.now() - startTime;
    performanceMetrics.trackApiCall('newsdata', duration);
    
    logger.info(`NewsData.io API call completed in ${duration}ms`, {
      instanceId: INSTANCE_ID,
      resultsCount: response.data?.results?.length || 0,
      duration,
      version: VERSION,
      timestamp: new Date().toISOString()
    });
    
    return response;
  };

  try {
    const response = await withRetry(apiCall);
    
    if (!response.data?.results) {
      throw new ApiError('No results returned from NewsData.io', 'newsdata', 404);
    }

    if (response.data.results.length === 0) {
      logger.warn("No articles returned from NewsData.io", {
        instanceId: INSTANCE_ID,
        timestamp: new Date().toISOString()
      });
      return [];
    }

    const validArticles = response.data.results.filter(article => 
      article.title && 
      article.link && 
      article.title.length > 10
    );
    
    if (validArticles.length !== response.data.results.length) {
      logger.warn(`Filtered ${response.data.results.length - validArticles.length} invalid articles`, {
        instanceId: INSTANCE_ID,
        filteredCount: response.data.results.length - validArticles.length,
        totalCount: response.data.results.length,
        timestamp: new Date().toISOString()
      });
    }
    
    const totalDuration = Date.now() - startTime;
    logger.info(`Successfully fetched ${validArticles.length} valid headlines in ${totalDuration}ms`, {
      instanceId: INSTANCE_ID,
      validCount: validArticles.length,
      duration: totalDuration,
      version: VERSION,
      timestamp: new Date().toISOString()
    });
    
    return validArticles;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error.response) {
      logger.error("NewsData.io API Error", {
        instanceId: INSTANCE_ID,
        status: error.response.status,
        statusText: error.response.statusText,
        duration,
        version: VERSION,
        timestamp: new Date().toISOString()
      });
      
      if (error.response.status === 429) {
        throw new RateLimitError('NewsData API rate limit exceeded', 'newsdata', 60);
      } else if (error.response.status === 402) {
        throw new ApiError('Quota exhausted for NewsData.io', 'newsdata', 402);
      }
      
      throw new ApiError(`NewsData API error: ${error.response.status}`, 'newsdata', error.response.status);
    }
    
    logger.error("Network error fetching from NewsData.io", {
      instanceId: INSTANCE_ID,
      error: error.message,
      duration,
      version: VERSION,
      timestamp: new Date().toISOString()
    });
    
    throw new ApiError('Network error connecting to NewsData.io', 'newsdata', 503);
  }
}

// =============================================
// ENHANCED API INTEGRATION WITH AUTO-FALLBACK
// =============================================

async function fetchArticlesFromNewsDataEnhanced() {
  const startTime = Date.now();
  
  // Primary API call with auto-recovery
  const primaryCall = async () => {
    return await fetchArticlesFromNewsData();
  };
  
  // Fallback: Use cached results from last successful fetch
  const fallbackCall = async () => {
    logger.info(`Using fallback: Loading cached articles from last successful fetch`, {
      instanceId: INSTANCE_ID,
      timestamp: new Date().toISOString()
    });
    
    try {
      // Get last successful batch
      const lastBatch = await db.collection('batch_metadata')
        .orderBy('processedAt', 'desc')
        .limit(1)
        .get();
      
      if (!lastBatch.empty) {
        const batchId = lastBatch.docs[0].data().batchId;
        const articlesSnapshot = await db.collection('news_articles')
          .where('batchId', '==', batchId)
          .where('isActive', '==', true)
          .limit(10)
          .get();
        
        const articles = articlesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        if (articles.length > 0) {
          logger.info(`Fallback loaded ${articles.length} cached articles`, {
            instanceId: INSTANCE_ID,
            batchId,
            articleCount: articles.length,
            timestamp: new Date().toISOString()
          });
          
          return articles.map(article => ({
            title: article.title,
            link: article.link || `https://app/articles/${article.id}`,
            source: article.source || 'Cached',
            summary: article.summary,
            category: article.category,
            publishedOriginal: article.publishedOriginal
          }));
        }
      }
      
      // If no cached articles, return empty array
      return [];
      
    } catch (error) {
      logger.error(`Fallback also failed: ${error.message}`, {
        instanceId: INSTANCE_ID,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      return []; // Return empty array as last resort
    }
  };
  
  try {
    const articles = await withAutoRecovery(
      'newsdata',
      primaryCall,
      fallbackCall,
      2 // Maximum 2 attempts
    );
    
    const duration = Date.now() - startTime;
    logger.info(`Article fetch completed in ${duration}ms (source: ${articles.length > 0 ? 'API' : 'fallback'})`, {
      instanceId: INSTANCE_ID,
      articleCount: articles.length,
      duration,
      source: articles.length > 0 && articles[0].source === 'Cached' ? 'cache' : 'api',
      timestamp: new Date().toISOString()
    });
    
    return articles;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`All article fetch attempts failed after ${duration}ms`, {
      instanceId: INSTANCE_ID,
      error: error.message,
      duration,
      timestamp: new Date().toISOString()
    });
    
    // Return empty array instead of throwing
    return [];
  }
}

// =============================================
// AI FILTERING AND ENRICHMENT WITH ENHANCED ERROR HANDLING
// =============================================
async function filterAndEnrichArticlesWithAI(articles) {
  const startTime = Date.now();
  logger.info(`Processing ${articles.length} articles with AI...`, {
    instanceId: INSTANCE_ID,
    articleCount: articles.length,
    version: VERSION,
    timestamp: new Date().toISOString()
  });
  
  if (!process.env.GEMINI_API_KEY) {
    logger.warn("No Gemini API key, using keyword-based fallback filter", {
      instanceId: INSTANCE_ID,
      timestamp: new Date().toISOString()
    });
    return basicKeywordFilter(articles);
  }

  await checkAndWaitForRateLimit('gemini', CONFIG.apiRateLimits.gemini.callsPerMinute);
  
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ 
    model: CONFIG.ai.model,
    generationConfig: {
      temperature: CONFIG.ai.temperature,
      maxOutputTokens: CONFIG.ai.maxTokens,
    }
  });

  const articlesForAI = articles.map(article => ({
    uniqueId: article.link,
    title: article.title,
    pubDate: article.pubDate
  }));

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
  "category": "One of: SCIENCE, TECHNOLOGY, ENVIRONMENT, HEALTH, COMMUNITY, ANIMALS, INNOVATION"
}

INSTRUCTIONS:
- Return a JSON array containing ONLY objects for articles that pass the filter.
- Omit articles that do not meet the criteria entirely.
- Do not include any other text, explanations, or markdown formatting.

ARTICLES TO ANALYZE:
${JSON.stringify(articlesForAI)}
`;

  try {
    const aiCall = async () => {
      try {
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
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
          },
        });
        
        return result;
      } catch (error) {
        // Enhanced Gemini API error handling
        const errorMessage = error.message || '';
        
        // Handle specific Gemini API errors
        if (errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('API key')) {
          throw new ApiError('Gemini API key invalid or permission denied', 'gemini', 403);
        } else if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
          throw new RateLimitError('Gemini API quota exceeded', 'gemini', 300); // 5 minutes
        } else if (errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('bad request')) {
          throw new ValidationError('Invalid request to Gemini API', 'aiRequest');
        } else if (errorMessage.includes('UNAUTHENTICATED')) {
          throw new ApiError('Authentication failed for Gemini API', 'gemini', 401);
        } else if (errorMessage.includes('DEADLINE_EXCEEDED') || errorMessage.includes('timeout')) {
          throw new ApiError('Gemini API request timeout', 'gemini', 408);
        } else if (errorMessage.includes('INTERNAL')) {
          throw new ApiError('Gemini API internal error', 'gemini', 500);
        } else if (errorMessage.includes('UNAVAILABLE')) {
          throw new ApiError('Gemini API service unavailable', 'gemini', 503);
        }
        
        // Re-throw if not a Gemini-specific error
        throw error;
      }
    };

    const result = await withRetry(aiCall);
    const responseText = result.response.text();
    
    if (!responseText || responseText.trim() === '') {
      logger.warn("AI returned empty response, using fallback filter", {
        instanceId: INSTANCE_ID,
        timestamp: new Date().toISOString()
      });
      return basicKeywordFilter(articles);
    }
    
    let enrichedArticles;
    try {
      enrichedArticles = JSON.parse(responseText);
      if (!Array.isArray(enrichedArticles)) {
        throw new ValidationError('AI response was not an array', 'aiResponse');
      }
    } catch (parseError) {
      logger.error("Error parsing AI response", {
        instanceId: INSTANCE_ID,
        error: parseError.message,
        rawResponse: responseText.substring(0, 200),
        timestamp: new Date().toISOString()
      });
      return basicKeywordFilter(articles);
    }

    const validArticles = enrichedArticles.filter(article => 
      article.uniqueId && 
      article.title && 
      article.summary && 
      article.category &&
      CONFIG.categories.includes(article.category) &&
      isContentSafe(article.title) &&
      isContentSafe(article.summary)
    );

    if (validArticles.length !== enrichedArticles.length) {
      logger.warn(`Filtered ${enrichedArticles.length - validArticles.length} invalid/unsafe articles from AI response`, {
        instanceId: INSTANCE_ID,
        filteredCount: enrichedArticles.length - validArticles.length,
        totalAIResponse: enrichedArticles.length,
        timestamp: new Date().toISOString()
      });
    }

    const articleDataMap = new Map();
    articles.forEach(a => {
      articleDataMap.set(a.link, { 
        source: a.source_id || "Unknown", 
        pubDate: a.pubDate || null
      });
    });

    const finalArticles = validArticles.map(item => {
      const data = articleDataMap.get(item.uniqueId) || {};
      return {
        ...item,
        link: item.uniqueId,
        source: data.source || "Unknown",
        publishedOriginal: data.pubDate || null,
        fetchedAt: new Date().toISOString(),
      };
    });

    const duration = Date.now() - startTime;
    performanceMetrics.trackApiCall('gemini', duration);
    
    logger.info(`AI processed ${articles.length} → ${finalArticles.length} articles in ${duration}ms`, {
      instanceId: INSTANCE_ID,
      inputCount: articles.length,
      outputCount: finalArticles.length,
      filterRatio: (finalArticles.length / articles.length).toFixed(2),
      duration,
      version: VERSION,
      timestamp: new Date().toISOString()
    });
    
    return finalArticles;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Log specific AI errors
    if (error instanceof RateLimitError) {
      logger.error("Gemini API rate limit exceeded", {
        instanceId: INSTANCE_ID,
        service: error.service,
        retryAfter: error.retryAfter,
        duration,
        timestamp: new Date().toISOString()
      });
    } else if (error instanceof ApiError) {
      logger.error(`Gemini API error (${error.statusCode}): ${error.message}`, {
        instanceId: INSTANCE_ID,
        service: error.service,
        statusCode: error.statusCode,
        duration,
        timestamp: new Date().toISOString()
      });
    } else if (error instanceof ValidationError) {
      logger.error(`Gemini API validation error: ${error.message}`, {
        instanceId: INSTANCE_ID,
        field: error.field,
        duration,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error("AI processing failed, using fallback filter", {
        instanceId: INSTANCE_ID,
        error: error.message,
        duration,
        timestamp: new Date().toISOString()
      });
    }
    
    return basicKeywordFilter(articles);
  }
}

function basicKeywordFilter(articles) {
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
      
      const hasNegative = CONFIG.contentSafety.negativeKeywords.some(pattern => title.includes(pattern));
      const hasPositive = Object.values(positiveKeywords)
        .flat()
        .some(keyword => title.includes(keyword));
      
      return !hasNegative && hasPositive;
    })
    .map(article => {
      const title = article.title.toLowerCase();
      let category = 'COMMUNITY';
      
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
        source: article.source_id || "Unknown",
        publishedOriginal: article.pubDate || null,
        fetchedAt: new Date().toISOString(),
      };
    })
    .slice(0, 5);

  logger.info(`Fallback filter processed ${articles.length} → ${filteredArticles.length} articles`, {
    instanceId: INSTANCE_ID,
    inputCount: articles.length,
    outputCount: filteredArticles.length,
    timestamp: new Date().toISOString()
  });

  return filteredArticles;
}

// =============================================
// FIRESTORE OPERATIONS
// =============================================
async function storeArticlesScalable(allFetchedArticles, filteredArticles) {
  const startTime = Date.now();
  logger.info("Storing articles to Firestore...", {
    instanceId: INSTANCE_ID,
    filteredCount: filteredArticles.length,
    version: VERSION,
    timestamp: new Date().toISOString()
  });
  
  const totalOperations = 2 + filteredArticles.length;
  if (totalOperations > CONFIG.firestore.batchLimit) {
    throw new DatabaseError(
      `Cannot store ${filteredArticles.length} articles - exceeds Firestore batch limit of ${CONFIG.firestore.batchLimit}`,
      'batch_write'
    );
  }
  
  const estimatedSize = JSON.stringify(filteredArticles).length;
  if (estimatedSize > 900 * 1024) {
    throw new DatabaseError(
      `Article data too large (${estimatedSize} bytes). Firestore limit is 1MB.`,
      'data_size'
    );
  }
  
  const batch = db.batch();
  const now = Timestamp.now();
  const batchId = `batch_${Date.now()}_${INSTANCE_ID}`;

  const articleIds = filteredArticles.map(article => generateArticleId(article.link));
  
  const existingMap = new Map();
  for (let i = 0; i < articleIds.length; i += CONFIG.firestore.bookmarkBatchSize) {
    const chunk = articleIds.slice(i, i + CONFIG.firestore.bookmarkBatchSize);
    if (chunk.length === 0) continue;
    
    const snapshot = await db.collection("news_articles")
      .where("id", "in", chunk)
      .get();
    
    snapshot.forEach(doc => existingMap.set(doc.id, doc.data()));
  }

  const categoryStats = {};
  CONFIG.categories.forEach(cat => categoryStats[cat] = 0);
  
  filteredArticles.forEach((article) => {
    const articleId = generateArticleId(article.link);
    const articleDocRef = db.collection("news_articles").doc(articleId);
    const existing = existingMap.get(articleId);
    
    if (CONFIG.categories.includes(article.category)) {
      categoryStats[article.category]++;
    }
    
    const articleData = {
      uniqueId: article.uniqueId,
      title: article.title,
      summary: article.summary,
      category: article.category,
      link: article.link,
      source: article.source,
      publishedOriginal: article.publishedOriginal,
      id: articleId,
      batchId: batchId,
      publishedAt: now,
      expiresAt: Timestamp.fromDate(new Date(Date.now() + CONFIG.firestore.articleTTL)),
      isActive: true,
      updatedAt: now,
    };
    
    if (existing) {
      articleData.views = existing.views || 0;
      articleData.saves = existing.saves || 0;
      articleData.shares = existing.shares || 0;
      articleData.sharesByPlatform = existing.sharesByPlatform || {
        twitter: 0, facebook: 0, email: 0,
        copy: 0, whatsapp: 0, reddit: 0, other: 0
      };
      articleData.trendingScore = existing.trendingScore || 0;
      articleData.lastViewedAt = existing.lastViewedAt || null;
      articleData.lastSharedAt = existing.lastSharedAt || null;
      
      batch.set(articleDocRef, articleData, { merge: true });
    } else {
      batch.set(articleDocRef, {
        ...articleData,
        views: 0,
        saves: 0,
        shares: 0,
        sharesByPlatform: {
          twitter: 0, facebook: 0, email: 0,
          copy: 0, whatsapp: 0, reddit: 0, other: 0
        },
        trendingScore: 0,
        lastViewedAt: null,
        lastSharedAt: null,
      }, { merge: false });
    }
  });

  const mainDocRef = db.collection("content").doc("latest_news");
  batch.set(mainDocRef, {
    articles: filteredArticles,
    lastUpdated: new Date().toISOString(),
    stats: {
      totalFetched: allFetchedArticles.length,
      goodNewsCount: filteredArticles.length,
      byCategory: categoryStats,
    },
    batchId: batchId,
  }, { merge: false });

  const batchDocRef = db.collection("batch_metadata").doc(batchId);
  batch.set(batchDocRef, {
    batchId: batchId,
    articleCount: filteredArticles.length,
    processedAt: now,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + CONFIG.firestore.metadataTTL)),
    instanceId: INSTANCE_ID,
  }, { merge: false });

  try {
    await batch.commit();
    
    const duration = Date.now() - startTime;
    logger.info(`Stored ${filteredArticles.length} articles in ${duration}ms`, {
      instanceId: INSTANCE_ID,
      storedCount: filteredArticles.length,
      batchId,
      duration,
      version: VERSION,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Error storing articles:", {
      instanceId: INSTANCE_ID,
      error: error.message,
      batchId,
      version: VERSION,
      timestamp: new Date().toISOString()
    });
    throw new DatabaseError('Failed to store articles to Firestore', 'batch_commit');
  }
}

// =============================================
// ENHANCED INITIALIZATION SEQUENCE
// =============================================

/**
 * Enhanced initialization that runs before any function
 */
async function initializeApplication() {
  const startTime = Date.now();
  
  try {
    logger.info(`🚀 Application initialization starting...`, {
      instanceId: INSTANCE_ID,
      version: VERSION,
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    });
    
    // Step 1: Load configuration
    await configManager.loadConfiguration();
    
    // Step 2: Initialize deployment assistant (non-blocking)
    deploymentAssistant.initialize().catch(error => {
      logger.warn(`Deployment assistant initialization failed (non-critical): ${error.message}`, {
        instanceId: INSTANCE_ID,
        error: error.message
      });
    });
    
    // Step 3: Warm up caches (non-blocking)
    warmupCaches().catch(error => {
      logger.debug(`Cache warmup failed: ${error.message}`, {
        instanceId: INSTANCE_ID,
        error: error.message
      });
    });
    
    // Step 4: Schedule health checks
    scheduleHealthChecks();
    
    const duration = Date.now() - startTime;
    logger.info(`✅ Application initialized in ${duration}ms`, {
      instanceId: INSTANCE_ID,
      duration,
      version: VERSION,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      duration,
      instanceId: INSTANCE_ID,
      version: VERSION
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`⚠️ Application initialization failed after ${duration}ms: ${error.message}`, {
      instanceId: INSTANCE_ID,
      error: error.message,
      duration,
      version: VERSION,
      timestamp: new Date().toISOString()
    });
    
    // Don't throw - let the application run with defaults
    return {
      success: false,
      duration,
      error: error.message,
      instanceId: INSTANCE_ID,
      version: VERSION
    };
  }
}

/**
 * Warm up frequently used caches
 */
async function warmupCaches() {
  try {
    const warmupPromises = [
      // Pre-cache trending articles
      getSharedCache('trending_10', CONFIG.cache.trendingTTL).then(cached => {
        if (!cached) {
          logger.debug(`Warming up trending cache`, { instanceId: INSTANCE_ID });
        }
      }),
      
      // Pre-cache category stats
      getSharedCache('categoryStats', CONFIG.cache.categoryStatsTTL).then(cached => {
        if (!cached) {
          logger.debug(`Warming up category stats cache`, { instanceId: INSTANCE_ID });
        }
      })
    ];
    
    await Promise.allSettled(warmupPromises);
    
    logger.debug(`Cache warmup completed`, {
      instanceId: INSTANCE_ID,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    // Silent fail - warmup is optional
  }
}

/**
 * Schedule periodic health checks
 */
function scheduleHealthChecks() {
  // Run health check every 15 minutes
  setInterval(async () => {
    try {
      const health = await deploymentAssistant.generateDeploymentReport();
      
      if (health.overallStatus === 'DEGRADED') {
        logger.warn(`Periodic health check: ${health.issues} issue(s) detected`, {
          instanceId: INSTANCE_ID,
          issues: health.issues,
          checks: health.checks,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.debug(`Periodic health check: All systems nominal`, {
          instanceId: INSTANCE_ID,
          timestamp: new Date().toISOString()
        });
      }
      
      // Log to Firestore for monitoring
      await db.collection('health_checks').doc(Date.now().toString()).set({
        ...health,
        recordedAt: Timestamp.now()
      }, { merge: true });
      
    } catch (error) {
      logger.debug(`Health check failed: ${error.message}`, {
        instanceId: INSTANCE_ID,
        error: error.message
      });
    }
  }, 15 * 60 * 1000); // 15 minutes
}

// =============================================
// CLOUD FUNCTIONS (WITH REQUEST SIZE VALIDATION AND CONCURRENT LIMITS)
// =============================================

// ==================== ENHANCED SCHEDULED FUNCTION WITH AUTO-RECOVERY ====================
exports.scheduledGoodNewsFetch = onSchedule(
  {
    schedule: "every 6 hours",
    timeoutSeconds: 300,
    memory: "1GiB",
    secrets: ["GEMINI_API_KEY", "NEWSDATA_API_KEY"],
    retryCount: 2,
  },
  async (event) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('scheduledGoodNewsFetch');
    
    // Initialize application on first run
    if (!deploymentAssistant.initialized) {
      await deploymentAssistant.initialize();
    }
    
    logger.info("🚀 Starting scheduled good news fetch...", {
      instanceId: INSTANCE_ID,
      executionId: event.id,
      scheduledTime: event.scheduleTime,
      version: VERSION,
      timestamp: new Date().toISOString(),
      enhanced: true
    });

    try {
      const todayProcessed = await getDailyProcessedCount();
      
      if (todayProcessed >= CONFIG.limits.dailyArticles) {
        logger.warn(`Daily limit reached (${CONFIG.limits.dailyArticles}), skipping fetch`, {
          instanceId: INSTANCE_ID,
          todayProcessed,
          limit: CONFIG.limits.dailyArticles,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        
        performanceMetrics.trackFunctionEnd('scheduledGoodNewsFetch', startTimeMetric);
        
        return { 
          status: "daily_limit_reached", 
          count: 0,
          todayProcessed,
          limit: CONFIG.limits.dailyArticles,
          version: VERSION,
          enhanced: true
        };
      }

      // Use enhanced fetch with auto-recovery
      const rawArticles = await fetchArticlesFromNewsDataEnhanced();
      
      if (!rawArticles?.length) {
        logger.warn("No articles fetched, using fallback content", {
          instanceId: INSTANCE_ID,
          rawCount: 0,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        
        // Try to get recent articles as fallback
        const recentSnapshot = await db.collection("news_articles")
          .where("isActive", "==", true)
          .orderBy("publishedAt", "desc")
          .limit(5)
          .get();
        
        const recentArticles = recentSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        if (recentArticles.length > 0) {
          logger.info(`Using ${recentArticles.length} recent articles as fallback`, {
            instanceId: INSTANCE_ID,
            fallbackCount: recentArticles.length,
            timestamp: new Date().toISOString()
          });
          
          // Update content with recent articles
          const mainDocRef = db.collection("content").doc("latest_news");
          await mainDocRef.set({
            articles: recentArticles.slice(0, 3),
            lastUpdated: new Date().toISOString(),
            stats: {
              totalFetched: 0,
              goodNewsCount: recentArticles.length,
              byCategory: {},
              source: 'fallback_cache'
            },
            batchId: `fallback_${Date.now()}`,
          }, { merge: false });
        }
        
        performanceMetrics.trackFunctionEnd('scheduledGoodNewsFetch', startTimeMetric);
        
        return { 
          status: rawArticles.length === 0 ? "no_new_articles" : "used_fallback", 
          count: recentArticles.length || 0,
          source: recentArticles.length > 0 ? 'cache' : 'none',
          version: VERSION,
          enhanced: true
        };
      }
      
      logger.info(`Fetched ${rawArticles.length} raw articles`, {
        instanceId: INSTANCE_ID,
        rawCount: rawArticles.length,
        sources: [...new Set(rawArticles.map(a => a.source))],
        version: VERSION,
        timestamp: new Date().toISOString()
      });
      
      const enrichedArticles = await filterAndEnrichArticlesWithAI(rawArticles);
      
      logger.info(`AI Filter: ${rawArticles.length} → ${enrichedArticles.length} good news items`, {
        instanceId: INSTANCE_ID,
        rawCount: rawArticles.length,
        filteredCount: enrichedArticles.length,
        filterRatio: (enrichedArticles.length / rawArticles.length).toFixed(2),
        version: VERSION,
        timestamp: new Date().toISOString()
      });
      
      if (enrichedArticles.length > 0) {
        await storeArticlesScalable(rawArticles, enrichedArticles);
        await incrementDailyProcessedCount(enrichedArticles.length);
        await invalidateRelatedCaches();
      } else {
        logger.warn("No articles passed the AI 'Good News' filter", {
          instanceId: INSTANCE_ID,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
      }
      
      const updatedCount = await getDailyProcessedCount();
      const duration = performanceMetrics.trackFunctionEnd('scheduledGoodNewsFetch', startTimeMetric);
      
      logger.info(`Scheduled fetch completed in ${duration}ms`, {
        instanceId: INSTANCE_ID,
        executionTime: duration,
        rawCount: rawArticles.length,
        filteredCount: enrichedArticles.length,
        todayProcessed: updatedCount,
        dailyLimit: CONFIG.limits.dailyArticles,
        version: VERSION,
        timestamp: new Date().toISOString(),
        enhanced: true
      });
      
      // Log successful execution
      await db.collection('execution_logs').doc(event.id).set({
        executionId: event.id,
        duration,
        articlesProcessed: enrichedArticles.length,
        rawArticles: rawArticles.length,
        success: true,
        timestamp: Timestamp.now(),
        instanceId: INSTANCE_ID,
        version: VERSION
      }, { merge: true });
      
      return {
        status: "success",
        rawCount: rawArticles.length,
        filteredCount: enrichedArticles.length,
        executionTime: duration,
        todayProcessed: updatedCount,
        dailyLimit: CONFIG.limits.dailyArticles,
        version: VERSION,
        enhanced: true
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log error with enhanced context
      await db.collection('execution_errors').doc(`${event.id}_${Date.now()}`).set({
        executionId: event.id,
        error: error.message,
        errorType: error.name,
        duration,
        timestamp: Timestamp.now(),
        instanceId: INSTANCE_ID,
        version: VERSION,
        stack: error.stack ? error.stack.substring(0, 1000) : null
      }, { merge: true });
      
      logger.error("CRITICAL ERROR in scheduled function", {
        instanceId: INSTANCE_ID,
        error: error.message,
        errorName: error.name,
        duration,
        function: "scheduledGoodNewsFetch",
        executionId: event.id,
        version: VERSION,
        timestamp: new Date().toISOString(),
        enhanced: true
      });
      
      if (error instanceof RateLimitError) {
        throw new ApiError("Rate limit exceeded. Please try again later.", error.service, 429);
      } else if (error instanceof ApiError || error instanceof DatabaseError) {
        throw error;
      }
      
      throw new ApiError('Failed to fetch good news articles', 'scheduled_fetch', 500);
    }
  }
);

// ==================== CLEANUP FUNCTION ====================
exports.cleanupOldArticles = onSchedule(
  {
    schedule: "every day 03:00",
    timeoutSeconds: 180,
    memory: "512MiB",
  },
  async () => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('cleanupOldArticles');
    
    logger.info("🧹 Starting automated cleanup of old articles...", {
      instanceId: INSTANCE_ID,
      version: VERSION,
      timestamp: new Date().toISOString()
    });
    
    try {
      const cutoff = Timestamp.fromDate(new Date(Date.now() - CONFIG.firestore.articleTTL));
      let totalDeleted = 0;
      let batchesProcessed = 0;

      while (true) {
        const oldArticlesQuery = db.collection("news_articles")
          .where("publishedAt", "<", cutoff)
          .limit(CONFIG.firestore.cleanupBatchLimit);

        const snapshot = await oldArticlesQuery.get();
        if (snapshot.empty) {
          if (totalDeleted === 0) {
            logger.info("No old articles to clean up", {
              instanceId: INSTANCE_ID,
              version: VERSION,
              timestamp: new Date().toISOString()
            });
          }
          break;
        }

        const batch = db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        
        totalDeleted += snapshot.size;
        batchesProcessed++;
        
        logger.info(`Deleted batch ${batchesProcessed} of ${snapshot.size} articles`, {
          instanceId: INSTANCE_ID,
          batchSize: snapshot.size,
          batchNumber: batchesProcessed,
          totalDeleted,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
      }

      if (totalDeleted > 0) {
        const duration = performanceMetrics.trackFunctionEnd('cleanupOldArticles', startTimeMetric);
        logger.info(`Cleanup completed: ${totalDeleted} articles deleted in ${duration}ms`, {
          instanceId: INSTANCE_ID,
          totalDeleted,
          batchesProcessed,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
      } else {
        performanceMetrics.trackFunctionEnd('cleanupOldArticles', startTimeMetric);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error("Error during article cleanup", {
        instanceId: INSTANCE_ID,
        error: error.message,
        duration,
        version: VERSION,
        timestamp: new Date().toISOString()
      });
      throw new DatabaseError('Failed to cleanup old articles', 'cleanup_operation');
    }
  }
);

// ==================== BOOKMARKING FUNCTIONS ====================
exports.toggleBookmark = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('toggleBookmark');
    logFunctionCall('toggleBookmark', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be signed in to bookmark articles.');
    }
    
    const userId = request.auth.uid;
    const { articleId } = request.data;
    
    if (!articleId || !isValidArticleId(articleId)) {
      throw new ValidationError('Invalid articleId format', 'articleId');
    }

    const articleRef = db.collection("news_articles").doc(articleId);
    const userBookmarksRef = db.collection("user_bookmarks").doc(userId);

    // Apply concurrent request limit
    return await withConcurrentLimit(userId, 'toggleBookmark', async () => {
      try {
        const [userDoc, articleDoc] = await Promise.all([
          userBookmarksRef.get(),
          articleRef.get()
        ]);
        
        if (!articleDoc.exists) {
          throw new ResourceNotFoundError('Article not found', articleId);
        }
        
        const bookmarks = userDoc.exists ? userDoc.data().articleIds || [] : [];
        const isBookmarked = bookmarks.includes(articleId);
        
        const batch = db.batch();
        const articleData = articleDoc.data();
        
        if (isBookmarked) {
          batch.update(userBookmarksRef, {
            articleIds: FieldValue.arrayRemove(articleId),
            updatedAt: Timestamp.now()
          });
          batch.update(articleRef, {
            saves: FieldValue.increment(-1),
            trendingScore: FieldValue.increment(-CONFIG.trendingWeights.saves)
          });
          
          await batch.commit();
          
          await invalidateRelatedCaches(articleId, articleData.category);
          
          const duration = performanceMetrics.trackFunctionEnd('toggleBookmark', startTimeMetric);
          logFunctionCall('toggleBookmark', request, startTime);
          
          return { 
            bookmarked: false, 
            saves: -1,
            duration,
            version: VERSION
          };
        } else {
          batch.set(userBookmarksRef, {
            articleIds: FieldValue.arrayUnion(articleId),
            updatedAt: Timestamp.now()
          }, { merge: true });
          batch.update(articleRef, {
            saves: FieldValue.increment(1),
            trendingScore: FieldValue.increment(CONFIG.trendingWeights.saves)
          });
          
          await batch.commit();
          
          await invalidateRelatedCaches(articleId, articleData.category);
          
          const duration = performanceMetrics.trackFunctionEnd('toggleBookmark', startTimeMetric);
          logFunctionCall('toggleBookmark', request, startTime);
          
          return { 
            bookmarked: true, 
            saves: 1,
            duration,
            version: VERSION
          };
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error toggling bookmark", {
          instanceId: INSTANCE_ID,
          error: error.message,
          userId,
          articleId,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        
        if (error instanceof ValidationError) {
          throw new HttpsError('invalid-argument', error.message);
        } else if (error instanceof ResourceNotFoundError) {
          throw new HttpsError('not-found', error.message);
        }
        
        throw new HttpsError('internal', 'Failed to toggle bookmark', {
          details: error.message.substring(0, 100),
          code: 'BOOKMARK_ERROR',
          version: VERSION
        });
      }
    });
  }
);

exports.getUserBookmarks = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('getUserBookmarks');
    logFunctionCall('getUserBookmarks', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be signed in to view bookmarks.');
    }
    
    const userId = request.auth.uid;
    const { limit = CONFIG.limits.bookmarkLimit } = request.data;

    // Apply concurrent request limit
    return await withConcurrentLimit(userId, 'getUserBookmarks', async () => {
      try {
        const userBookmarksDoc = await db.collection("user_bookmarks").doc(userId).get();
        
        if (!userBookmarksDoc.exists) {
          performanceMetrics.trackFunctionEnd('getUserBookmarks', startTimeMetric);
          return { articles: [], count: 0, version: VERSION };
        }
        
        const articleIds = userBookmarksDoc.data().articleIds || [];
        
        if (articleIds.length === 0) {
          performanceMetrics.trackFunctionEnd('getUserBookmarks', startTimeMetric);
          return { articles: [], count: 0, version: VERSION };
        }
        
        const limitedIds = articleIds.slice(0, Math.min(limit, CONFIG.limits.bookmarkLimit));
        
        const chunks = [];
        for (let i = 0; i < limitedIds.length; i += CONFIG.firestore.bookmarkBatchSize) {
          chunks.push(limitedIds.slice(i, i + CONFIG.firestore.bookmarkBatchSize));
        }
        
        const articlePromises = chunks.map(chunk => 
          db.collection("news_articles")
            .where("id", "in", chunk)
            .get()
        );
        
        const snapshots = await Promise.all(articlePromises);
        let articles = [];
        
        snapshots.forEach(snapshot => {
          articles.push(...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        
        articles.sort((a, b) => {
          const indexA = limitedIds.indexOf(a.id);
          const indexB = limitedIds.indexOf(b.id);
          return indexA - indexB;
        });
        
        const duration = performanceMetrics.trackFunctionEnd('getUserBookmarks', startTimeMetric);
        logFunctionCall('getUserBookmarks', request, startTime);
        
        logger.info(`Retrieved ${articles.length} bookmarks for user ${userId} in ${duration}ms`, {
          instanceId: INSTANCE_ID,
          userId,
          bookmarkCount: articles.length,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        
        return { 
          articles, 
          count: articles.length,
          duration,
          version: VERSION
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error getting bookmarks", {
          instanceId: INSTANCE_ID,
          error: error.message,
          userId,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        throw new HttpsError('internal', 'Failed to get bookmarks', {
          details: error.message.substring(0, 100),
          code: 'BOOKMARKS_FETCH_ERROR',
          version: VERSION
        });
      }
    });
  }
);

// ==================== SHARING FUNCTIONS ====================
exports.trackShare = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('trackShare');
    logFunctionCall('trackShare', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    const { articleId, platform } = request.data;
    const userId = request.auth?.uid || 'anonymous';
    
    if (!articleId || !isValidArticleId(articleId)) {
      throw new ValidationError('Invalid articleId format', 'articleId');
    }

    const safePlatform = sanitizePlatform(platform);
    const articleRef = db.collection("news_articles").doc(articleId);

    // Apply concurrent request limit (if user is authenticated)
    return await withConcurrentLimit(userId, 'trackShare', async () => {
      try {
        await articleRef.update({
          shares: FieldValue.increment(1),
          [`sharesByPlatform.${safePlatform}`]: FieldValue.increment(1),
          trendingScore: FieldValue.increment(CONFIG.trendingWeights.shares),
          lastSharedAt: Timestamp.now()
        });
        
        await invalidateRelatedCaches(articleId);
        
        const duration = performanceMetrics.trackFunctionEnd('trackShare', startTimeMetric);
        logFunctionCall('trackShare', request, startTime);
        
        return { 
          success: true, 
          platform: safePlatform,
          duration,
          version: VERSION
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error tracking share", {
          instanceId: INSTANCE_ID,
          error: error.message,
          articleId,
          platform: safePlatform,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        throw new HttpsError('internal', 'Failed to track share', {
          details: error.message.substring(0, 100),
          code: 'SHARE_TRACKING_ERROR',
          version: VERSION
        });
      }
    });
  }
);

// ==================== VIEW TRACKING ====================
exports.trackView = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('trackView');
    logFunctionCall('trackView', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    const { articleId } = request.data;
    const userId = request.auth?.uid || 'anonymous';
    
    if (!articleId || !isValidArticleId(articleId)) {
      throw new ValidationError('Invalid articleId format', 'articleId');
    }

    const articleRef = db.collection("news_articles").doc(articleId);

    // Apply concurrent request limit (if user is authenticated)
    return await withConcurrentLimit(userId, 'trackView', async () => {
      try {
        await articleRef.update({
          views: FieldValue.increment(1),
          trendingScore: FieldValue.increment(CONFIG.trendingWeights.views),
          lastViewedAt: Timestamp.now()
        });
        
        await invalidateRelatedCaches(articleId);
        
        const duration = performanceMetrics.trackFunctionEnd('trackView', startTimeMetric);
        logFunctionCall('trackView', request, startTime);
        
        return { 
          success: true,
          duration,
          version: VERSION
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error tracking view", {
          instanceId: INSTANCE_ID,
          error: error.message,
          articleId,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        throw new HttpsError('internal', 'Failed to track view', {
          details: error.message.substring(0, 100),
          code: 'VIEW_TRACKING_ERROR',
          version: VERSION
        });
      }
    });
  }
);

// ==================== CATEGORY FUNCTIONS ====================
exports.getArticlesByCategory = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('getArticlesByCategory');
    logFunctionCall('getArticlesByCategory', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    const { category, limit = 20, orderBy = 'publishedAt', lastArticleId } = request.data;
    const userId = request.auth?.uid || 'anonymous';
    
    if (!isValidCategory(category)) {
      throw new ValidationError(
        `Invalid category. Must be one of: ${CONFIG.categories.join(', ')}`,
        'category'
      );
    }

    const safeOrderBy = isValidOrderField(orderBy) ? orderBy : 'publishedAt';

    // Apply concurrent request limit
    return await withConcurrentLimit(userId, 'getArticlesByCategory', async () => {
      try {
        const cacheKey = `category_${category}_${safeOrderBy}_${limit}`;
        
        if (!lastArticleId) {
          const cached = await getSharedCache(cacheKey, CONFIG.cache.trendingTTL);
          if (cached) {
            const duration = performanceMetrics.trackFunctionEnd('getArticlesByCategory', startTimeMetric);
            logFunctionCall('getArticlesByCategory', request, startTime);
            return { ...cached, cacheHit: true, duration, version: VERSION };
          }
        }
        
        let query = db.collection("news_articles")
          .where("category", "==", category)
          .where("isActive", "==", true)
          .orderBy(safeOrderBy, "desc")
          .limit(Math.min(limit, CONFIG.firestore.maxArticlesPerCall));
        
        if (lastArticleId) {
          try {
            const lastDoc = await db.collection("news_articles").doc(lastArticleId).get();
            if (lastDoc.exists) {
              query = query.startAfter(lastDoc);
            }
          } catch (error) {
            logger.warn(`Pagination error: ${error.message}`, {
              instanceId: INSTANCE_ID,
              lastArticleId,
              error: error.message,
              version: VERSION
            });
          }
        }
        
        const snapshot = await query.get();
        
        const articles = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        const result = { 
          articles, 
          count: articles.length, 
          category,
          hasMore: articles.length >= limit
        };
        
        if (!lastArticleId) {
          await setSharedCache(cacheKey, result, CONFIG.cache.trendingTTL);
        }
        
        const duration = performanceMetrics.trackFunctionEnd('getArticlesByCategory', startTimeMetric);
        logFunctionCall('getArticlesByCategory', request, startTime);
        
        return { 
          ...result, 
          cacheHit: false,
          duration,
          version: VERSION
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error getting articles by category", {
          instanceId: INSTANCE_ID,
          error: error.message,
          category,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        
        if (error instanceof ValidationError) {
          throw new HttpsError('invalid-argument', error.message);
        }
        
        throw new HttpsError('internal', 'Failed to get articles', {
          details: error.message.substring(0, 100),
          code: 'CATEGORY_FETCH_ERROR',
          version: VERSION
        });
      }
    });
  }
);

exports.getCategoryStats = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('getCategoryStats');
    logFunctionCall('getCategoryStats', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    const userId = request.auth?.uid || 'anonymous';

    // Apply concurrent request limit
    return await withConcurrentLimit(userId, 'getCategoryStats', async () => {
      try {
        const cachedStats = await getSharedCache('categoryStats', CONFIG.cache.categoryStatsTTL);
        
        if (cachedStats) {
          const duration = performanceMetrics.trackFunctionEnd('getCategoryStats', startTimeMetric);
          logFunctionCall('getCategoryStats', request, startTime);
          return { ...cachedStats, cacheHit: true, duration, version: VERSION };
        }
        
        const mainDoc = await db.collection("content").doc("latest_news").get();
        
        if (!mainDoc.exists) {
          const stats = CONFIG.categories.map(category => ({ category, count: 0 }));
          const result = { stats, totalArticles: 0 };
          await setSharedCache('categoryStats', result, CONFIG.cache.categoryStatsTTL);
          
          const duration = performanceMetrics.trackFunctionEnd('getCategoryStats', startTimeMetric);
          logFunctionCall('getCategoryStats', request, startTime);
          
          return { 
            ...result, 
            cacheHit: false,
            duration,
            version: VERSION
          };
        }
        
        const data = mainDoc.data();
        const stats = CONFIG.categories.map(category => ({
          category,
          count: data.stats?.byCategory?.[category] || 0
        }));
        
        const totalArticles = data.stats?.goodNewsCount || 0;
        const result = { stats, totalArticles };
        
        await setSharedCache('categoryStats', result, CONFIG.cache.categoryStatsTTL);
        
        const duration = performanceMetrics.trackFunctionEnd('getCategoryStats', startTimeMetric);
        logFunctionCall('getCategoryStats', request, startTime);
        
        return { 
          ...result, 
          cacheHit: false,
          duration,
          version: VERSION
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error getting category stats", {
          instanceId: INSTANCE_ID,
          error: error.message,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        throw new HttpsError('internal', 'Failed to get category stats', {
          details: error.message.substring(0, 100),
          code: 'STATS_FETCH_ERROR',
          version: VERSION
        });
      }
    });
  }
);

// ==================== TRENDING ARTICLES ====================
exports.getTrendingArticles = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('getTrendingArticles');
    logFunctionCall('getTrendingArticles', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    const { limit = 10 } = request.data;
    const userId = request.auth?.uid || 'anonymous';

    // Apply concurrent request limit
    return await withConcurrentLimit(userId, 'getTrendingArticles', async () => {
      try {
        const cacheKey = `trending_${limit}`;
        const cachedTrending = await getSharedCache(cacheKey, CONFIG.cache.trendingTTL);
        
        if (cachedTrending) {
          const duration = performanceMetrics.trackFunctionEnd('getTrendingArticles', startTimeMetric);
          logFunctionCall('getTrendingArticles', request, startTime);
          return { ...cachedTrending, cacheHit: true, duration, version: VERSION };
        }
        
        const oneDayAgo = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
        
        const snapshot = await db.collection("news_articles")
          .where("isActive", "==", true)
          .where("publishedAt", ">", oneDayAgo)
          .orderBy("trendingScore", "desc")
          .limit(Math.min(limit, CONFIG.limits.trendingLimit))
          .get();
        
        const articles = snapshot.docs.map(doc => ({
          id: doc.id,
          title: doc.data().title,
          summary: doc.data().summary,
          category: doc.data().category,
          trendingScore: doc.data().trendingScore,
          ...doc.data()
        }));
        
        const result = { articles, count: articles.length };
        
        await setSharedCache(cacheKey, result, CONFIG.cache.trendingTTL);
        
        const duration = performanceMetrics.trackFunctionEnd('getTrendingArticles', startTimeMetric);
        logFunctionCall('getTrendingArticles', request, startTime);
        
        return { 
          ...result, 
          cacheHit: false,
          duration,
          version: VERSION
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error getting trending articles", {
          instanceId: INSTANCE_ID,
          error: error.message,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        throw new HttpsError('internal', 'Failed to get trending articles', {
          details: error.message.substring(0, 100),
          code: 'TRENDING_FETCH_ERROR',
          version: VERSION
        });
      }
    });
  }
);

// ==================== HEALTH CHECK ====================
exports.healthCheck = onCall(
  {
    memory: "128MiB",
  },
  async () => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('healthCheck');
    logFunctionCall('healthCheck', {});
    
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const memoryWarning = heapUsedMB > CONFIG.security.memoryWarningThresholdMB;
    
    const stats = {
      version: VERSION,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: {
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100,
        heapUsedMB: Math.round(heapUsedMB * 100) / 100,
        heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
        externalMB: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100,
        arrayBuffersMB: Math.round(memoryUsage.arrayBuffers / 1024 / 1024 * 100) / 100
      },
      memoryWarning: memoryWarning ? `High memory usage: ${heapUsedMB.toFixed(2)}MB exceeds ${CONFIG.security.memoryWarningThresholdMB}MB threshold` : null,
      firestore: 'checking...',
      aiService: 'checking...',
      newsApi: 'checking...',
      instanceId: INSTANCE_ID,
      config: {
        dailyLimit: CONFIG.limits.dailyArticles,
        cacheTTL: CONFIG.cache.defaultTTL,
        apiRateLimits: CONFIG.apiRateLimits,
        maxRequestSizeKB: CONFIG.security.maxRequestSizeKB,
        memoryWarningThresholdMB: CONFIG.security.memoryWarningThresholdMB,
        maxConcurrentRequests: CONFIG.security.maxConcurrentRequests,
        requestTimeWindowMs: CONFIG.security.requestTimeWindowMs
      }
    };

    try {
      const latestArticle = await db.collection("news_articles")
        .orderBy("publishedAt", "desc")
        .limit(1)
        .get();
      stats.firestore = latestArticle.empty ? 'no_data' : 'healthy';
      stats.articleCount = latestArticle.empty ? 0 : 1;
      
      const totalArticles = await db.collection("news_articles")
        .where("isActive", "==", true)
        .count()
        .get();
      stats.totalArticles = totalArticles.data().count;
      
      const todayProcessed = await getDailyProcessedCount();
      stats.todayProcessed = todayProcessed;
      
    } catch (error) {
      stats.firestore = `error: ${error.message}`;
    }

    stats.aiService = process.env.GEMINI_API_KEY ? 'available' : 'missing_api_key';
    stats.newsApi = process.env.NEWSDATA_API_KEY ? 'available' : 'missing_api_key';
    stats.performanceMetrics = performanceMetrics.getMetrics();

    const duration = performanceMetrics.trackFunctionEnd('healthCheck', startTimeMetric);
    logFunctionCall('healthCheck', {}, startTime);
    
    logger.info("Health check completed", { ...stats, duration });
    
    return {
      status: memoryWarning ? 'warning' : 'healthy',
      ...stats,
      duration
    };
  }
);

// ==================== UTILITY FUNCTIONS ====================
exports.manualTriggerNewsFetch = onCall(
  {
    memory: "1GiB",
    secrets: ["GEMINI_API_KEY", "NEWSDATA_API_KEY"],
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('manualTriggerNewsFetch');
    logFunctionCall('manualTriggerNewsFetch', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be signed in.');
    }
    
    const userId = request.auth.uid;

    // Apply concurrent request limit
    return await withConcurrentLimit(userId, 'manualTriggerNewsFetch', async () => {
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        const isAdminFromEnv = process.env.ADMIN_USER_IDS ? 
          process.env.ADMIN_USER_IDS.split(',').includes(userId) : false;
        
        if (!userDoc.exists || !(userDoc.data().isAdmin || isAdminFromEnv)) {
          throw new HttpsError('permission-denied', 'Only administrators can trigger manual fetch.');
        }
        
        const event = {
          id: `manual_${Date.now()}`,
          scheduleTime: new Date().toISOString()
        };
        
        const result = await exports.scheduledGoodNewsFetch(event);
        
        const duration = performanceMetrics.trackFunctionEnd('manualTriggerNewsFetch', startTimeMetric);
        logFunctionCall('manualTriggerNewsFetch', request, startTime);
        
        return { 
          ...result,
          duration 
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Manual trigger failed", {
          instanceId: INSTANCE_ID,
          error: error.message,
          userId,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        
        if (error instanceof HttpsError) {
          throw error;
        }
        
        throw new HttpsError('internal', 'Manual fetch failed', {
          details: error.message.substring(0, 100),
          version: VERSION
        });
      }
    });
  }
);

exports.getArticleById = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('getArticleById');
    logFunctionCall('getArticleById', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    const { articleId } = request.data;
    const userId = request.auth?.uid || 'anonymous';
    
    if (!articleId || !isValidArticleId(articleId)) {
      throw new ValidationError('Invalid articleId format', 'articleId');
    }

    // Apply concurrent request limit
    return await withConcurrentLimit(userId, 'getArticleById', async () => {
      try {
        const articleDoc = await db.collection("news_articles").doc(articleId).get();
        
        if (!articleDoc.exists) {
          throw new ResourceNotFoundError('Article not found', articleId);
        }
        
        const articleData = articleDoc.data();
        
        // Track view if user is authenticated
        if (request.auth) {
          await exports.trackView({ data: { articleId } });
        }
        
        const duration = performanceMetrics.trackFunctionEnd('getArticleById', startTimeMetric);
        logFunctionCall('getArticleById', request, startTime);
        
        return { 
          id: articleDoc.id,
          ...articleData,
          duration,
          version: VERSION
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error getting article by ID", {
          instanceId: INSTANCE_ID,
          error: error.message,
          articleId,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        
        if (error instanceof ResourceNotFoundError) {
          throw new HttpsError('not-found', error.message);
        } else if (error instanceof ValidationError) {
          throw new HttpsError('invalid-argument', error.message);
        }
        
        throw new HttpsError('internal', 'Failed to get article', {
          details: error.message.substring(0, 100),
          code: 'ARTICLE_FETCH_ERROR',
          version: VERSION
        });
      }
    });
  }
);

exports.clearCache = onCall(
  {
    memory: "128MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('clearCache');
    logFunctionCall('clearCache', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be signed in.');
    }
    
    const userId = request.auth.uid;

    // Apply concurrent request limit
    return await withConcurrentLimit(userId, 'clearCache', async () => {
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        const isAdminFromEnv = process.env.ADMIN_USER_IDS ? 
          process.env.ADMIN_USER_IDS.split(',').includes(userId) : false;
        
        if (!userDoc.exists || !(userDoc.data().isAdmin || isAdminFromEnv)) {
          throw new HttpsError('permission-denied', 'Only administrators can clear cache.');
        }
        
        const cacheDocs = await db.collection('shared_cache').listDocuments();
        const deletePromises = cacheDocs.map(doc => doc.delete());
        await Promise.all(deletePromises);
        
        await invalidateRelatedCaches();
        
        const duration = performanceMetrics.trackFunctionEnd('clearCache', startTimeMetric);
        logFunctionCall('clearCache', request, startTime);
        
        return { 
          success: true,
          cleared: cacheDocs.length,
          instanceId: INSTANCE_ID,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error clearing cache", {
          instanceId: INSTANCE_ID,
          error: error.message,
          userId,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        throw new HttpsError('internal', 'Failed to clear cache', {
          details: error.message.substring(0, 100),
          version: VERSION
        });
      }
    });
  }
);

exports.getAllArticles = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('getAllArticles');
    logFunctionCall('getAllArticles', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    const { limit = 20, orderBy = 'publishedAt', lastArticleId } = request.data;
    const userId = request.auth?.uid || 'anonymous';

    const safeOrderBy = isValidOrderField(orderBy) ? orderBy : 'publishedAt';

    // Apply concurrent request limit
    return await withConcurrentLimit(userId, 'getAllArticles', async () => {
      try {
        const cacheKey = `all_${safeOrderBy}_${limit}`;
        
        if (!lastArticleId) {
          const cached = await getSharedCache(cacheKey, CONFIG.cache.trendingTTL);
          if (cached) {
            const duration = performanceMetrics.trackFunctionEnd('getAllArticles', startTimeMetric);
            logFunctionCall('getAllArticles', request, startTime);
            return { ...cached, cacheHit: true, duration, version: VERSION };
          }
        }
        
        let query = db.collection("news_articles")
          .where("isActive", "==", true)
          .orderBy(safeOrderBy, "desc")
          .limit(Math.min(limit, CONFIG.firestore.maxArticlesPerCall));
        
        if (lastArticleId) {
          try {
            const lastDoc = await db.collection("news_articles").doc(lastArticleId).get();
            if (lastDoc.exists) {
              query = query.startAfter(lastDoc);
            }
          } catch (error) {
            logger.warn(`Pagination error: ${error.message}`, {
              instanceId: INSTANCE_ID,
              lastArticleId,
              error: error.message,
              version: VERSION
            });
          }
        }
        
        const snapshot = await query.get();
        
        const articles = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        const result = { 
          articles, 
          count: articles.length,
          hasMore: articles.length >= limit
        };
        
        if (!lastArticleId) {
          await setSharedCache(cacheKey, result, CONFIG.cache.trendingTTL);
        }
        
        const duration = performanceMetrics.trackFunctionEnd('getAllArticles', startTimeMetric);
        logFunctionCall('getAllArticles', request, startTime);
        
        return { 
          ...result, 
          cacheHit: false,
          duration,
          version: VERSION
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error getting all articles", {
          instanceId: INSTANCE_ID,
          error: error.message,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        throw new HttpsError('internal', 'Failed to get articles', {
          details: error.message.substring(0, 100),
          code: 'ARTICLES_FETCH_ERROR',
          version: VERSION
        });
      }
    });
  }
);

// ==================== NEW DEPLOYMENT-HELPER FUNCTIONS ====================

/**
 * Get comprehensive deployment status
 */
exports.getDeploymentStatus = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('getDeploymentStatus');
    logFunctionCall('getDeploymentStatus', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be signed in.');
    }
    
    const userId = request.auth.uid;
    
    // Apply concurrent request limit
    return await withConcurrentLimit(userId, 'getDeploymentStatus', async () => {
      try {
        // Check admin permissions
        const userDoc = await db.collection('users').doc(userId).get();
        const isAdminFromEnv = process.env.ADMIN_USER_IDS ? 
          process.env.ADMIN_USER_IDS.split(',').includes(userId) : false;
        
        if (!userDoc.exists || !(userDoc.data().isAdmin || isAdminFromEnv)) {
          throw new HttpsError('permission-denied', 'Only administrators can view deployment status.');
        }
        
        // Generate comprehensive deployment report
        const deploymentReport = await deploymentAssistant.generateDeploymentReport();
        
        // Get configuration info
        const runtimeConfig = configManager.getRuntimeConfig();
        
        // Get system metrics
        const metrics = performanceMetrics.getMetrics();
        
        // Get recent errors (last 24 hours)
        const errorSnapshot = await db.collection('service_health')
          .where('timestamp', '>', Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)))
          .orderBy('timestamp', 'desc')
          .limit(20)
          .get();
        
        const recentErrors = errorSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Get index status
        const indexStatus = await deploymentAssistant.monitorAndSuggestIndexes();
        
        const duration = performanceMetrics.trackFunctionEnd('getDeploymentStatus', startTimeMetric);
        
        return {
          success: true,
          deploymentReport,
          configuration: {
            version: runtimeConfig.version,
            limits: runtimeConfig.limits,
            apiRateLimits: runtimeConfig.apiRateLimits,
            security: runtimeConfig.security,
            lastUpdated: new Date().toISOString()
          },
          system: {
            metrics,
            instanceId: INSTANCE_ID,
            uptime: process.uptime(),
            memory: {
              rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100,
              heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100
            }
          },
          monitoring: {
            recentErrors,
            errorCount: recentErrors.length,
            concurrentRequests: concurrentRequestTracker.getStats()
          },
          indexes: {
            status: indexStatus,
            missingCount: indexStatus.filter(i => i.status === 'FAIL').length,
            autoFixAvailable: false
          },
          recommendations: generateDeploymentRecommendations(deploymentReport, indexStatus),
          duration,
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error getting deployment status", {
          instanceId: INSTANCE_ID,
          error: error.message,
          userId,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        
        if (error instanceof HttpsError) {
          throw error;
        }
        
        throw new HttpsError('internal', 'Failed to get deployment status', {
          details: error.message.substring(0, 100),
          version: VERSION
        });
      }
    });
  }
);

/**
 * Generate deployment recommendations
 */
function generateDeploymentRecommendations(deploymentReport, indexStatus) {
  const recommendations = [];
  
  // Check environment variables
  if (deploymentReport.checks.environment && deploymentReport.checks.environment.status === 'FAIL') {
    recommendations.push({
      priority: 'HIGH',
      issue: 'Missing environment variables',
      action: 'Set NEWSDATA_API_KEY and GEMINI_API_KEY in Firebase environment variables',
      documentation: 'https://firebase.google.com/docs/functions/config-env'
    });
  }
  
  // Check Firestore
  if (deploymentReport.checks.firestore && deploymentReport.checks.firestore.status === 'FAIL') {
    recommendations.push({
      priority: 'HIGH',
      issue: 'Firestore connection failed',
      action: 'Check Firebase project configuration and Firestore database enablement',
      documentation: 'https://firebase.google.com/docs/firestore/quickstart'
    });
  }
  
  // Check APIs
  if (deploymentReport.checks.apis && deploymentReport.checks.apis.status === 'failed') {
    recommendations.push({
      priority: 'MEDIUM',
      issue: 'External API connectivity issues',
      action: 'Verify API keys and check API service status',
      documentation: 'Check NewsData.io and Gemini API dashboards'
    });
  }
  
  // Check indexes
  const missingIndexes = indexStatus.filter(i => i.status === 'FAIL');
  if (missingIndexes.length > 0) {
    missingIndexes.forEach(index => {
      recommendations.push({
        priority: 'HIGH',
        issue: `Missing Firestore index: ${index.name}`,
        action: `Create composite index in Firebase Console`,
        link: index.indexCreationLink,
        fields: index.fields,
        collection: index.collection
      });
    });
  }
  
  // Check rate limits
  const apiCalls = performanceMetrics.apiCalls;
  Object.entries(apiCalls).forEach(([service, stats]) => {
    if (stats.count > 100) { // Arbitrary threshold
      recommendations.push({
        priority: 'LOW',
        issue: `High API usage for ${service}`,
        action: 'Consider increasing rate limits or implementing additional caching',
        usage: stats.count
      });
    }
  });
  
  return recommendations;
}

/**
 * Create missing Firestore indexes (semi-automated)
 */
exports.createFirestoreIndex = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('createFirestoreIndex');
    logFunctionCall('createFirestoreIndex', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be signed in.');
    }
    
    const userId = request.auth.uid;
    const { indexName } = request.data;
    
    // Apply concurrent request limit
    return await withConcurrentLimit(userId, 'createFirestoreIndex', async () => {
      try {
        // Check admin permissions
        const userDoc = await db.collection('users').doc(userId).get();
        const isAdminFromEnv = process.env.ADMIN_USER_IDS ? 
          process.env.ADMIN_USER_IDS.split(',').includes(userId) : false;
        
        if (!userDoc.exists || !(userDoc.data().isAdmin || isAdminFromEnv)) {
          throw new HttpsError('permission-denied', 'Only administrators can create indexes.');
        }
        
        // Get the required index configuration
        const requiredIndexes = [
          {
            name: 'articles_by_category',
            collection: 'news_articles',
            fields: ['category', 'isActive', 'publishedAt'],
            orders: ['asc', 'asc', 'desc'],
            queryScope: 'COLLECTION'
          },
          {
            name: 'trending_articles',
            collection: 'news_articles',
            fields: ['isActive', 'publishedAt', 'trendingScore'],
            orders: ['asc', 'desc', 'desc'],
            queryScope: 'COLLECTION'
          },
          {
            name: 'cleanup_old_articles',
            collection: 'news_articles',
            fields: ['publishedAt'],
            orders: ['asc'],
            queryScope: 'COLLECTION'
          }
        ];
        
        const indexConfig = requiredIndexes.find(idx => idx.name === indexName);
        
        if (!indexConfig) {
          throw new HttpsError('not-found', `Index configuration not found: ${indexName}`);
        }
        
        // Generate the Firebase Console link
        const projectId = process.env.GCLOUD_PROJECT || 'unknown-project';
        const fields = indexConfig.fields.map((field, i) => 
          `${field}:${indexConfig.orders[i] || 'asc'}`
        ).join(',');
        
        const compositeId = `${indexConfig.collection}:${fields}:${indexConfig.queryScope}`;
        const creationLink = `https://console.firebase.google.com/project/${projectId}/firestore/indexes?create_composite=${compositeId}`;
        
        // Store the index creation request
        const requestRef = db.collection('index_creation_requests').doc(`${indexName}_${Date.now()}`);
        
        await requestRef.set({
          indexName,
          collection: indexConfig.collection,
          fields: indexConfig.fields,
          orders: indexConfig.orders,
          queryScope: indexConfig.queryScope,
          creationLink,
          requestedBy: userId,
          requestedAt: Timestamp.now(),
          status: 'pending',
          instanceId: INSTANCE_ID,
          version: VERSION
        }, { merge: true });
        
        const duration = performanceMetrics.trackFunctionEnd('createFirestoreIndex', startTimeMetric);
        
        logger.info(`Index creation requested: ${indexName}`, {
          instanceId: INSTANCE_ID,
          userId,
          indexName,
          creationLink,
          duration,
          timestamp: new Date().toISOString()
        });
        
        return {
          success: true,
          message: `Index creation requested for ${indexName}`,
          indexName,
          collection: indexConfig.collection,
          fields: indexConfig.fields,
          creationLink,
          instructions: [
            '1. Click the link above',
            '2. Review the index configuration',
            '3. Click "Create Index"',
            '4. Wait 2-5 minutes for index to build',
            '5. Test your queries'
          ],
          duration,
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error creating Firestore index", {
          instanceId: INSTANCE_ID,
          error: error.message,
          userId,
          indexName,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        
        if (error instanceof HttpsError) {
          throw error;
        }
        
        throw new HttpsError('internal', 'Failed to create Firestore index', {
          details: error.message.substring(0, 100),
          version: VERSION
        });
      }
    });
  }
);

/**
 * Callable function to manually trigger initialization
 */
exports.initializeApp = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('initializeApp');
    logFunctionCall('initializeApp', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be signed in.');
    }
    
    const userId = request.auth.uid;
    
    // Apply concurrent request limit
    return await withConcurrentLimit(userId, 'initializeApp', async () => {
      try {
        // Check admin permissions
        const userDoc = await db.collection('users').doc(userId).get();
        const isAdminFromEnv = process.env.ADMIN_USER_IDS ? 
          process.env.ADMIN_USER_IDS.split(',').includes(userId) : false;
        
        if (!userDoc.exists || !(userDoc.data().isAdmin || isAdminFromEnv)) {
          throw new HttpsError('permission-denied', 'Only administrators can initialize the app.');
        }
        
        // Run initialization
        const result = await initializeApplication();
        
        const duration = performanceMetrics.trackFunctionEnd('initializeApp', startTimeMetric);
        
        return {
          ...result,
          duration,
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error initializing app", {
          instanceId: INSTANCE_ID,
          error: error.message,
          userId,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        
        if (error instanceof HttpsError) {
          throw error;
        }
        
        throw new HttpsError('internal', 'Failed to initialize app', {
          details: error.message.substring(0, 100),
          version: VERSION
        });
      }
    });
  }
);

// ==================== FIREBASE INDEX CHECKER ====================
exports.checkFirestoreIndexes = onCall(
  {
    memory: "256MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('checkFirestoreIndexes');
    logFunctionCall('checkFirestoreIndexes', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be signed in.');
    }
    
    const userId = request.auth.uid;

    // Apply concurrent request limit
    return await withConcurrentLimit(userId, 'checkFirestoreIndexes', async () => {
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        const isAdminFromEnv = process.env.ADMIN_USER_IDS ? 
          process.env.ADMIN_USER_IDS.split(',').includes(userId) : false;
        
        if (!userDoc.exists || !(userDoc.data().isAdmin || isAdminFromEnv)) {
          throw new HttpsError('permission-denied', 'Only administrators can check Firestore indexes.');
        }
        
        const requiredIndexes = [
          {
            name: 'getArticlesByCategory',
            query: db.collection("news_articles")
              .where("category", "==", "SCIENCE")
              .where("isActive", "==", true)
              .orderBy("publishedAt", "desc")
              .limit(1),
            expectedFields: ['category', 'isActive', 'publishedAt']
          },
          {
            name: 'getTrendingArticles',
            query: db.collection("news_articles")
              .where("isActive", "==", true)
              .where("publishedAt", ">", Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)))
              .orderBy("trendingScore", "desc")
              .limit(1),
            expectedFields: ['isActive', 'publishedAt', 'trendingScore']
          },
          {
            name: 'cleanupOldArticles',
            query: db.collection("news_articles")
              .where("publishedAt", "<", Timestamp.fromDate(new Date(Date.now() - CONFIG.firestore.articleTTL)))
              .limit(1),
            expectedFields: ['publishedAt']
          }
        ];
        
        const results = [];
        
        for (const index of requiredIndexes) {
          try {
            const snapshot = await index.query.get();
            results.push({
              name: index.name,
              status: 'PASS',
              expectedFields: index.expectedFields,
              message: `Index for ${index.name} is properly configured`
            });
          } catch (error) {
            if (error.message && error.message.includes('requires an index')) {
              results.push({
                name: index.name,
                status: 'FAIL',
                expectedFields: index.expectedFields,
                message: `Missing index for ${index.name}. Create index with fields: ${index.expectedFields.join(', ')}`,
                error: error.message.substring(0, 200)
              });
            } else {
              results.push({
                name: index.name,
                status: 'ERROR',
                expectedFields: index.expectedFields,
                message: `Error testing index for ${index.name}`,
                error: error.message.substring(0, 200)
              });
            }
          }
        }
        
        const failingIndexes = results.filter(r => r.status === 'FAIL');
        const passingIndexes = results.filter(r => r.status === 'PASS');
        
        const duration = performanceMetrics.trackFunctionEnd('checkFirestoreIndexes', startTimeMetric);
        logFunctionCall('checkFirestoreIndexes', request, startTime);
        
        return {
          success: failingIndexes.length === 0,
          results,
          summary: {
            total: results.length,
            passing: passingIndexes.length,
            failing: failingIndexes.length,
            errors: results.filter(r => r.status === 'ERROR').length
          },
          version: VERSION,
          duration,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error checking Firestore indexes", {
          instanceId: INSTANCE_ID,
          error: error.message,
          userId,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        throw new HttpsError('internal', 'Failed to check Firestore indexes', {
          details: error.message.substring(0, 100),
          version: VERSION
        });
      }
    });
  }
);

// ==================== CONCURRENT REQUEST STATS ====================
exports.getConcurrentRequestStats = onCall(
  {
    memory: "128MiB",
  },
  async (request) => {
    const startTime = Date.now();
    const startTimeMetric = performanceMetrics.trackFunctionStart('getConcurrentRequestStats');
    logFunctionCall('getConcurrentRequestStats', request);
    
    // Request size validation
    const sizeValidation = validateRequestSize(request.data);
    if (!sizeValidation.isValid) {
      throw new HttpsError('invalid-argument', sizeValidation.message);
    }
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be signed in.');
    }
    
    const userId = request.auth.uid;

    // Apply concurrent request limit (admin function needs limits too)
    return await withConcurrentLimit(userId, 'getConcurrentRequestStats', async () => {
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        const isAdminFromEnv = process.env.ADMIN_USER_IDS ? 
          process.env.ADMIN_USER_IDS.split(',').includes(userId) : false;
        
        if (!userDoc.exists || !(userDoc.data().isAdmin || isAdminFromEnv)) {
          throw new HttpsError('permission-denied', 'Only administrators can view concurrent request stats.');
        }
        
        const stats = concurrentRequestTracker.getStats();
        
        const duration = performanceMetrics.trackFunctionEnd('getConcurrentRequestStats', startTimeMetric);
        logFunctionCall('getConcurrentRequestStats', request, startTime);
        
        return {
          success: true,
          stats,
          config: {
            maxConcurrentRequests: CONFIG.security.maxConcurrentRequests,
            requestTimeWindowMs: CONFIG.security.requestTimeWindowMs,
            cleanupIntervalMs: CONFIG.security.cleanupIntervalMs
          },
          version: VERSION,
          duration,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error("Error getting concurrent request stats", {
          instanceId: INSTANCE_ID,
          error: error.message,
          userId,
          duration,
          version: VERSION,
          timestamp: new Date().toISOString()
        });
        throw new HttpsError('internal', 'Failed to get concurrent request stats', {
          details: error.message.substring(0, 100),
          version: VERSION
        });
      }
    });
  }
);

// =============================================
// AUTO-INITIALIZATION ON COLD START
// =============================================

// Run initialization when module loads (cold start optimization)
(async () => {
  try {
    // Only run full initialization in production or when explicitly enabled
    if (process.env.FUNCTIONS_EMULATOR !== 'true') {
      logger.info('Cold start detected, running lightweight initialization...', {
        instanceId: INSTANCE_ID,
        version: VERSION,
        timestamp: new Date().toISOString()
      });
      
      // Initialize deployment assistant (async, non-blocking)
      deploymentAssistant.initialize().catch(error => {
        logger.debug(`Cold start initialization failed: ${error.message}`, {
          instanceId: INSTANCE_ID,
          error: error.message
        });
      });
      
      // Load configuration (non-blocking)
      configManager.loadConfiguration().catch(error => {
        logger.debug(`Configuration loading failed on cold start: ${error.message}`, {
          instanceId: INSTANCE_ID,
          error: error.message
        });
      });
    }
  } catch (error) {
    // Don't throw - initialization failures shouldn't prevent function execution
    logger.debug(`Auto-initialization error: ${error.message}`, {
      instanceId: INSTANCE_ID,
      error: error.message
    });
  }
})();

// =============================================
// EXPORT ENHANCED FUNCTIONS FOR TESTING
// =============================================

// Export the enhanced fetch for testing
exports.fetchArticlesFromNewsDataEnhanced = fetchArticlesFromNewsDataEnhanced;

// Export deployment assistant for testing/monitoring
exports.DeploymentAssistant = DeploymentAssistant;
exports.configManager = configManager;

logger.info(`🚀 Deployment enhancements loaded. Version: ${VERSION}`, {
  instanceId: INSTANCE_ID,
  version: VERSION,
  timestamp: new Date().toISOString(),
  features: [
    'DeploymentAssistant',
    'ConfigurationManager',
    'AutoRecovery',
    'SelfHealing',
    'IndexMonitoring',
    'EnhancedScheduling'
  ]
});