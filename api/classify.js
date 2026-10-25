// Serverless API route for Vercel / Netlify
// Keeps GROQ_API_KEY safely in backend environment variables

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY environment variable not configured' });
  }

  const { stories } = req.body || {};
  if (!stories || !Array.isArray(stories) || stories.length === 0) {
    return res.status(400).json({ error: 'stories array is required' });
  }

  try {
    const storyList = stories.map((s, idx) => `[${idx}] "${s.title}" (${s.url || 'HN'})`).join('\n');

    const prompt = `You are a tech news relevance classifier. Classify each of these Hacker News stories from 0 to 10 for three specific categories:
1. "hot": What's new and hot in the market (launches, breakthrough products, funding, huge tech news).
2. "ai": Using AI to create better opportunities (AI tools, LLMs, practical applications, automation, indie hacking with AI).
3. "jobs": Job & career opportunities (hiring, careers, tech talent, salaries, job market trends).

Stories to classify:
${storyList}

Respond ONLY with a valid JSON array of objects. No markdown, no commentary. Format:
[{"i":0,"hot":8,"ai":2,"jobs":0},{"i":1,"hot":3,"ai":9,"jobs":1}]`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1500,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return res.status(groqRes.status).json({ error: 'Groq API error', details: errText });
    }

    const groqData = await groqRes.json();
    const content = groqData.choices?.[0]?.message?.content || '[]';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    const scoresMap = {};
    parsed.forEach(p => { scoresMap[p.i] = p; });

    const classified = stories.map((story, i) => {
      const s = scoresMap[i] || { hot: 0, ai: 0, jobs: 0 };
      const hot = Math.max(0, Math.min(10, parseInt(s.hot) || 0));
      const ai = Math.max(0, Math.min(10, parseInt(s.ai) || 0));
      const jobs = Math.max(0, Math.min(10, parseInt(s.jobs) || 0));
      const totalRelevance = hot + ai + jobs;

      let topCategory = null;
      let topScore = 0;
      if (hot >= ai && hot >= jobs && hot >= 4) { topCategory = 'hot'; topScore = hot; }
      else if (ai >= hot && ai >= jobs && ai >= 4) { topCategory = 'ai'; topScore = ai; }
      else if (jobs >= hot && jobs >= ai && jobs >= 4) { topCategory = 'jobs'; topScore = jobs; }

      return {
        ...story,
        _scores: {
          hot, ai, jobs,
          topCategory,
          topScore,
          totalRelevance,
          isRelevant: totalRelevance >= 4,
          source: 'groq-backend',
        },
      };
    });

    return res.status(200).json({ classified });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
