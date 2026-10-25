/* ============================================
   HACKPIPE — AI Classifier (Groq + Llama)
   Classifies HN stories using LLM intelligence
   ============================================ */

const Classifier = (function () {
  'use strict';

  // --- STORAGE KEYS ---
  const API_KEY_STORAGE = 'hackpipe_groq_api_key';
  const CACHE_PREFIX = 'hackpipe_classified_';
  const CACHE_TTL = 30 * 60 * 1000; // 30 min cache

  // --- CATEGORIES ---
  const CATEGORIES = {
    hot: {
      id: 'hot',
      label: '🔥 HOT & TRENDING',
      shortLabel: 'HOT',
      icon: '🔥',
      color: 'orange',
      description: "What's new and hot in the market",
    },
    ai: {
      id: 'ai',
      label: '🤖 AI OPPORTUNITIES',
      shortLabel: 'AI',
      icon: '🤖',
      color: 'purple',
      description: 'Using AI to create better opportunities',
    },
    jobs: {
      id: 'jobs',
      label: '💼 JOB OPPORTUNITIES',
      shortLabel: 'JOBS',
      icon: '💼',
      color: 'green',
      description: 'Job & career opportunities',
    },
  };

  // --- API KEY MANAGEMENT ---
  function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE) || '';
  }

  function setApiKey(key) {
    localStorage.setItem(API_KEY_STORAGE, key.trim());
  }

  function hasApiKey() {
    return getApiKey().length > 0;
  }

  // Detect key from URL (?key=gsk_... or #key=gsk_...) on first visit
  (function initKeyFromUrl() {
    try {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      const queryKey = url.searchParams.get('key') || url.searchParams.get('groq');
      let hashKey = null;
      if (window.location.hash) {
        const hash = window.location.hash.replace(/^#/, '');
        if (hash.startsWith('gsk_')) hashKey = hash;
        else {
          const hashParams = new URLSearchParams(hash);
          hashKey = hashParams.get('key') || hashParams.get('groq');
        }
      }
      const candidateKey = (queryKey || hashKey || '').trim();
      if (candidateKey.startsWith('gsk_')) {
        setApiKey(candidateKey);
        if (queryKey) {
          url.searchParams.delete('key');
          url.searchParams.delete('groq');
        }
        const cleanHash = window.location.hash.includes('gsk_') ? '' : window.location.hash;
        window.history.replaceState({}, document.title, url.pathname + (url.search || '') + cleanHash);
      }
    } catch (_) {}
  })();

  // --- CACHE ---
  function getCacheKey(storyId) {
    return CACHE_PREFIX + storyId;
  }

  function getCachedScore(storyId) {
    try {
      const raw = sessionStorage.getItem(getCacheKey(storyId));
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - cached.ts > CACHE_TTL) {
        sessionStorage.removeItem(getCacheKey(storyId));
        return null;
      }
      return cached.scores;
    } catch {
      return null;
    }
  }

  function setCachedScore(storyId, scores) {
    try {
      sessionStorage.setItem(getCacheKey(storyId), JSON.stringify({ scores, ts: Date.now() }));
    } catch {
      // Storage full — clear old entries
      sessionStorage.clear();
    }
  }

  // --- GROQ API ---
  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const MODEL = 'llama-3.1-8b-instant';

  function buildPrompt(stories) {
    const storyList = stories.map((s, i) => {
      let entry = `[${i}] "${s.title}"`;
      if (s.url) entry += ` (${s.url})`;
      if (s.text) {
        const plainText = s.text.replace(/<[^>]*>/g, '').slice(0, 150);
        entry += ` — ${plainText}`;
      }
      return entry;
    }).join('\n');

    return `You are a Hacker News story classifier. Classify each story into relevance categories for a tech professional.

CATEGORIES:
- hot: What's new and hot in the tech market — product launches, funding rounds, major company news, viral projects, breaking tech news, industry shifts, significant open-source releases
- ai: AI opportunities — AI tools, LLMs, machine learning, ways to use AI for business/productivity, AI startups, AI tutorials/guides, automation, generative AI
- jobs: Job opportunities — hiring posts, career advice, salary discussions, job market trends, interview tips, remote work, freelancing, layoffs/hiring news

SCORING RULES:
- Score each story 0-10 for EACH category (a story can score high in multiple categories)
- 0 = completely irrelevant, 1-3 = tangentially related, 4-6 = moderately relevant, 7-10 = highly relevant
- Be generous but accurate — if a story could help someone in that area, give it some score

STORIES:
${storyList}

Respond with ONLY a valid JSON array. Each element must be an object with keys "i" (story index), "hot", "ai", "jobs" (integer scores 0-10). No explanation, no markdown, just the JSON array.`;
  }

  async function callGroq(prompt, apiKey) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are a precise JSON classifier. You only output valid JSON arrays, nothing else.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('INVALID_API_KEY');
      if (res.status === 429) throw new Error('RATE_LIMITED');
      throw new Error(err.error?.message || `Groq API error: ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    return content;
  }

  function parseScores(responseText) {
    try {
      let parsed = JSON.parse(responseText);
      // Handle both {results: [...]} and direct array
      if (parsed && !Array.isArray(parsed)) {
        // Find the first array property
        const arrKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
        if (arrKey) parsed = parsed[arrKey];
        else throw new Error('No array found in response');
      }
      return parsed.map(item => ({
        i: item.i,
        hot: Math.max(0, Math.min(10, parseInt(item.hot) || 0)),
        ai: Math.max(0, Math.min(10, parseInt(item.ai) || 0)),
        jobs: Math.max(0, Math.min(10, parseInt(item.jobs) || 0)),
      }));
    } catch (e) {
      // Try to extract JSON from the response
      const match = responseText.match(/\[[\s\S]*\]/);
      if (match) {
        return parseScores(match[0]);
      }
      throw new Error('Failed to parse AI response');
    }
  }

  // --- BATCH CLASSIFICATION ---
  // Process stories in batches of 15 for speed
  const BATCH_SIZE = 15;

  async function classifyBatch(stories, apiKey) {
    // Check cache first
    const uncached = [];
    const cachedResults = {};

    stories.forEach((story, i) => {
      const cached = getCachedScore(story.id);
      if (cached) {
        cachedResults[i] = cached;
      } else {
        uncached.push({ story, originalIndex: i });
      }
    });

    // If everything is cached, return immediately
    if (uncached.length === 0) {
      return stories.map((story, i) => ({
        ...story,
        _scores: cachedResults[i],
      }));
    }

    // Classify uncached stories in batches
    const batchPromises = [];
    for (let b = 0; b < uncached.length; b += BATCH_SIZE) {
      const batch = uncached.slice(b, b + BATCH_SIZE);
      batchPromises.push(
        (async () => {
          try {
            const prompt = buildPrompt(batch.map(b => b.story));
            const rawResponse = await callGroq(prompt, apiKey);
            const scores = parseScores(rawResponse);

            scores.forEach(score => {
              const batchItem = batch[score.i];
              if (!batchItem) return;

              const computed = computeScores(score);
              cachedResults[batchItem.originalIndex] = computed;
              setCachedScore(batchItem.story.id, computed);
            });
          } catch (err) {
            // On error, give batch items zero scores
            console.warn('Batch classification failed:', err);
            batch.forEach(batchItem => {
              if (!cachedResults[batchItem.originalIndex]) {
                cachedResults[batchItem.originalIndex] = fallbackScore(batchItem.story);
              }
            });
            // Re-throw API key errors
            if (err.message === 'INVALID_API_KEY' || err.message === 'RATE_LIMITED') {
              throw err;
            }
          }
        })()
      );
    }

    await Promise.all(batchPromises);

    // Merge scores into stories
    return stories.map((story, i) => ({
      ...story,
      _scores: cachedResults[i] || fallbackScore(story),
    }));
  }

  function computeScores(rawScore) {
    const hot = rawScore.hot || 0;
    const ai = rawScore.ai || 0;
    const jobs = rawScore.jobs || 0;
    const totalRelevance = hot + ai + jobs;

    let topCategory = null;
    let topScore = 0;

    if (hot >= ai && hot >= jobs && hot >= 4) { topCategory = 'hot'; topScore = hot; }
    else if (ai >= hot && ai >= jobs && ai >= 4) { topCategory = 'ai'; topScore = ai; }
    else if (jobs >= hot && jobs >= ai && jobs >= 4) { topCategory = 'jobs'; topScore = jobs; }

    return {
      hot, ai, jobs,
      topCategory,
      topScore,
      totalRelevance,
      isRelevant: totalRelevance >= 5,
    };
  }

  // Keyword fallback for when API fails
  function fallbackScore(item) {
    const title = (item.title || '').toLowerCase();
    let hot = 0, ai = 0, jobs = 0;

    // Simple keyword detection
    const hotWords = ['launch', 'funding', 'raised', 'announce', 'release', 'startup', 'billion', 'ipo', 'acquisition', 'open source', 'new'];
    const aiWords = ['ai', 'llm', 'gpt', 'machine learning', 'deep learning', 'neural', 'chatgpt', 'claude', 'openai', 'anthropic', 'model', 'transformer', 'automation'];
    const jobWords = ['hiring', 'job', 'career', 'remote', 'salary', 'interview', 'engineer', 'developer', 'layoff'];

    hotWords.forEach(w => { if (title.includes(w)) hot += 3; });
    aiWords.forEach(w => { if (title.includes(w)) ai += 3; });
    jobWords.forEach(w => { if (title.includes(w)) jobs += 3; });
    if (item.type === 'job') jobs += 8;

    return computeScores({ hot: Math.min(10, hot), ai: Math.min(10, ai), jobs: Math.min(10, jobs) });
  }

  // --- HIGH-LEVEL API ---
  async function classifyStories(items, apiKey) {
    if (apiKey) {
      return classifyBatch(items, apiKey);
    }

    // Try backend serverless endpoint (if deployed with GROQ_API_KEY)
    try {
      const backendRes = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stories: items.slice(0, 30) }),
      });
      if (backendRes.ok) {
        const data = await backendRes.json();
        if (data && Array.isArray(data.classified)) {
          return data.classified;
        }
      }
    } catch (_) {
      // Backend not available (e.g. GitHub Pages) — continue to fallback
    }

    // Fallback to keyword-based
    return items.map(item => ({
      ...item,
      _scores: fallbackScore(item),
    }));
  }

  function filterByCategory(classifiedItems, categoryId) {
    if (categoryId === 'all') {
      return classifiedItems
        .filter(i => i._scores && i._scores.isRelevant)
        .sort((a, b) => b._scores.totalRelevance - a._scores.totalRelevance);
    }
    return classifiedItems
      .filter(i => i._scores && i._scores[categoryId] >= 4)
      .sort((a, b) => b._scores[categoryId] - a._scores[categoryId]);
  }

  function getMyFeed(classifiedItems) {
    return classifiedItems
      .filter(i => i._scores && i._scores.isRelevant)
      .sort((a, b) => b._scores.totalRelevance - a._scores.totalRelevance);
  }

  // --- PUBLIC API ---
  return {
    CATEGORIES,
    classifyStories,
    filterByCategory,
    getMyFeed,
    getApiKey,
    setApiKey,
    hasApiKey,
  };

})();
