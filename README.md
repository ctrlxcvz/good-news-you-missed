# 🌟 Good News Engine

**An AI-powered autonomous curator that transforms doomscrolling into hope-scrolling**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Firebase](https://img.shields.io/badge/Firebase-v2-orange.svg)](https://firebase.google.com/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5%20Flash-blue.svg)](https://ai.google.dev/)

[Features](#features) • [Demo](#live-demo) • [Quick Start](#quick-start) • [Roadmap](#roadmap) • [Contributing](#contributing)

---

## 🎯 The Problem

**Doomscrolling is destroying our mental health.** Studies show 73% of news consumers experience anxiety from constant negative coverage. We built an autonomous AI agent that fights back.

## 💡 The Solution

Every 6 hours, our serverless engine:
1. 🔍 Scans 100+ global headlines
2. 🤖 AI-filters for genuinely uplifting stories (no toxic positivity)
3. ✨ Summarizes with context and emotional intelligence
4. 📱 Delivers hope directly to your app/feed

**Zero maintenance. Zero cost (under 10K users). 100% good vibes.**

---

## ✨ Features

### Core Engine
- **🧠 Smart AI Curation** - Gemini 2.5 Flash enforces strict "Good News" criteria
  - ❌ No politics/crime/tragedy
  - ✅ Yes to science breakthroughs, human kindness, environmental wins
- **⚡ Batch Processing** - Analyzes 20+ articles per AI call (cost: ~$0.002/batch)
- **🔄 Auto-Deduplication** - URL fingerprinting prevents story repeats
- **🧹 Self-Cleaning Database** - 48-hour TTL keeps Firestore lean

### Developer Experience
- **🚀 One-Command Deploy** - `firebase deploy --only functions`
- **🔐 Secret Manager Integration** - No `.env` files, no leaked keys
- **📊 Built-in Analytics** - Track filter rates and AI performance
- **🧪 Local Testing Suite** - Validate filters before deployment

---

## 🎬 Live Demo

**Try the engine:** [goodnews-demo.web.app](https://goodnews-demo.web.app)

**Sample Output:**
```json
{
  "title": "Scientists Develop Plastic-Eating Enzyme 10x More Efficient",
  "summary": "Researchers at UT Austin engineered a bacterial enzyme that breaks down PET plastic in hours instead of centuries...",
  "category": "Environment",
  "sentiment": "breakthrough",
  "publishedAt": "2025-01-14T08:30:00Z"
}
```

---

## 🚀 Quick Start

### Prerequisites
```bash
node --version  # 20+
firebase --version  # 13+
```

### 1. Clone & Install
```bash
git clone https://codeberg.org/yourusername/good-news-engine
cd good-news-engine
npm install
```

### 2. Get API Keys (Free Tiers)
- **NewsData.io**: [Get Key](https://newsdata.io/register) (200 requests/day free)
- **Gemini API**: [Get Key](https://ai.google.dev/) (1,500 requests/day free)

### 3. Configure Secrets
```bash
# Initialize Firebase
firebase login
firebase init functions

# Store keys securely
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set NEWSDATA_API_KEY
```

### 4. Deploy
```bash
firebase deploy --only functions
# ✅ Function deployed: https://us-central1-yourproject.cloudfunctions.net/fetchGoodNews
```

### 5. Test Manually
```bash
# Trigger the function
curl -X POST https://YOUR_FUNCTION_URL

# Check Firestore
firebase firestore:read goodNews --limit 5
```

---

## 📁 Project Structure
```
good-news-engine/
├── functions/
│   ├── index.js           # Main Cloud Function
│   ├── filters.js         # AI prompt templates
│   └── package.json
├── firestore.rules        # Security rules
├── firebase.json
├── README.md
└── .gitignore
```

---

## 🛣️ Roadmap

### Phase 1: Core Engine ✅ Complete
- [x] Automated fetching + filtering
- [x] Gemini 2.5 Flash integration
- [x] Firestore storage with TTL

### Phase 2: Enhancement 🚧 In Progress
- [ ] **Category Tagging** - Science, Environment, Health, etc.
- [ ] **Sentiment Scoring** - "Inspiring" vs "Hopeful" vs "Breakthrough"
- [ ] **Multi-Language Support** - Spanish, French, German (using Gemini's built-in translation)
- [ ] **RSS Feed Output** - `goodnews.rss` for compatibility

### Phase 3: Community Features 📅 Q2 2025
- [ ] **Upvote System** - Let users vote on their favorite stories
- [ ] **Weekly Digest Email** - Automated Mailchimp/SendGrid integration
- [ ] **Browser Extension** - Replace "Trending News" with good news
- [ ] **Public API** - Share good news with other developers

### Phase 4: Scale & Monetization 💡 Future
- [ ] **Premium Tier** - Custom filters, private instances ($5/mo)
- [ ] **White-Label Licensing** - For mental health apps
- [ ] **Corporate Wellness** - Slack/Teams integration

---

## 💰 Cost Breakdown (Transparent Pricing)

### Free Tier (0-1K users/day)
| Service | Usage | Cost |
|---------|-------|------|
| NewsData.io | 200 requests/day | $0 |
| Gemini API | 1,500 requests/day | $0 |
| Firebase Functions | 2M invocations/month | $0 |
| Firestore | 50K reads/day | $0 |
| **Total** | | **$0/month** |

### Growth Tier (1K-10K users/day)
| Service | Usage | Cost |
|---------|-------|------|
| NewsData.io | 10K requests/month | $0 (free tier) |
| Gemini API | 45K requests/month | $0 (free tier) |
| Firebase Functions | 6M invocations/month | $0 |
| Firestore | 1.5M reads/month | ~$0.50 |
| **Total** | | **~$0.50/month** |

### Scale Tier (10K+ users/day)
Estimated at **$15-30/month** depending on traffic patterns. Contact us for optimization strategies.

---

## 🛠️ Architecture
```
┌─────────────────┐
│  Cloud Scheduler│  (Every 6 hours)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Firebase Function│
│  fetchGoodNews  │
└────────┬────────┘
         │
         ├──────────────┐
         ▼              ▼
┌──────────────┐  ┌──────────────┐
│ NewsData.io  │  │ Gemini 2.5   │
│  API Fetch   │  │  Flash AI    │
└──────┬───────┘  └──────┬───────┘
       │                 │
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │   Firestore DB  │
       │  (Auto-Cleanup) │
       └─────────────────┘
```

**Key Design Decisions:**
1. **Batch Processing** - Process 20 articles in one AI call instead of 20 separate calls
2. **URL Fingerprinting** - Hash URLs to prevent duplicate storage
3. **TTL Pattern** - Store `createdAt` timestamp, query with `where('createdAt', '>', 48hoursAgo)`
4. **Stateless Functions** - No persistent memory between runs

---

## 🧪 Testing Locally

### Run the function locally
```bash
firebase emulators:start --only functions,firestore
```

### Test the AI filter
```bash
node test-gemini.js
```

### Example test file (`test-gemini.js`):
```javascript
const { analyzeArticles } = require('./functions/filters');

const mockArticles = [
  {
    title: "Local Dog Rescues Family from Fire",
    description: "Hero pup alerts sleeping family to kitchen blaze..."
  },
  {
    title: "Political Scandal Rocks Capital",
    description: "Corruption investigation expands..."
  }
];

analyzeArticles(mockArticles).then(results => {
  console.log('✅ Good News:', results.filter(r => r.isGoodNews));
  console.log('❌ Filtered:', results.filter(r => !r.isGoodNews));
});
```

---

## 🤝 Contributing

We welcome contributions! Here are ways to help:

### Low-Effort Contributions
- 🐛 **Report Bugs** - Open an issue with reproduction steps
- 💡 **Suggest Features** - Share your ideas in Discussions
- 📖 **Improve Docs** - Fix typos, add examples
- ⭐ **Star the Repo** - Help others discover this project

### Code Contributions
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-idea`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-idea`)
5. Open a Pull Request

**See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.**

---

## 🔒 Security

### Secrets Management
- **Never commit** API keys to version control
- Use Firebase Secret Manager for production
- Rotate keys every 90 days
- Enable 2FA on all service accounts

### Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /goodNews/{article} {
      allow read: if true;  // Public read
      allow write: if false;  // Only Cloud Functions can write
    }
  }
}
```

### Report Vulnerabilities
Email security@yourproject.com (do not open public issues for security bugs)

---

## 📜 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

**TL;DR:** You can use, modify, and distribute this freely. Just include the original license.

---

## 🙏 Acknowledgments

- **NewsData.io** - For providing free news API access
- **Google AI** - For Gemini 2.5 Flash's incredible filtering capabilities
- **Firebase Team** - For the best serverless platform
- **You** - For caring about mental health and positive news

---

## 📬 Contact & Support

- **Issues**: [Open an issue](https://codeberg.org/yourusername/good-news-engine/issues)
- **Discussions**: [Join the conversation](https://codeberg.org/yourusername/good-news-engine/discussions)
- **Twitter**: [@goodnewsengine](https://twitter.com/goodnewsengine)
- **Email**: hello@goodnewsengine.dev

---

## 🌍 Join the Movement

**Every deploy makes the internet a little brighter.** ✨

If this project helped you, consider:
- ⭐ Starring the repo
- 🐦 Sharing on social media
- 💬 Telling a friend who needs good news
- ☕ [Buy us a coffee](https://buymeacoffee.com/ctrlxcvz)

## 💰 Support the Project

Find me on nostr, codeberg, and substack ONLY!

[💜 nostr](https://njump.me/ctrlxcvz@plebchain.club)  
[💾 codeberg](https://codeberg.org/ctrlxcvz)  
[📖 substack](https://substack.com/@ctrlxcvz)

If you find this helpful, consider sending a tip!

| Asset | Address |
| :--- | :--- |
| **Lightning (Zap)** | `gallantdisk053@walletofsatoshi.com` |
| **Bitcoin (BTC)** | `bc1q073hyc4gnd4zpr3zvxldqxd7pwusktw7tguu4g` |
| **Monero (XMR)** | `88hWjDuptnBerfkoTTAUhJ4AFuiMnMPSVVQhAbiV2rSEV7Gj2FaytRv1bnL8gPmL6U4L4XhFVBc4KbQLDmDM9hEaC4S1FV5` |

[![Zap](https://img.shields.io/badge/Zap-Lightning-yellow?logo=lightning)](https://codeberg.org/ctrlxcvz/deeptaxstr/raw/branch/main/assets/zapln_qr.png)
[![Bitcoin](https://img.shields.io/badge/Bitcoin-BTC-orange?logo=bitcoin)](https://codeberg.org/ctrlxcvz/deeptaxstr/raw/branch/main/assets/btc_qr.png)
[![Monero](https://img.shields.io/badge/Monero-XMR-ff6600?logo=monero)](https://codeberg.org/ctrlxcvz/deeptaxstr/raw/branch/main/assets/xmr_qr.png)

> ### 💡 Privacy Note
> When sending Monero (XMR), your transaction is private by default. For Bitcoin, consider using a fresh address for each tip if you want to maintain maximum on-chain privacy.

---

<div align="center">

**Built with ❤️ and AI to fight doomscrolling**

[⬆ Back to Top](#-good-news-engine)

</div>