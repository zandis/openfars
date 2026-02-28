"""
Multi-provider AI agents — supports OpenAI, Anthropic Claude, and custom endpoints.
Same 4-stage pipeline as the original Python CLI, with added biomedical focus.
"""

import json
import httpx

# Default system prompts (biomedical-focused)
DEFAULT_PROMPTS = {
    "ideation": (
        "You are an expert biomedical researcher with deep knowledge of molecular biology, "
        "genomics, clinical trials, drug discovery, and computational biology. You generate "
        "novel, testable research hypotheses grounded in current literature."
    ),
    "planning": (
        "You are a senior biomedical research engineer. You create detailed, reproducible "
        "experiment plans including statistical methods, sample sizes, controls, and "
        "bioinformatics pipelines."
    ),
    "experiment": (
        "You are a computational biologist who writes analysis code in R and Python. "
        "You generate realistic experiment code with proper statistical tests, "
        "data processing pipelines, and visualization scripts."
    ),
    "writing": (
        "You are a biomedical academic writer following IMRAD format. Write clear, "
        "publication-ready research papers with proper citations style, statistical "
        "reporting, and scientific rigor."
    ),
}


async def call_openai(api_key: str, model: str, system_prompt: str, user_prompt: str, api_base: str = ""):
    """Call OpenAI-compatible API."""
    base = (api_base or "https://api.openai.com/v1").rstrip("/")
    url = f"{base}/chat/completions"

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.7,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def call_anthropic(api_key: str, model: str, system_prompt: str, user_prompt: str, api_base: str = ""):
    """Call Anthropic Claude API."""
    base = (api_base or "https://api.anthropic.com").rstrip("/")
    url = f"{base}/v1/messages"

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            url,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["content"][0]["text"]


async def call_llm(provider: str, api_key: str, model: str, system_prompt: str, user_prompt: str, api_base: str = ""):
    """Unified LLM call dispatcher."""
    if provider == "anthropic":
        return await call_anthropic(api_key, model, system_prompt, user_prompt, api_base)
    else:
        # Default to OpenAI-compatible
        return await call_openai(api_key, model, system_prompt, user_prompt, api_base)


def _parse_json_response(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code fences."""
    clean = text.strip()
    if "```" in clean:
        # Extract content between code fences
        parts = clean.split("```")
        for part in parts[1::2]:  # odd-indexed parts are inside fences
            inner = part.strip()
            if inner.startswith("json"):
                inner = inner[4:].strip()
            try:
                return json.loads(inner)
            except json.JSONDecodeError:
                continue
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        return {"_raw": text}


# ---- Stage 1: Ideation ----
async def run_ideation(provider, api_key, model, topics, custom_prompt="", api_base=""):
    system = custom_prompt or DEFAULT_PROMPTS["ideation"]
    user = f"""Based on the following research topics: {', '.join(topics)}

Generate a novel research hypothesis for a biomedical research paper.
Provide the output in JSON format with the following fields:
- title: Title of the proposed paper
- hypothesis: The core hypothesis
- motivation: Why this is important (include relevance to human health)
- methodology_sketch: Brief description of experimental and computational methods
- key_references: 3-5 relevant reference descriptions"""

    response = await call_llm(provider, api_key, model, system, user, api_base)
    return _parse_json_response(response)


# ---- Stage 2: Planning ----
async def run_planning(provider, api_key, model, idea, custom_prompt="", api_base=""):
    system = custom_prompt or DEFAULT_PROMPTS["planning"]
    user = f"""Given the following research idea:
Title: {idea.get('title', '')}
Hypothesis: {idea.get('hypothesis', '')}
Methodology: {idea.get('methodology_sketch', '')}

Create a detailed experiment plan for this biomedical research.
Provide the output in JSON format with:
- steps: List of detailed steps to execute (include data collection, preprocessing, analysis)
- requirements: List of required tools, libraries, datasets, and databases
- metrics: Metrics to evaluate success (statistical tests, p-value thresholds, effect sizes)
- timeline: Estimated timeline for each phase
- r_packages: List of R packages needed for analysis
- python_packages: List of Python packages needed"""

    response = await call_llm(provider, api_key, model, system, user, api_base)
    return _parse_json_response(response)


# ---- Stage 3: Experiment ----
async def run_experiment(provider, api_key, model, plan, custom_prompt="", api_base=""):
    system = custom_prompt or DEFAULT_PROMPTS["experiment"]
    user = f"""Given this experiment plan:
Steps: {json.dumps(plan.get('steps', []))}
Requirements: {json.dumps(plan.get('requirements', []))}
Metrics: {json.dumps(plan.get('metrics', []))}
R packages: {json.dumps(plan.get('r_packages', []))}

For each step, generate implementation code (R or Python as appropriate).
Then provide simulated but realistic results with proper statistical values.

Return JSON with:
- code: object mapping step name to code string (indicate language with comment)
- results: object with metric names as keys and realistic values (include p-values, confidence intervals)
- figures: list of descriptions of figures that would be generated
- success: boolean"""

    response = await call_llm(provider, api_key, model, system, user, api_base)
    return _parse_json_response(response)


# ---- Stage 4: Writing ----
async def run_writing(provider, api_key, model, idea, plan, results, custom_prompt="", api_base=""):
    system = custom_prompt or DEFAULT_PROMPTS["writing"]
    user = f"""Write a research paper based on the following:

Title: {idea.get('title', '')}
Hypothesis: {idea.get('hypothesis', '')}

Experiment Plan:
{json.dumps(plan, indent=2)}

Results:
{json.dumps(results, indent=2)}

The paper should follow IMRAD format and include:
- Abstract
- Introduction (with background and significance)
- Methods (detailed and reproducible)
- Results (with statistical reporting)
- Discussion (including limitations and future directions)
- References

Format the paper in Markdown. Use proper scientific writing style."""

    return await call_llm(provider, api_key, model, system, user, api_base)
