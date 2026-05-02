# The Stacks

A meta-search across free, open-access scholarly databases. Returns top results from DOAJ, OpenAlex, Semantic Scholar, Europeana, and a configurable list of curated journals — with MLA 9 and APA 7 citations ready to copy.

Zero AI tokens. Each database is queried directly via its public API.

---

## Deploying to Vercel (no terminal required)

### 1. Create the GitHub repo

1. Go to [github.com/new](https://github.com/new), name it `the-stacks` (or whatever you like), keep it public or private — both work for Vercel.
2. **Don't** initialize with a README (you have one here).
3. Once created, press the `.` (period) key on the repo page. This opens **github.dev**, a full VS Code editor in your browser.

### 2. Paste the files

In github.dev, recreate this folder structure:

```
the-stacks/
├── .gitignore
├── README.md
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── App.jsx
    └── main.jsx
```

For each file: right-click in the file tree → New File → type the path → paste the contents from this project.

When all files are pasted, click the Source Control icon (left sidebar), write a commit message like "initial commit", click the checkmark to commit & push.

### 3. Deploy with Vercel

1. Go to [vercel.com](https://vercel.com), sign in with GitHub.
2. Click "Add New" → "Project".
3. Pick your `the-stacks` repo, click "Import".
4. Vercel auto-detects Vite. Don't change any settings. Click "Deploy".
5. ~60 seconds later, you have a live URL like `the-stacks-xyz.vercel.app`.

### 4. Link from Squarespace (optional)

In your Squarespace site, add a button or link pointing to the Vercel URL. Done.

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

1. Write a new adapter object following the shape of the existing ones (`DOAJ_ADAPTER`, `OPENALEX_ADAPTER`, etc.).
2. Push it into the `ADAPTERS` array.
3. The UI auto-renders a section for it.

### Custom domain

In Vercel: Project → Settings → Domains → Add. Point your domain's DNS to Vercel.

---

## Tech notes

- **Tailwind**: loaded via CDN (`cdn.tailwindcss.com`) in `index.html`. Fine for personal/light traffic; for high-traffic deployments, swap to a proper Tailwind install with PostCSS.
- **Storage**: browser `localStorage`. Settings are per-device, never sent to any server.
- **APIs**: DOAJ, OpenAlex, Semantic Scholar all keyless. Europeana requires a free key from [api.europeana.eu](https://api.europeana.eu/api/v2/apikey.html).
- **JSTOR**: launcher only — opens search in a new tab using the user's existing JSTOR login.

---

## Local development (optional)

If you want to edit on your machine:

```bash
git clone https://github.com/YOUR_USERNAME/the-stacks.git
cd the-stacks
npm install
npm run dev
```

Open the URL it prints (usually `localhost:5173`).
