# OpenFARS: Open Source Fully Automated Research System

This is an open-source implementation of FARS (Fully Automated Research System), inspired by [Analemma's FARS](https://analemma.ai/fars).

FARS is designed to autonomously perform the complete research workflow—including ideation, planning, experimentation, and paper writing—without human intervention during execution.

## Features

- **Ideation Agent**: Generates novel research hypotheses.
- **Planning Agent**: Creates detailed experiment plans.
- **Experiment Agent**: Executes experiments (currently simulated).
- **Writing Agent**: Drafts research papers based on results.
- **Shared Workspace**: A persistent file system for agent collaboration.

## Getting Started

### Prerequisites

- Python 3.8+
- OpenAI API Key (for LLM capabilities)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/openfars/openfars.git
   cd openfars
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set up your OpenAI API key:
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

### Usage

Run the system with a specific research topic:

```bash
python run.py --topics "Reinforcement Learning" "Large Language Models"
```

The system will generate a project ID and store all artifacts (plans, code, results, paper) in the `workspace/` directory.

## Web Frontend (GitHub Pages)

OpenFARS includes a browser-based frontend that runs entirely client-side — no server needed. It calls the OpenAI API directly from your browser.

### Quick Start (Local)

Open `docs/index.html` in your browser, or serve it locally:

```bash
cd docs && python3 -m http.server 8000
# Open http://localhost:8000
```

1. Go to **Settings** and enter your OpenAI API key
2. Click **New Research**, enter topics, and click **Start Automated Research**
3. Watch the 4-stage pipeline run in real time
4. Download the generated paper

### Deploy to GitHub Pages

1. Go to your repo **Settings > Pages**
2. Set source to **Deploy from a branch**
3. Select `main` branch and `/docs` folder
4. Save — your site will be live at `https://<user>.github.io/openfars/`

### Frontend Features

- **Full research pipeline** — Ideation, Planning, Experiment, Writing (all 4 agents)
- **Custom API provider** — Change the base URL to use any OpenAI-compatible API
- **Custom agent prompts** — Edit the system prompt for each agent in Settings
- **Model selection** — GPT-4o, GPT-4o Mini, GPT-4.1 family
- **Project dashboard** — View, re-run, or delete past projects
- **Data export/import** — Back up all projects as JSON
- **Download papers** — Export as `.md` or `.txt`
- **Fully client-side** — Your API key never leaves your browser

## Project Structure

- `src/core`: Core configuration and shared workspace logic.
- `src/agents`: Implementation of the four specialized agents.
- `src/main.py`: Main orchestrator script.
- `workspace/`: Directory where research projects are stored.
- `docs/`: Web frontend (GitHub Pages).
  - `index.html`: Main page structure.
  - `style.css`: All styles (edit CSS variables to re-theme).
  - `app.js`: All application logic (agents, storage, UI).

## License

MIT License
