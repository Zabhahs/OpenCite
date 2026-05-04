# OpenCITE

A free, open-access scholarly meta-search. Returns top results from multiple databases — DOAJ, OpenAlex, Crossref, Europeana, your own curated journals list, and (optionally) Semantic Scholar — with MLA 9 and APA 7 citations ready to copy.

Zero AI tokens. Each database is queried directly via its public API. Built to be self-hostable and extensible.

> *"The only good is knowledge, Sekhandur. The only evil is ignorance."*

---

## Sources

| Source | Coverage | Auth |
|---|---|---|
| **DOAJ** | 15,000+ peer-reviewed open-access journals, all disciplines | None |
| **OpenAlex** | 250M+ scholarly works, OA-filtered | **Free key required** (since Feb 2026) |
| **Crossref** | 130M+ records — DOI authority | Optional email (polite pool) |
| **Europeana** | Cultural heritage, museums, primary sources | Free key required |
| **Curated Journals** | User-defined list of trusted journals (uses OpenAlex backend) | Uses OpenAlex key |
| **Semantic Scholar** | AI-curated, cross-disciplinary | Free key (optional, slow approval) |
| **JSTOR** | Launcher (uses your own login, opens in new tab) | Your JSTOR account |

---

## Deploying to Vercel (no terminal required)

### 1. Create the GitHub repo

1. Go to [github.com/new](https://github.com/new), name it whatever you like.
2. **Don't** initialize with a README (you have one here).
3. Once created, press the `.` (period) key on the repo page. This opens **github.dev**, a full VS Code editor in your browser.

### 2. Paste the files

In github.dev, recreate this folder structure:

```
opencite/
├── .gitignore
├── README.md
├── index.html
├── package.json
├── vite.config.js
├── public/
│   ├── favicon.svg
│   ├── opencite-linkedin-qr.jpeg
│   └── robots.txt
└── src/
    ├── App.jsx
    └── main.jsx
```

For each file: right-click in the file tree → New File → type the path → paste the contents from this project. For the QR image, drag-and-drop the file into the `public/` folder in github.dev.

When all files are in place, click the Source Control icon (left sidebar), write a commit message, click the checkmark to commit & push.

### 3. Deploy with Vercel

1. Go to [vercel.com](https://vercel.com), sign in with GitHub.
2. Click "Add New" → "Project".
3. Pick your repo, click "Import".
4. Vercel auto-detects Vite. Don't change any settings. Click "Deploy".
5. ~60 seconds later, you have a live URL.

---

## Customizing

### Change the curated journals list

Two ways:

**Per-user (recommended):** Each visitor manages their own list via the ⚙ settings panel in the app. Lists save to their browser's `localStorage`.

**Default list (for your deployment):** Edit `DEFAULT_CURATED_JOURNALS` near the top of `src/App.jsx`. This sets the starting list every new visitor sees.

```js
const DEFAULT_CURATED_JOURNALS = [
  { name: "Journal Name", issn: "1234-5678" },
  // ...
];
```

### Add a new database source

Each database is a self-contained adapter in `src/App.jsx`. To add one:

1. Write a new adapter object following the shape of the existing ones.
2. Push it into the `ADAPTERS` array.
3. The UI auto-renders a section for it.

Each adapter exports `{ id, name, tagline, color, search }` and optionally `{ needsKey, keyName, keyLabel, keyHelp }` if it requires a user-supplied API key.

### Replace the LinkedIn connect card

The collapsible "Connect with the maker" card lives near the bottom of `src/App.jsx`. Edit the URL, copy text, and replace `public/opencite-linkedin-qr.jpeg` with your own QR.

### Custom domain

In Vercel: Project → Settings → Domains → Add. Point your domain's DNS to Vercel.

---

## Tech notes

- **Tailwind**: loaded via CDN (`cdn.tailwindcss.com`) in `index.html`. Fine for personal/light traffic; for high-traffic deployments, swap to a proper Tailwind install with PostCSS.
- **Storage**: browser `localStorage`. Settings are per-device, never sent to any server.
- **APIs**: DOAJ and Crossref are keyless. OpenAlex requires a free key as of February 2026 — register at [openalex.org/settings/api](https://openalex.org/settings/api). $1/day in free credits is plenty for personal use. Europeana requires a free key from [api.europeana.eu](https://api.europeana.eu/api/v2/apikey.html). Semantic Scholar is optional — request a key from [semanticscholar.org/product/api](https://www.semanticscholar.org/product/api#api-key-form).
- **JSTOR**: launcher only — opens search in a new tab using the user's existing login.

---

## Local development (optional)

If you want to edit on your machine:

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
npm install
npm run dev
```

Open the URL it prints (usually `localhost:5173`).

---

Built by [Shahbaz Yusuf](https://www.linkedin.com/in/shahbaz-yusuf/).
