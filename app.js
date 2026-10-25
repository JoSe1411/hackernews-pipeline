/* ============================================
   HACKPIPE — App Logic
   Hacker News Firebase API Pipeline
   + AI-Powered Relevance Classification
   ============================================ */

(function () {
  'use strict';

  // --- CONFIG ---
  const API_BASE = 'https://hacker-news.firebaseio.com/v0';
  const STORIES_PER_PAGE = 20;
  const ACCENT_COLORS = ['yellow', 'orange', 'pink', 'blue', 'green', 'purple', 'lime', 'red'];

  const FEED_ENDPOINTS = {
    top:  'topstories',
    new:  'newstories',
    best: 'beststories',
    ask:  'askstories',
    show: 'showstories',
    job:  'jobstories',
  };

  // --- STATE ---
  let currentFeed = 'myfeed';   // Default to MY FEED
  let currentFilter = 'all';     // Relevance filter
  let storyIds = [];
  let allLoadedItems = [];       // All fetched items (for filtering)
  let classifiedItems = [];      // Items after AI classification
  let loadedCount = 0;
  let isLoading = false;
  let isClassifying = false;

  // --- DOM REFS ---
  const grid = document.getElementById('stories-grid');
  const loader = document.getElementById('loader');
  const loadMoreContainer = document.getElementById('load-more-container');
  const btnLoadMore = document.getElementById('btn-load-more');
  const marqueeTrack = document.getElementById('marquee-track');
  const statTotal = document.getElementById('stat-total');
  const statTime = document.getElementById('stat-time');
  const statStatus = document.getElementById('stat-status');
  const statAi = document.getElementById('stat-ai');
  const scrollTopBtn = document.getElementById('scroll-top-btn');
  const navTabs = document.querySelectorAll('.nav-tab');
  const filterChips = document.querySelectorAll('.filter-chip');
  const filterBar = document.getElementById('filter-bar');
  const aiStatusBar = document.getElementById('ai-status-bar');
  const aiStatusText = document.getElementById('ai-status-text');
  const apiModal = document.getElementById('api-modal');
  const apiKeyInput = document.getElementById('api-key-input');
  const btnSaveKey = document.getElementById('btn-save-key');
  const btnSkipKey = document.getElementById('btn-skip-key');
  const btnAiSettings = document.getElementById('btn-ai-settings');

  // Filter count elements
  const countHot = document.getElementById('count-hot');
  const countAi = document.getElementById('count-ai');
  const countJobs = document.getElementById('count-jobs');

  // --- UTILITIES ---
  function timeAgo(unixTime) {
    const seconds = Math.floor(Date.now() / 1000) - unixTime;
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function extractDomain(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  function getAccentColor(index) {
    return ACCENT_COLORS[index % ACCENT_COLORS.length];
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function stripHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  function getStoryType(item) {
    if (item.type === 'job') return 'job';
    if (item.title && item.title.startsWith('Ask HN')) return 'ask';
    if (item.title && item.title.startsWith('Show HN')) return 'show';
    return 'story';
  }

  function now() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  // --- API ---
  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function fetchStoryIds(feed) {
    return fetchJson(`${API_BASE}/${FEED_ENDPOINTS[feed]}.json`);
  }

  async function fetchItem(id) {
    return fetchJson(`${API_BASE}/item/${id}.json`);
  }

  // --- RENDERING ---
  function createStoryCard(item, index, globalIndex) {
    const color = getAccentColor(globalIndex);
    const domain = extractDomain(item.url);
    const type = getStoryType(item);
    const isFeatured = globalIndex === 0;
    const textPreview = item.text ? stripHtml(item.text) : '';
    const scores = item._scores;

    const card = document.createElement('article');
    card.className = `story-card${isFeatured ? ' featured' : ''}`;
    card.style.animationDelay = `${index * 0.06}s`;
    card.id = `story-${item.id}`;

    // Build relevance badges HTML
    let badgesHtml = '';
    if (scores && scores.isRelevant) {
      const badges = [];
      if (scores.hot >= 4) badges.push(`<span class="relevance-tag relevance-tag--hot">🔥 HOT <span class="relevance-score">${scores.hot}/10</span></span>`);
      if (scores.ai >= 4) badges.push(`<span class="relevance-tag relevance-tag--ai">🤖 AI <span class="relevance-score">${scores.ai}/10</span></span>`);
      if (scores.jobs >= 4) badges.push(`<span class="relevance-tag relevance-tag--jobs">💼 JOBS <span class="relevance-score">${scores.jobs}/10</span></span>`);
      if (badges.length > 0) {
        badgesHtml = `<div class="relevance-badges">${badges.join('')}</div>`;
      }
    }

    // Build relevance meter HTML
    let meterHtml = '';
    if (scores && scores.totalRelevance > 0) {
      const topCat = scores.topCategory || 'hot';
      const pct = Math.min(100, (scores.totalRelevance / 30) * 100);
      meterHtml = `
        <div class="relevance-meter">
          <div class="relevance-meter-track">
            <div class="relevance-meter-fill relevance-meter-fill--${topCat}" style="width:${pct}%"></div>
          </div>
        </div>`;
    }

    card.innerHTML = `
      <div class="card-color-bar card-color-bar--${color}"></div>
      <div class="card-header">
        <div class="card-rank">${globalIndex + 1}</div>
        <h2 class="card-title">
          <a href="${item.url || `https://news.ycombinator.com/item?id=${item.id}`}" target="_blank" rel="noopener">
            ${escapeHtml(item.title)}
          </a>
        </h2>
        <span class="type-badge type-badge--${type}">${type}</span>
      </div>
      ${badgesHtml}
      ${domain ? `
        <div class="card-domain">
          <a class="card-domain-tag" href="https://${domain}" target="_blank" rel="noopener">${escapeHtml(domain)}</a>
        </div>
      ` : ''}
      ${textPreview ? `
        <div class="card-body">
          <p class="card-text-preview">${escapeHtml(textPreview)}</p>
        </div>
      ` : ''}
      ${meterHtml}
      <div class="card-footer">
        <div class="card-meta">
          ${item.score != null ? `
            <span class="meta-item">
              <span class="meta-icon">▲</span>
              <span>${item.score}</span>
            </span>
          ` : ''}
          ${item.descendants != null ? `
            <span class="meta-item">
              <span class="meta-icon">💬</span>
              <span>${item.descendants}</span>
            </span>
          ` : ''}
          <span class="meta-item">
            <span class="meta-icon">🕐</span>
            <span>${timeAgo(item.time)}</span>
          </span>
        </div>
        <div class="card-actions">
          ${item.by ? `
            <span class="card-author">by <a href="https://news.ycombinator.com/user?id=${encodeURIComponent(item.by)}" target="_blank" rel="noopener">${escapeHtml(item.by)}</a></span>
          ` : ''}
          <a class="btn-card-action" href="https://news.ycombinator.com/item?id=${item.id}" target="_blank" rel="noopener">HN ↗</a>
        </div>
      </div>
    `;

    return card;
  }

  function renderStories(items) {
    grid.innerHTML = '';
    if (items.length === 0) {
      showNoRelevant();
      return;
    }
    items.forEach((item, i) => {
      const card = createStoryCard(item, i, i);
      grid.appendChild(card);
    });
  }

  function showLoader() {
    loader.classList.remove('hidden');
    loader.style.display = '';
  }

  function hideLoader() {
    loader.classList.add('hidden');
    loader.style.display = 'none';
  }

  function showAiStatus(msg) {
    aiStatusBar.style.display = '';
    aiStatusText.textContent = msg;
  }

  function hideAiStatus() {
    aiStatusBar.style.display = 'none';
  }

  function showError(message) {
    grid.innerHTML = '';
    loadMoreContainer.style.display = 'none';

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-container';
    errorDiv.innerHTML = `
      <div class="error-box">
        <div class="error-icon">⚠️</div>
        <h2 class="error-title">PIPELINE ERROR</h2>
        <p class="error-msg">${escapeHtml(message)}</p>
        <button class="btn-retry" id="btn-retry">RETRY</button>
      </div>
    `;
    grid.appendChild(errorDiv);
    document.getElementById('btn-retry').addEventListener('click', () => loadFeed(currentFeed));
  }

  function showNoRelevant() {
    grid.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'no-relevant';
    div.innerHTML = `
      <div class="no-relevant-box">
        <div class="no-relevant-icon">🔍</div>
        <h3 class="no-relevant-title">No matching stories</h3>
        <p class="no-relevant-text">No stories matched this filter. Try "ALL RELEVANT" or switch feeds.</p>
      </div>
    `;
    grid.appendChild(div);
  }

  function showEmpty() {
    grid.innerHTML = '';
    loadMoreContainer.style.display = 'none';
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    emptyDiv.innerHTML = `
      <div class="empty-box">
        <div class="empty-icon">📭</div>
        <p class="empty-text">No stories found in this feed.</p>
      </div>
    `;
    grid.appendChild(emptyDiv);
  }

  function updateStats(total) {
    statTotal.textContent = total;
    statTime.textContent = now();
    statStatus.textContent = 'LIVE';
  }

  function updateAiPill() {
    statAi.textContent = Classifier.hasApiKey() ? 'ON' : 'OFF';
  }

  function updateFilterCounts(items) {
    const hotCount = items.filter(i => i._scores && i._scores.hot >= 4).length;
    const aiCount = items.filter(i => i._scores && i._scores.ai >= 4).length;
    const jobsCount = items.filter(i => i._scores && i._scores.jobs >= 4).length;

    countHot.textContent = hotCount;
    countAi.textContent = aiCount;
    countJobs.textContent = jobsCount;
  }

  function updateMarquee(items) {
    const headlines = items
      .filter(i => i && i.title)
      .slice(0, 10)
      .map(i => {
        const cat = i._scores?.topCategory;
        const icon = cat === 'hot' ? '🔥' : cat === 'ai' ? '🤖' : cat === 'jobs' ? '💼' : '⚡';
        return `${icon} ${i.title}`;
      })
      .join('   ');

    const doubled = headlines + '   ' + headlines;
    marqueeTrack.innerHTML = `<span class="marquee-text">${escapeHtml(doubled)}</span>`;
  }

  function applyFilter() {
    let filtered;

    if (currentFeed === 'myfeed') {
      // In MY FEED, use the classifier's filter
      if (currentFilter === 'all') {
        filtered = Classifier.getMyFeed(classifiedItems);
      } else {
        filtered = Classifier.filterByCategory(classifiedItems, currentFilter);
      }
    } else {
      // In regular feeds, filter from classified items
      if (currentFilter === 'all') {
        filtered = classifiedItems;
      } else {
        filtered = Classifier.filterByCategory(classifiedItems, currentFilter);
        // If no filter matches, show all
        if (filtered.length === 0 && classifiedItems.length > 0) {
          renderStories([]);
          return;
        }
      }
    }

    renderStories(filtered);
    loadMoreContainer.style.display = 'none';
  }

  // --- MODAL ---
  function showModal() {
    apiModal.style.display = '';
    apiKeyInput.value = Classifier.getApiKey();
    apiKeyInput.focus();
  }

  function hideModal() {
    apiModal.style.display = 'none';
  }

  // --- LOAD FEED ---
  async function loadFeed(feed) {
    if (isLoading) return;
    isLoading = true;

    // For MY FEED, fetch from top stories
    const apiFeed = feed === 'myfeed' ? 'top' : feed;
    currentFeed = feed;
    loadedCount = 0;
    allLoadedItems = [];
    classifiedItems = [];

    // Reset UI
    grid.innerHTML = '';
    loadMoreContainer.style.display = 'none';
    showLoader();
    statStatus.textContent = 'SYNC';

    // Show/hide filter bar based on feed
    filterBar.style.display = (feed === 'myfeed') ? '' : '';

    // Update active tab
    navTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.feed === feed);
    });

    try {
      storyIds = await fetchStoryIds(apiFeed);

      if (!storyIds || storyIds.length === 0) {
        hideLoader();
        showEmpty();
        isLoading = false;
        return;
      }

      updateStats(storyIds.length);

      // For MY FEED, load more stories initially for better classification
      const batchSize = feed === 'myfeed' ? 40 : STORIES_PER_PAGE;
      await loadBatch(batchSize);

      hideLoader();
      isLoading = false;
    } catch (err) {
      hideLoader();
      showError(err.message || 'Failed to fetch stories');
      statStatus.textContent = 'ERR';
      isLoading = false;
    }
  }

  async function loadBatch(count) {
    const start = loadedCount;
    const end = Math.min(start + count, storyIds.length);
    const batch = storyIds.slice(start, end);

    const items = await Promise.all(batch.map(id => fetchItem(id)));
    const validItems = items.filter(Boolean);

    allLoadedItems = allLoadedItems.concat(validItems);
    loadedCount = end;

    // AI Classification
    await classifyAndRender(allLoadedItems);

    // Show/hide load more
    if (loadedCount < storyIds.length) {
      loadMoreContainer.style.display = '';
      btnLoadMore.textContent = `LOAD MORE STORIES ↓ (${storyIds.length - loadedCount} remaining)`;
      btnLoadMore.classList.remove('loading');
    } else {
      loadMoreContainer.style.display = 'none';
    }
  }

  async function classifyAndRender(items) {
    const apiKey = Classifier.getApiKey();

    if (apiKey) {
      showAiStatus(`Classifying ${items.length} stories with Groq Llama 3.1...`);
      isClassifying = true;
    }

    try {
      classifiedItems = await Classifier.classifyStories(items, apiKey);
    } catch (err) {
      if (err.message === 'INVALID_API_KEY') {
        showAiStatus('⚠️ Invalid API key — falling back to keyword classification');
        Classifier.setApiKey('');
        updateAiPill();
        classifiedItems = await Classifier.classifyStories(items, '');
      } else if (err.message === 'RATE_LIMITED') {
        showAiStatus('⚠️ Rate limited — falling back to keyword classification');
        classifiedItems = await Classifier.classifyStories(items, '');
      } else {
        console.warn('Classification error:', err);
        classifiedItems = await Classifier.classifyStories(items, '');
      }
    }

    isClassifying = false;
    hideAiStatus();

    // Update filter counts
    updateFilterCounts(classifiedItems);

    // Update marquee with classified headlines
    const topStories = Classifier.getMyFeed(classifiedItems).slice(0, 10);
    if (topStories.length > 0) {
      updateMarquee(topStories);
    } else {
      updateMarquee(classifiedItems.slice(0, 10));
    }

    // Apply current filter
    applyFilter();
  }

  // --- EVENT LISTENERS ---

  // Tab navigation
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const feed = tab.dataset.feed;
      if (feed !== currentFeed || !isLoading) {
        // Reset filter when switching feeds
        currentFilter = 'all';
        filterChips.forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));

        loadFeed(feed);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });

  // Filter chips
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      currentFilter = chip.dataset.filter;
      filterChips.forEach(c => c.classList.toggle('active', c === chip));
      applyFilter();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Load more
  btnLoadMore.addEventListener('click', async () => {
    if (isLoading) return;
    isLoading = true;
    btnLoadMore.textContent = 'LOADING...';
    btnLoadMore.classList.add('loading');
    await loadBatch(STORIES_PER_PAGE);
    isLoading = false;
  });

  // Scroll to top
  window.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('visible', window.scrollY > 400);
  });

  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // AI settings button
  btnAiSettings.addEventListener('click', () => {
    showModal();
  });

  // Modal: Save key
  btnSaveKey.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      apiKeyInput.style.boxShadow = '5px 5px 0px var(--red)';
      return;
    }
    Classifier.setApiKey(key);
    updateAiPill();
    hideModal();

    // Re-classify current items with AI
    if (allLoadedItems.length > 0) {
      classifyAndRender(allLoadedItems);
    } else {
      loadFeed(currentFeed);
    }
  });

  // Modal: Skip
  btnSkipKey.addEventListener('click', () => {
    hideModal();
    updateAiPill();
    // If this is the first load, start loading
    if (allLoadedItems.length === 0) {
      loadFeed(currentFeed);
    }
  });

  // Enter key in input
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSaveKey.click();
  });

  // --- INIT ---
  updateAiPill();

  if (!Classifier.hasApiKey()) {
    // Show modal on first visit
    showModal();
  } else {
    // Start loading
    loadFeed('myfeed');
  }

  // Auto-refresh every 5 minutes
  setInterval(() => {
    loadFeed(currentFeed);
  }, 5 * 60 * 1000);

})();
