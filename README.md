# OpenFARS: Biomedical Research Platform

An open-source automated research platform for biomedical sciences. Combines AI agents (OpenAI + Claude), R statistical computing, biomedical database APIs, and a modern web interface.

Inspired by [Analemma's FARS](https://analemma.ai/fars).

## Features

- **4-Stage Research Pipeline** — Ideation, Planning, Experiment, Writing (fully automated)
- **Multi-AI Support** — OpenAI (GPT-4o, 4.1) and Anthropic Claude (Sonnet, Opus, Haiku)
- **R Console** — Interactive R code execution with plot rendering
- **Biomedical APIs** — PubMed, UniProt, ClinicalTrials.gov, NCBI Gene, Europe PMC
- **Data Manager** — Upload CSV, FASTA, PDB, and other research data
- **Package Manager** — Install R (CRAN/Bioconductor) and Python packages
- **Password Auth** — JWT-based multi-user authentication
- **Beautiful UI** — Modern sidebar-based web interface
- **Google Drive** — Framework for OAuth integration (configurable)

## Quick Start

### Option 1: Replit (Recommended)

1. Import this repo into [Replit](https://replit.com)
2. Click **Run** — the server starts automatically
3. Register an account in the web UI
4. Go to **AI Models** and add your OpenAI or Claude API key
5. Click **New Research** and start a project

### Option 2: Local

```bash
# Clone and install
git clone https://github.com/openfars/openfars.git
cd openfars
pip install -r server/requirements.txt

# Run the server
python run_server.py
# Open http://localhost:8000
```

### Option 3: Docker

```bash
docker build -t openfars .
docker run -p 8000:8000 -e OPENFARS_SECRET=your-secret openfars
```

### Option 4: CLI only (original)

```bash
pip install -r requirements.txt
export OPENAI_API_KEY="sk-..."
python run.py --topics "CRISPR gene therapy" "cancer biomarkers"
```

## Web Interface Guide

### Dashboard
Overview of all projects, completion stats, and R engine status.

### New Research
Configure topics, select AI provider (OpenAI/Claude) and model, then launch the 4-stage pipeline. Watch each stage complete in real time.

### R Console
Write and execute R code directly in the browser. Output and plots render inline. Ctrl+Enter to run. Full history saved.

### Bio Search
Search 5 biomedical databases:
- **PubMed** — Literature search (articles, authors, journals)
- **UniProt** — Protein database (sequences, gene names, organisms)
- **ClinicalTrials.gov** — Clinical trial search (status, phase, dates)
- **NCBI Gene** — Gene information (names, chromosomes, organisms)
- **Europe PMC** — Open access literature with citation counts

### Data Manager
Drag-and-drop file upload. Supports CSV, TSV, FASTA, PDB, JSON, Excel, and more.

### AI Models
Add and manage API keys for OpenAI, Anthropic Claude, or any OpenAI-compatible endpoint. Test connectivity before saving.

### Packages
Install R packages (CRAN/Bioconductor) and Python packages (pip) directly from the UI.

### Settings
- Change password
- Customize agent system prompts for each pipeline stage
- Add NCBI API key for higher rate limits
- Google Drive OAuth configuration

## Project Structure

```
openfars/
├── docs/                    # Frontend SPA (served by FastAPI)
│   ├── index.html           # All views: login, dashboard, R console, bio search, etc.
│   ├── style.css            # Full styles (edit :root variables to re-theme)
│   └── app.js               # All frontend logic (API client, auth, views)
├── server/                  # FastAPI backend
│   ├── app.py               # Main app with all API routes
│   ├── auth.py              # JWT password authentication
│   ├── agents.py            # Multi-provider AI agents (OpenAI + Claude)
│   ├── biomedical.py        # PubMed, UniProt, ClinicalTrials, Gene, Europe PMC
│   ├── r_engine.py          # R code execution via subprocess
│   ├── database.py          # SQLite database (users, projects, files, keys)
│   └── requirements.txt     # Backend Python dependencies
├── src/                     # Original CLI agents (still works)
├── run_server.py            # Web server entry point
├── run.py                   # CLI entry point
├── Dockerfile               # Docker deployment
├── .replit                  # Replit configuration
└── replit.nix               # Nix packages (R, Python)
```

## How to Modify

**Re-theme the UI:** Edit CSS variables in `docs/style.css` `:root` block.

**Add a new AI provider:** Add a `call_xxx()` function in `server/agents.py` and add it to the `call_llm()` dispatcher.

**Add a new biomedical API:** Add a function in `server/biomedical.py`, add a route in `server/app.py`, and add the database option in `docs/index.html`.

**Change agent prompts:** Edit `DEFAULT_PROMPTS` in `server/agents.py` or customize per-user in Settings.

**Add a new frontend view:** Add a `<section>` in `index.html`, a nav item in the sidebar, a CSS section in `style.css`, and a JS module in `app.js`.

## License

MIT License
