# HackPipe ⚡

> Neo-Brutal AI-Powered Hacker News Pipeline

A stunning neo-brutalism styled Hacker News aggregator that uses AI (Groq Llama 3.1) to classify stories based on your priorities:

- 🔥 **Hot & Trending** — Product launches, funding, major company news
- 🤖 **AI Opportunities** — AI tools, LLMs, automation, business opportunities  
- 💼 **Job Opportunities** — Hiring posts, career advice, salary discussions

## Features

- **🎯 MY FEED** — Personalized feed showing only relevant stories, ranked by AI
- **AI Classification** — Groq Llama 3.1 scores each story 0-10 across 3 categories
- **Filter Bar** — Drill into HOT, AI, or JOBS categories with live counts
- **6 HN Feeds** — Top, New, Best, Ask HN, Show HN, Jobs
- **Auto-refresh** — Updates every 5 minutes
- **Keyword Fallback** — Works without an API key using smart keyword matching
- **Fully Responsive** — Works on mobile, tablet, and desktop
- **Zero Dependencies** — Pure HTML, CSS, JavaScript. No frameworks.

## Design

Built with **neo-brutalism** aesthetics:
- Bold 3px black borders & hard-offset box shadows
- Vibrant accent colors (yellow, orange, pink, blue, green, purple)
- Space Grotesk + Space Mono typography
- Aggressive hover states with shadow shifts
- 0px border-radius everywhere

## Setup

1. Clone the repo
2. Open `index.html` in a browser, or serve with any static server:
   ```bash
   npx serve .
   ```
3. (Optional) Enter your free [Groq API key](https://console.groq.com/keys) for AI classification

## Tech Stack

- HTML5
- Vanilla CSS (Neo-Brutalism design system)
- Vanilla JavaScript
- [Hacker News Firebase API](https://github.com/HackerNews/API)
- [Groq Cloud](https://groq.com) (Llama 3.1 8B Instant)

## License

MIT
