# Prism EDA

Prism EDA is a local-first exploratory data analysis workspace for the WebMCP era. Drop a CSV or JSON file, get a first set of views, refine the canvas, and let a browser agent inspect or change the same state through WebMCP.

## What is in the MVP

- CSV and JSON parsing in a Web Worker, with a 25 MB / 250,000 row guardrail.
- Automatic column profiling with nulls, ranges, examples, and deterministic suggestions that avoid identifiers and high-cardinality text.
- Bar, line, area, scatter, and donut views powered by Apache ECharts.
- Local workspace persistence through IndexedDB; source data is not uploaded.
- WebGPU compute for numeric histograms and scatter sampling when the browser supports it, with a CPU fallback.
- A real `document.modelContext.registerTool()` surface with typed dataset, chart, filter, and focus tools.
- An Agent Runtime panel showing capability state and the shared activity trace.

## Run locally

```bash
npm install
npm run dev
```

Open the HTTP URL printed by Vite. WebMCP is an experimental browser API. In Chrome, enable `chrome://flags/#enable-webmcp-testing` and relaunch; ChatGPT's in-app browser supports the WebMCP test flow for the challenge.

## Verify

```bash
npm run typecheck
npm test
npm run build
```

The app has no server routes, no API keys, and no analytics. In-browser local storage may contain the dataset until the user clears site data.

## WebMCP tools

After a dataset is loaded, Prism registers:

`eda_get_status`, `eda_get_dataset_profile`, `eda_list_charts`, `eda_create_chart`, `eda_update_chart`, `eda_set_filter`, `eda_focus_chart`, and `eda_clear_filters`.

The agent should call `eda_get_dataset_profile` first, then use exact column names and chart IDs returned by the read tools. Every mutation is visible in the canvas and activity trace.

## Demo script

1. Click **Try sample dataset**.
2. Show the automatic profile and four suggested views.
3. Change the comparison chart from `revenue` to `orders`, then add a filter.
4. Ask the browser agent to call `eda_get_dataset_profile` and `eda_update_chart`.
5. Point out that the canvas changes and the Agent Runtime trace records the same revision.

## Deploy

Prism is a static Vite app and can be deployed directly to Vercel. The included `vercel.json` handles SPA rewrites. GitHub Actions runs typecheck, tests, and build on pushes and pull requests.
