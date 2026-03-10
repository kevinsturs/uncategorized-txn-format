# Transaction Cleaner

A Next.js web app that cleans crypto transaction CSV exports.

## What it does

- Removes 20 noise columns automatically
- Strips ID suffixes from currency tickers (e.g. `USDC;3054` → `USDC`)
- Sorts transactions by Net Value (largest → smallest)
- Hides rows below $100
- Adds a yellow "Client Comment" column A
- Downloads a clean `.xlsx` file instantly

## Deploy to Vercel (3 steps)

### Option A — Vercel CLI (fastest)

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. From this folder, run:
vercel

# 3. Follow the prompts — Vercel auto-detects Next.js
#    Your app will be live at https://your-app.vercel.app
```

### Option B — GitHub + Vercel Dashboard

1. Push this folder to a GitHub repo
2. Go to https://vercel.com/new
3. Import your repo → click **Deploy**

No environment variables needed. No configuration required.

## Local development

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Tech stack

- Next.js 14 (App Router)
- SheetJS (xlsx) loaded from CDN for XLSX generation
- No backend — fully client-side processing
