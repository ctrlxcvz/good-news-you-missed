// src/App.jsx - PHASE 3 AI TESTING ADDED
import React, { useEffect, useState } from 'react';
import './App.css';

// Import functions as we extract them
import { generateArticleId } from './assets/lib/utils.js';
import { fetchArticlesFromNewsDataEnhanced } from './assets/lib/services/news-service.js';

// AI functions - FIXED PATH
import { 
  basicKeywordFilter, 
  filterAndEnrichArticlesWithAI,
  generateArticleSummary,
  fetchAndProcessGoodNews 
} from './assets/lib/services/ai-service.js';

function App() {
  const [activeTab, setActiveTab] = useState('generateArticleId');
  
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '30px' }}>
        <h1>🔧 Firebase Engine - Surgical Extraction Dashboard</h1>
        <p>Test each extracted function incrementally</p>
        <p style={{ fontSize: '14px', color: '#666' }}><strong>Current Phase:</strong> AI Filtering & Enrichment</p>
      </header>
      
      {/* Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '30px',
        borderBottom: '2px solid #eee',
        paddingBottom: '10px',
        flexWrap: 'wrap'
      }}>
        <TabButton 
          id="generateArticleId" 
          activeTab={activeTab} 
          setActiveTab={setActiveTab}
          label="1. generateArticleId"
          status="✅"
        />
        <TabButton 
          id="fetchArticles" 
          activeTab={activeTab} 
          setActiveTab={setActiveTab}
          label="2. fetchArticles"
          status="✅"
        />
        <TabButton 
          id="aiFiltering" 
          activeTab={activeTab} 
          setActiveTab={setActiveTab}
          label="3. AI Filtering"
          status="🧠"
        />
        <TabButton 
          id="allFunctions" 
          activeTab={activeTab} 
          setActiveTab={setActiveTab}
          label="4. Full Integration"
          status="🔒"
        />
      </div>
      
      {/* Tab Content */}
      <div style={{ minHeight: '400px' }}>
        {activeTab === 'generateArticleId' && <GenerateArticleIdTest />}
        {activeTab === 'fetchArticles' && <FetchArticlesTest />}
        {activeTab === 'aiFiltering' && <AIFilteringTest />}
        {activeTab === 'allFunctions' && <FullIntegrationTest />}
      </div>
      
      {/* Progress Tracker */}
      <div style={{ 
        marginTop: '40px', 
        padding: '20px', 
        background: '#f8f9fa', 
        borderRadius: '10px',
        border: '1px solid #dee2e6'
      }}>
        <h3>📈 Extraction Progress</h3>
        <div style={{ display: 'flex', alignItems: 'center', margin: '15px 0', flexWrap: 'wrap' }}>
          <ProgressStep number="1" status="completed" title="Project Setup" />
          <ProgressLine status="completed" />
          <ProgressStep number="2" status="completed" title="generateArticleId" />
          <ProgressLine status="completed" />
          <ProgressStep number="3" status="completed" title="fetchArticles" />
          <ProgressLine status="completed" />
          <ProgressStep number="4" status="current" title="AI Functions" />
          <ProgressLine status="current" />
          <ProgressStep number="5" status="pending" title="UI Components" />
        </div>
      </div>
    </div>
  );
}

// ==================== TAB BUTTON COMPONENT ====================
function TabButton({ id, activeTab, setActiveTab, label, status }) {
  const isActive = activeTab === id;
  
  return (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding: '10px 15px',
        background: isActive ? '#4caf50' : '#f5f5f5',
        color: isActive ? 'white' : '#333',
        border: '1px solid',
        borderColor: isActive ? '#4caf50' : '#ddd',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: isActive ? 'bold' : 'normal',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}
    >
      <span>{status}</span>
      <span>{label}</span>
    </button>
  );
}

// ==================== PROGRESS COMPONENTS ====================
function ProgressStep({ number, status, title }) {
  const colors = {
    completed: { bg: '#4caf50', text: 'white' },
    current: { bg: '#2196f3', text: 'white' },
    pending: { bg: '#e0e0e0', text: '#666' }
  };
  
  const color = colors[status];
  
  return (
    <div style={{ textAlign: 'center', minWidth: '100px' }}>
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        background: color.bg,
        color: color.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 8px',
        fontWeight: 'bold',
        fontSize: '16px'
      }}>
        {number}
      </div>
      <div style={{ fontSize: '12px', fontWeight: status === 'current' ? 'bold' : 'normal' }}>
        {title}
      </div>
    </div>
  );
}

function ProgressLine({ status }) {
  const color = status === 'completed' ? '#4caf50' : 
                status === 'current' ? '#2196f3' : '#e0e0e0';
  
  return (
    <div style={{
      flex: 1,
      height: '3px',
      background: color,
      marginTop: '18px',
      minWidth: '40px'
    }} />
  );
}

// ==================== TEST COMPONENTS ====================

// 1. Generate Article ID Test
function GenerateArticleIdTest() {
  const [testResult, setTestResult] = useState(null);
  const [customUrl, setCustomUrl] = useState('https://example.com/article');
  const [testedUrls, setTestedUrls] = useState([]);

  useEffect(() => {
    runTest(customUrl);
  }, []);

  const runTest = (url) => {
    try {
      const id = generateArticleId(url);
      const newTest = {
        url,
        id,
        length: id.length,
        isValid: /^[a-f0-9]{32}$/.test(id),
        timestamp: new Date().toLocaleTimeString()
      };
      
      setTestResult(newTest);
      setTestedUrls(prev => [newTest, ...prev.slice(0, 4)]);
    } catch (error) {
      setTestResult({ error: error.message });
    }
  };

  return (
    <div>
      <h2>🧪 Test 1: generateArticleId</h2>
      <p>Generates a 32-character SHA-256 hash from a URL</p>
      
      <div style={{ margin: '20px 0', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="text"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          style={{ flex: 1, padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
          placeholder="Enter URL to test..."
        />
        <button
          onClick={() => runTest(customUrl)}
          style={{
            padding: '10px 20px',
            background: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Test URL
        </button>
      </div>
      
      {testResult && !testResult.error && (
        <div style={{ 
          background: '#e8f5e9', 
          padding: '20px', 
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
            <div style={{ 
              width: '24px', 
              height: '24px', 
              background: '#4caf50', 
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold'
            }}>
              ✓
            </div>
            <h3 style={{ margin: 0, color: '#2e7d32' }}>Function Working Correctly</h3>
          </div>
          
          <div style={{ 
            background: 'white', 
            padding: '15px', 
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '14px'
          }}>
            <div><strong>Input URL:</strong> {testResult.url}</div>
            <div><strong>Generated ID:</strong> {testResult.id}</div>
            <div><strong>Length:</strong> {testResult.length} characters</div>
            <div><strong>Pattern Valid:</strong> {testResult.isValid ? '✅ Yes' : '❌ No'}</div>
            <div><strong>Tested:</strong> {testResult.timestamp}</div>
          </div>
        </div>
      )}
      
      {testResult && testResult.error && (
        <div style={{ background: '#ffebee', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3 style={{ color: '#c62828', marginTop: 0 }}>❌ Error</h3>
          <p>{testResult.error}</p>
        </div>
      )}
      
      {testedUrls.length > 0 && (
        <div>
          <h4>Recent Tests:</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Time</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>URL</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>ID Preview</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Valid</th>
              </tr>
            </thead>
            <tbody>
              {testedUrls.map((test, index) => (
                <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>{test.timestamp}</td>
                  <td style={{ padding: '8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {test.url}
                  </td>
                  <td style={{ padding: '8px', fontFamily: 'monospace' }}>
                    {test.id.substring(0, 8)}...
                  </td>
                  <td style={{ padding: '8px' }}>
                    {test.isValid ? '✅' : '❌'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 2. Fetch Articles Test (REAL COMPONENT)
function FetchArticlesTest() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setTestResult(null);
    
    console.log('🧪 Starting fetchArticlesFromNewsDataEnhanced test...');
    
    try {
      const startTime = Date.now();
      const result = await fetchArticlesFromNewsDataEnhanced();
      const duration = Date.now() - startTime;
      
      console.log('✅ Fetch result:', result);
      setArticles(result);
      
      setTestResult({
        success: true,
        duration,
        count: result.length,
        timestamp: new Date().toLocaleTimeString()
      });
      
    } catch (err) {
      console.error('❌ Fetch failed:', err);
      setError(err.message);
      setTestResult({
        success: false,
        error: err.message,
        timestamp: new Date().toLocaleTimeString()
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>🧪 Test 2: fetchArticlesFromNewsDataEnhanced</h2>
      <p>Fetches articles from NewsData.io, with retry logic.</p>
      
      <div style={{ margin: '20px 0', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button
          onClick={runTest}
          disabled={loading}
          style={{
            padding: '10px 20px',
            background: loading ? '#ccc' : '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px'
          }}
        >
          {loading ? '⏳ Fetching...' : '🚀 Run Fetch Test'}
        </button>
        
        <div style={{ fontSize: '14px', color: '#666' }}>
          <div>Requires: <code>.env.local</code> with <code>VITE_NEWSAPI_API_KEY & VITE_NEWSDATA_API_KEY</code></div>
          <div>Expected: ~56 articles from NewsApi.org 'conservative' mode; 96 in 'aggressive'
          - newsapi+newsdata; newsdata is fallback in 'conservative'</div>
        </div>
      </div>
      
      {testResult && testResult.success && (
        <div style={{ 
          background: '#e8f5e9', 
          padding: '20px', 
          borderRadius: '8px',
          marginTop: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
            <div style={{ 
              width: '24px', 
              height: '24px', 
              background: '#4caf50', 
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold'
            }}>
              ✓
            </div>
            <h3 style={{ margin: 0, color: '#2e7d32' }}>Fetch Successful!</h3>
          </div>
          
          <div style={{ 
            background: 'white', 
            padding: '15px', 
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '14px'
          }}>
            <div><strong>Articles Found:</strong> {testResult.count}</div>
            <div><strong>Duration:</strong> {testResult.duration}ms</div>
            <div><strong>Tested:</strong> {testResult.timestamp}</div>
          </div>
          
          {articles.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h4>All Articles ({articles.length}):</h4>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {articles.slice(0, 5).map((article, index) => (
                  <li key={index} style={{ 
                    marginBottom: '10px', 
                    padding: '10px', 
                    background: '#f9f9f9',
                    borderLeft: '4px solid #4caf50'
                  }}>
                    <strong>{article.title}</strong><br />
                    <small>Source: {article.source_id || 'Unknown'} • Link: {article.link}</small>
                  </li>
                ))}
              </ul>
              {articles.length > 5 && <p>... and {articles.length - 5} more articles</p>}
            </div>
          )}
          
          {articles.length === 0 && (
            <div style={{ marginTop: '15px', padding: '10px', background: '#fff3cd', borderRadius: '4px' }}>
              <p>⚠️ No articles returned</p>
              <p><small>Possible reasons: API key issues, no results from NewsData.io, or filtering removed all articles</small></p>
            </div>
          )}
        </div>
      )}
      
      {testResult && !testResult.success && (
        <div style={{ 
          background: '#ffebee', 
          padding: '20px', 
          borderRadius: '8px',
          marginTop: '20px'
        }}>
          <h3 style={{ color: '#c62828', marginTop: 0 }}>❌ Fetch Failed</h3>
          <p>Error: {testResult.error}</p>
          
          <div style={{ marginTop: '15px', padding: '10px', background: '#fff3cd', borderRadius: '4px' }}>
            <h4>Troubleshooting:</h4>
            <ol>
              <li>Check <code>.env.local</code> exists with <code>VITE_NEWSDATA_API_KEY=your_key</code></li>
              <li>Restart dev server after changing env file</li>
              <li>Check browser console (F12) for detailed error</li>
              <li>Verify NewsData.io API key is valid</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

// 3. AI FILTERING TEST - NEW PHASE 3 COMPONENT
function AIFilteringTest() {
  const [rawArticles, setRawArticles] = useState([]);
  const [basicFilterResults, setBasicFilterResults] = useState(null);
  const [aiFilterResults, setAiFilterResults] = useState(null);
  const [loading, setLoading] = useState({ basic: false, ai: false, fetch: false });
  const [error, setError] = useState(null);
  const [geminiStatus, setGeminiStatus] = useState('checking...');
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    // Check if Gemini API key is configured
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (apiKey && apiKey.length > 10 && !apiKey.includes('your_actual_key')) {
      setGeminiStatus('✅ Configured');
    } else {
      setGeminiStatus('❌ Missing or invalid');
    }
  }, []);

  const fetchRawArticles = async () => {
    setLoading(prev => ({ ...prev, fetch: true }));
    setError(null);
    
    try {
      const articles = await fetchArticlesFromNewsDataEnhanced();
      setRawArticles(articles);
      
      if (articles.length === 0) {
        setError('No articles fetched. Try the Fetch Test tab first.');
      }
    } catch (err) {
      setError(`Fetch failed: ${err.message}`);
    } finally {
      setLoading(prev => ({ ...prev, fetch: false }));
    }
  };

  const testBasicKeywordFilter = async () => {
    if (rawArticles.length === 0) {
      setError('No articles to filter. Fetch articles first.');
      return;
    }
    
    setLoading(prev => ({ ...prev, basic: true }));
    setBasicFilterResults(null);
    
    try {
      const startTime = Date.now();
      const results = await basicKeywordFilter(rawArticles);
      const duration = Date.now() - startTime;
      
      setBasicFilterResults({
        results,
        duration,
        inputCount: rawArticles.length,
        outputCount: results.length,
        timestamp: new Date().toLocaleTimeString()
      });
    } catch (err) {
      setError(`Basic filter failed: ${err.message}`);
    } finally {
      setLoading(prev => ({ ...prev, basic: false }));
    }
  };

  const testAIFilter = async () => {
    if (rawArticles.length === 0) {
      setError('No articles to filter. Fetch articles first.');
      return;
    }
    
    if (geminiStatus.includes('❌')) {
      setError('Gemini API key not configured. Add VITE_GEMINI_API_KEY to .env.local');
      return;
    }
    
    setLoading(prev => ({ ...prev, ai: true }));
    setAiFilterResults(null);
    
    try {
      console.log('🧠 Starting AI filter test...');
      const startTime = Date.now();
      const results = await filterAndEnrichArticlesWithAI(rawArticles);
      const duration = Date.now() - startTime;
      
      setAiFilterResults({
        results,
        duration,
        inputCount: rawArticles.length,
        outputCount: results.length,
        timestamp: new Date().toLocaleTimeString(),
        categories: results.reduce((acc, article) => {
          acc[article.category] = (acc[article.category] || 0) + 1;
          return acc;
        }, {})
      });
    } catch (err) {
      setError(`AI filter failed: ${err.message}`);
    } finally {
      setLoading(prev => ({ ...prev, ai: false }));
    }
  };

  const testFullPipeline = async () => {
    if (geminiStatus.includes('❌')) {
      setError('Gemini API key not configured. Add VITE_GEMINI_API_KEY to .env.local');
      return;
    }
    
    setLoading(prev => ({ ...prev, ai: true, fetch: true }));
    setError(null);
    
    try {
      console.log('🚀 Starting full pipeline test...');
      const startTime = Date.now();
      const results = await fetchAndProcessGoodNews();
      const duration = Date.now() - startTime;
      
      setAiFilterResults({
        results,
        duration,
        inputCount: 'Dynamic',
        outputCount: results.length,
        timestamp: new Date().toLocaleTimeString(),
        categories: results.reduce((acc, article) => {
          acc[article.category] = (acc[article.category] || 0) + 1;
          return acc;
        }, {}),
        pipeline: 'full'
      });
    } catch (err) {
      setError(`Full pipeline failed: ${err.message}`);
    } finally {
      setLoading(prev => ({ ...prev, ai: false, fetch: false }));
    }
  };

  const generateArticleSummaryClick = async (article) => {
    if (geminiStatus.includes('❌')) {
      setError('Gemini API key not configured.');
      return;
    }
    
    setSummaryLoading(true);
    setSelectedArticle(article);
    
    try {
      const result = await generateArticleSummary(article);
      setSummary(result);
    } catch (err) {
      setSummary(`Error: ${err.message}`);
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <div>
      <h2>🧠 Phase 3: AI Filtering & Enrichment Engine</h2>
      <p>Tests the transplanted AI brain functions from Firebase</p>
      
      {/* Configuration Status */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '20px',
        marginBottom: '30px'
      }}>
        <div style={{ 
          background: geminiStatus.includes('✅') ? '#e8f5e9' : '#fff3cd', 
          padding: '15px', 
          borderRadius: '8px'
        }}>
          <h4 style={{ marginTop: 0 }}>Gemini API Status</h4>
          <p style={{ fontSize: '18px', fontWeight: 'bold' }}>{geminiStatus}</p>
          <p style={{ fontSize: '12px', color: '#666' }}>
            {geminiStatus.includes('✅') 
              ? 'Ready for AI processing' 
              : 'Add VITE_GEMINI_API_KEY to .env.local'}
          </p>
        </div>
        
        <div style={{ 
          background: rawArticles.length > 0 ? '#e8f5e9' : '#fff3cd', 
          padding: '15px', 
          borderRadius: '8px'
        }}>
          <h4 style={{ marginTop: 0 }}>Available Articles</h4>
          <p style={{ fontSize: '18px', fontWeight: 'bold' }}>{rawArticles.length} raw articles</p>
          <button
            onClick={fetchRawArticles}
            disabled={loading.fetch}
            style={{
              padding: '8px 16px',
              background: loading.fetch ? '#ccc' : '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading.fetch ? 'not-allowed' : 'pointer'
            }}
          >
            {loading.fetch ? '⏳ Fetching...' : '📥 Fetch Articles'}
          </button>
        </div>
      </div>
      
      {/* Test Buttons */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '15px',
        marginBottom: '30px'
      }}>
        <div style={{ 
          background: '#f8f9fa', 
          padding: '20px', 
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <h4 style={{ marginTop: 0 }}>1. Basic Keyword Filter</h4>
          <p style={{ fontSize: '14px', color: '#666' }}>Fast keyword-based positivity filter</p>
          <button
            onClick={testBasicKeywordFilter}
            disabled={loading.basic || rawArticles.length === 0}
            style={{
              width: '100%',
              padding: '12px',
              background: loading.basic || rawArticles.length === 0 ? '#e0e0e0' : '#2196f3',
              color: loading.basic || rawArticles.length === 0 ? '#999' : 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading.basic || rawArticles.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            {loading.basic ? '⏳ Processing...' : '🔍 Run Basic Filter'}
          </button>
          <div style={{ fontSize: '12px', textAlign: 'center', marginTop: '8px' }}>
            Status: {basicFilterResults ? '✅ Tested' : '🟡 Ready'}
          </div>
        </div>
        
        <div style={{ 
          background: '#f8f9fa', 
          padding: '20px', 
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <h4 style={{ marginTop: 0 }}>2. AI Full Filter</h4>
          <p style={{ fontSize: '14px', color: '#666' }}>Gemini AI analysis + enrichment</p>
          <button
            onClick={testAIFilter}
            disabled={loading.ai || rawArticles.length === 0 || geminiStatus.includes('❌')}
            style={{
              width: '100%',
              padding: '12px',
              background: loading.ai || rawArticles.length === 0 || geminiStatus.includes('❌') ? '#e0e0e0' : '#9c27b0',
              color: loading.ai || rawArticles.length === 0 || geminiStatus.includes('❌') ? '#999' : 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading.ai || rawArticles.length === 0 || geminiStatus.includes('❌') ? 'not-allowed' : 'pointer'
            }}
          >
            {loading.ai ? '🤖 AI Processing...' : '🧠 Run AI Filter'}
          </button>
          <div style={{ fontSize: '12px', textAlign: 'center', marginTop: '8px' }}>
            Status: {aiFilterResults ? '✅ Tested' : geminiStatus.includes('✅') ? '🟡 Ready' : '🔴 Need API Key'}
          </div>
        </div>
        
        <div style={{ 
          background: '#f8f9fa', 
          padding: '20px', 
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <h4 style={{ marginTop: 0 }}>3. Full Pipeline</h4>
          <p style={{ fontSize: '14px', color: '#666' }}>Fetch + AI process in one click</p>
          <button
            onClick={testFullPipeline}
            disabled={(loading.ai && loading.fetch) || geminiStatus.includes('❌')}
            style={{
              width: '100%',
              padding: '12px',
              background: (loading.ai && loading.fetch) || geminiStatus.includes('❌') ? '#e0e0e0' : '#673ab7',
              color: (loading.ai && loading.fetch) || geminiStatus.includes('❌') ? '#999' : 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: (loading.ai && loading.fetch) || geminiStatus.includes('❌') ? 'not-allowed' : 'pointer'
            }}
          >
            {loading.ai && loading.fetch ? '🚀 Running...' : '🚀 Run Full Pipeline'}
          </button>
          <div style={{ fontSize: '12px', textAlign: 'center', marginTop: '8px' }}>
            Status: {aiFilterResults?.pipeline === 'full' ? '✅ Tested' : '🟡 Ready'}
          </div>
        </div>
      </div>
      
      {/* Error Display */}
      {error && (
        <div style={{ 
          background: '#ffebee', 
          padding: '20px', 
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <h3 style={{ color: '#c62828', marginTop: 0 }}>❌ Error</h3>
          <p>{error}</p>
        </div>
      )}
      
      {/* Results Display */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '20px',
        marginTop: '20px'
      }}>
        {/* Basic Filter Results */}
        {basicFilterResults && (
          <div style={{ 
            background: '#e3f2fd', 
            padding: '20px', 
            borderRadius: '8px',
            border: '2px solid #2196f3'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
              <div style={{ 
                width: '24px', 
                height: '24px', 
                background: '#2196f3', 
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold'
              }}>
                ℹ️
              </div>
              <h3 style={{ margin: 0, color: '#0d47a1' }}>Basic Filter Results</h3>
            </div>
            
            <div style={{ 
              background: 'white', 
              padding: '15px', 
              borderRadius: '6px',
              marginBottom: '15px'
            }}>
              <div><strong>Input:</strong> {basicFilterResults.inputCount} articles</div>
              <div><strong>Output:</strong> {basicFilterResults.outputCount} articles</div>
              <div><strong>Filter Ratio:</strong> {(basicFilterResults.outputCount / basicFilterResults.inputCount * 100).toFixed(1)}%</div>
              <div><strong>Duration:</strong> {basicFilterResults.duration}ms</div>
              <div><strong>Tested:</strong> {basicFilterResults.timestamp}</div>
            </div>
            
            {basicFilterResults.results.length > 0 && (
              <div>
                <h4>Filtered Articles ({basicFilterResults.results.length}):</h4>
                <ul style={{ listStyle: 'none', padding: 0, maxHeight: '200px', overflowY: 'auto' }}>
                  {basicFilterResults.results.map((article, index) => (
                    <li key={index} style={{ 
                      marginBottom: '10px', 
                      padding: '10px', 
                      background: '#f8f9fa',
                      borderLeft: '4px solid #2196f3',
                      borderRadius: '4px'
                    }}>
                      <strong>{article.title}</strong><br />
                      <small>Category: {article.category} • Source: {article.source}</small>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        
        {/* AI Filter Results */}
        {aiFilterResults && (
          <div style={{ 
            background: '#f3e5f5', 
            padding: '20px', 
            borderRadius: '8px',
            border: '2px solid #7b1fa2'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
              <div style={{ 
                width: '24px', 
                height: '24px', 
                background: '#7b1fa2', 
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold'
              }}>
                🤖
              </div>
              <h3 style={{ margin: 0, color: '#4a148c' }}>AI Filter Results</h3>
            </div>
            
            <div style={{ 
              background: 'white', 
              padding: '15px', 
              borderRadius: '6px',
              marginBottom: '15px'
            }}>
              <div><strong>Input:</strong> {aiFilterResults.inputCount} articles</div>
              <div><strong>Output:</strong> {aiFilterResults.outputCount} articles</div>
              <div><strong>AI Filter Ratio:</strong> {(aiFilterResults.outputCount / (typeof aiFilterResults.inputCount === 'number' ? aiFilterResults.inputCount : rawArticles.length) * 100).toFixed(1)}%</div>
              <div><strong>Duration:</strong> {aiFilterResults.duration}ms</div>
              <div><strong>Tested:</strong> {aiFilterResults.timestamp}</div>
              {aiFilterResults.categories && (
                <div><strong>Categories:</strong> {Object.entries(aiFilterResults.categories).map(([cat, count]) => `${cat}: ${count}`).join(', ')}</div>
              )}
            </div>
            
            {aiFilterResults.results.length > 0 && (
              <div>
                <h4>AI-Enriched Articles ({aiFilterResults.results.length}):</h4>
                <ul style={{ listStyle: 'none', padding: 0, maxHeight: '200px', overflowY: 'auto' }}>
                  {aiFilterResults.results.slice(0, 3).map((article, index) => (
                    <li 
                      key={index} 
                      style={{ 
                        marginBottom: '10px', 
                        padding: '10px', 
                        background: '#f8f9fa',
                        borderLeft: '4px solid #7b1fa2',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                      onClick={() => generateArticleSummaryClick(article)}
                    >
                      <strong>{article.title}</strong><br />
                      <small>Category: {article.category} • AI Processed: {article.aiProcessed ? '✅' : '❌'}</small><br />
                      <small style={{ color: '#666' }}>Click for AI summary</small>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Summary Display */}
      {selectedArticle && (
        <div style={{ 
          background: '#fff3e0', 
          padding: '20px', 
          borderRadius: '8px',
          marginTop: '20px',
          border: '2px solid #f57c00'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
            <div style={{ 
              width: '24px', 
              height: '24px', 
              background: '#f57c00', 
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold'
            }}>
              📝
            </div>
            <h3 style={{ margin: 0, color: '#e65100' }}>Article Summary (AI-Generated)</h3>
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <strong>Selected Article:</strong> {selectedArticle.title}
          </div>
          
          {summaryLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>🤖</div>
              <p>Generating AI summary...</p>
            </div>
          ) : (
            <div style={{ 
              background: 'white', 
              padding: '15px', 
              borderRadius: '6px',
              fontStyle: 'italic'
            }}>
              {summary}
            </div>
          )}
        </div>
      )}
      
      {/* Instructions */}
      <div style={{ 
        marginTop: '30px', 
        padding: '15px', 
        background: '#f5f5f5', 
        borderRadius: '8px',
        fontSize: '14px'
      }}>
        <h4>📋 Phase 3 Testing Instructions:</h4>
        <ol>
          <li><strong>Setup:</strong> Get Gemini API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a></li>
          <li><strong>Configure:</strong> Add <code>VITE_GEMINI_API_KEY=your_key_here</code> to <code>.env.local</code></li>
          <li><strong>Restart:</strong> Restart dev server (<code>npm run dev</code>)</li>
          <li><strong>Test:</strong> Run Basic Filter first, then AI Filter</li>
          <li><strong>Verify:</strong> Check browser console for detailed logs</li>
        </ol>
      </div>
    </div>
  );
}

// 4. Full Integration Test (UPDATED)
function FullIntegrationTest() {
  const [pipelineResult, setPipelineResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const testFullEngine = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Test 1: Generate Article ID
      const testId = generateArticleId('https://test.com/article');
      const idValid = /^[a-f0-9]{32}$/.test(testId);
      
      // Test 2: Fetch Articles
      const articles = await fetchArticlesFromNewsDataEnhanced();
      
      // Test 3: AI Processing (if Gemini available)
      let aiResults = [];
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (geminiKey && geminiKey.length > 10) {
        aiResults = await filterAndEnrichArticlesWithAI(articles.slice(0, 3));
      }
      
      setPipelineResult({
        idTest: { valid: idValid, id: testId.substring(0, 8) + '...' },
        fetchTest: { count: articles.length, success: articles.length > 0 },
        aiTest: { 
          available: !!geminiKey && geminiKey.length > 10,
          processed: aiResults.length,
          success: aiResults.length > 0
        },
        timestamp: new Date().toLocaleTimeString()
      });
      
    } catch (err) {
      setError(`Engine test failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>🏁 Phase 4: Full Engine Integration</h2>
      <p>Tests the complete extracted engine working together</p>
      
      <div style={{ margin: '30px 0' }}>
        <button
          onClick={testFullEngine}
          disabled={loading}
          style={{
            padding: '15px 30px',
            background: loading ? '#ccc' : '#673ab7',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '18px',
            fontWeight: 'bold'
          }}
        >
          {loading ? '🔄 Testing...' : '🏁 Run Full Engine Test'}
        </button>
      </div>
      
      {pipelineResult && (
        <div style={{ 
          background: '#e8f5e9', 
          padding: '20px', 
          borderRadius: '8px',
          border: '2px solid #4caf50'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
            <div style={{ 
              width: '24px', 
              height: '24px', 
              background: '#4caf50', 
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold'
            }}>
              🎉
            </div>
            <h3 style={{ margin: 0, color: '#2e7d32' }}>Engine Integration Successful!</h3>
          </div>
          
          <p>All extracted components working together</p>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: '20px',
            marginBottom: '20px'
          }}>
            <div style={{ 
              background: '#f8f9fa', 
              padding: '20px', 
              borderRadius: '8px',
              textAlign: 'center',
              borderTop: '4px solid #2196f3'
            }}>
              <h4 style={{ marginTop: 0, color: '#2196f3' }}>1. ID Generation</h4>
              <div style={{ 
                fontSize: '20px', 
                fontWeight: 'bold',
                margin: '10px 0',
                color: pipelineResult.idTest.valid ? '#4caf50' : '#f44336'
              }}>
                {pipelineResult.idTest.valid ? '✅ PASS' : '❌ FAIL'}
              </div>
              <div style={{ fontSize: '14px', color: '#666' }}>
                ID: {pipelineResult.idTest.id}
              </div>
            </div>
            
            <div style={{ 
              background: '#f8f9fa', 
              padding: '20px', 
              borderRadius: '8px',
              textAlign: 'center',
              borderTop: '4px solid #4caf50'
            }}>
              <h4 style={{ marginTop: 0, color: '#4caf50' }}>2. Article Fetching</h4>
              <div style={{ 
                fontSize: '20px', 
                fontWeight: 'bold',
                margin: '10px 0',
                color: pipelineResult.fetchTest.success ? '#4caf50' : '#ff9800'
              }}>
                {pipelineResult.fetchTest.success ? '✅ PASS' : '⚠️ WARN'}
              </div>
              <div style={{ fontSize: '14px', color: '#666' }}>
                {pipelineResult.fetchTest.count} articles
              </div>
            </div>
            
            <div style={{ 
              background: '#f8f9fa', 
              padding: '20px', 
              borderRadius: '8px',
              textAlign: 'center',
              borderTop: '4px solid #9c27b0'
            }}>
              <h4 style={{ marginTop: 0, color: '#9c27b0' }}>3. AI Processing</h4>
              <div style={{ 
                fontSize: '20px', 
                fontWeight: 'bold',
                margin: '10px 0',
                color: pipelineResult.aiTest.available 
                  ? (pipelineResult.aiTest.success ? '#4caf50' : '#ff9800') 
                  : '#9e9e9e'
              }}>
                {pipelineResult.aiTest.available 
                  ? (pipelineResult.aiTest.success ? '✅ PASS' : '⚠️ NO RESULTS') 
                  : '🔒 SKIPPED'}
              </div>
              <div style={{ fontSize: '14px', color: '#666' }}>
                {pipelineResult.aiTest.available 
                  ? `${pipelineResult.aiTest.processed} enriched` 
                  : 'No API key'}
              </div>
            </div>
          </div>
          
          <div style={{ 
            background: 'white', 
            padding: '20px', 
            borderRadius: '6px',
            textAlign: 'center',
            border: '1px dashed #4caf50'
          }}>
            <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
              Engine test completed at {pipelineResult.timestamp}
            </p>
            <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#999' }}>
              Phase 3 (AI Functions) complete. Ready for Phase 4: UI Components
            </p>
          </div>
        </div>
      )}
      
      {error && (
        <div style={{ 
          background: '#ffebee', 
          padding: '20px', 
          borderRadius: '8px',
          marginTop: '20px'
        }}>
          <h3 style={{ color: '#c62828', marginTop: 0 }}>❌ Integration Test Failed</h3>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}

export default App;