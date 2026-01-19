// src/App.jsx - MODULAR TESTING DASHBOARD
import React, { useEffect, useState } from 'react';
import './App.css';

// Import functions as we extract them
import { generateArticleId } from './assets/lib/utils.js';
import { fetchArticlesFromNewsDataEnhanced } from './assets/lib/services/news-service.js';
// import { filterAndEnrichArticlesWithAI, basicKeywordFilter } from './lib/services/ai-service.js';

function App() {
  const [activeTab, setActiveTab] = useState('generateArticleId');
  
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '30px' }}>
        <h1>🔧 Firebase Engine - Surgical Extraction Dashboard</h1>
        <p>Test each extracted function incrementally</p>
      </header>
      
      {/* Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '30px',
        borderBottom: '2px solid #eee',
        paddingBottom: '10px'
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
          label="2. fetchArticlesFromNewsDataEnhanced"
          status="✅"
        />
        <TabButton 
          id="aiFiltering" 
          activeTab={activeTab} 
          setActiveTab={setActiveTab}
          label="3. AI Filtering"
          status="🔒"
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
        <div style={{ display: 'flex', alignItems: 'center', margin: '15px 0' }}>
          <ProgressStep number="1" status="completed" title="Project Setup" />
          <ProgressLine status="completed" />
          <ProgressStep number="2" status="completed" title="generateArticleId" />
          <ProgressLine status="completed" />
          <ProgressStep number="3" status="current" title="fetchArticles" />
          <ProgressLine status="current" />
          <ProgressStep number="4" status="pending" title="AI Functions" />
          <ProgressLine status="pending" />
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
          <div>Requires: <code>.env.local</code> with <code>VITE_NEWSDATA_API_KEY</code></div>
          <div>Expected: 0-10 articles from NewsData.io</div>
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

// 4. Full Integration Test (PLACEHOLDER)
function FullIntegrationTest() {
  return (
    <div>
      <h2>🧪 Test 4: Full Engine Integration</h2>
      <div style={{ 
        background: '#d1ecf1', 
        padding: '30px', 
        borderRadius: '8px',
        textAlign: 'center',
        border: '2px dashed #0c5460'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🏁</div>
        <h3 style={{ color: '#0c5460' }}>Complete Engine Test</h3>
        <p>Will test the entire pipeline when all functions are extracted</p>
      </div>
    </div>
  );
}

export default App;