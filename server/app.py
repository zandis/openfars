"""
OpenFARS — Main FastAPI application.
All API routes for auth, projects, AI, R, biomedical, files, packages.
"""

import json
import os
import uuid
import shutil
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from server import database as db
from server import auth
from server import agents
from server import biomedical as bio
from server import r_engine

# ---- Config ----
UPLOAD_DIR = os.environ.get("OPENFARS_UPLOADS", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---- App ----
app = FastAPI(title="OpenFARS", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    db.init_db()


# ---- Auth dependency ----
async def get_current_user(request: Request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(401, "Not authenticated")
    data = auth.decode_token(token)
    if not data:
        raise HTTPException(401, "Invalid or expired token")
    user = db.get_user_by_id(data["user_id"])
    if not user:
        raise HTTPException(401, "User not found")
    return dict(user)


# ============================================================
# AUTH ROUTES
# ============================================================

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@app.post("/api/auth/register")
async def register(req: RegisterRequest):
    if len(req.username) < 2:
        raise HTTPException(400, "Username must be at least 2 characters")
    if len(req.password) < 4:
        raise HTTPException(400, "Password must be at least 4 characters")
    existing = db.get_user_by_username(req.username)
    if existing:
        raise HTTPException(400, "Username already taken")
    pw_hash = auth.hash_password(req.password)
    user_id = db.create_user(req.username, pw_hash)
    token = auth.create_token(user_id, req.username)
    return {"token": token, "user": {"id": user_id, "username": req.username}}


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    user = db.get_user_by_username(req.username)
    if not user or not auth.verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid username or password")
    token = auth.create_token(user["id"], user["username"])
    return {"token": token, "user": {"id": user["id"], "username": user["username"]}}


@app.get("/api/auth/me")
async def get_me(user=Depends(get_current_user)):
    return {"id": user["id"], "username": user["username"]}


@app.post("/api/auth/change-password")
async def change_password(req: ChangePasswordRequest, user=Depends(get_current_user)):
    full_user = db.get_user_by_id(user["id"])
    if not auth.verify_password(req.current_password, full_user["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    new_hash = auth.hash_password(req.new_password)
    db.update_password(user["id"], new_hash)
    return {"ok": True}


# ============================================================
# API KEY ROUTES
# ============================================================

class ApiKeyRequest(BaseModel):
    provider: str
    api_key: str
    api_base: str = ""
    label: str = ""


@app.get("/api/ai/keys")
async def list_api_keys(user=Depends(get_current_user)):
    keys = db.get_api_keys(user["id"])
    return [
        {
            "id": k["id"],
            "provider": k["provider"],
            "label": k["label"],
            "api_base": k["api_base"],
            "key_preview": k["api_key"][:8] + "..." if len(k["api_key"]) > 8 else "***",
            "created_at": k["created_at"],
        }
        for k in keys
    ]


@app.post("/api/ai/keys")
async def add_api_key(req: ApiKeyRequest, user=Depends(get_current_user)):
    db.add_api_key(user["id"], req.provider, req.api_key, req.api_base, req.label)
    return {"ok": True}


@app.delete("/api/ai/keys/{key_id}")
async def remove_api_key(key_id: int, user=Depends(get_current_user)):
    db.delete_api_key(key_id, user["id"])
    return {"ok": True}


@app.post("/api/ai/test")
async def test_api_key(req: ApiKeyRequest):
    """Test an API key by sending a simple request."""
    try:
        result = await agents.call_llm(
            req.provider, req.api_key, "gpt-4o-mini" if req.provider == "openai" else "claude-haiku-4-5-20251001",
            "You are a test.", "Reply with just: OK",
            req.api_base,
        )
        return {"ok": True, "response": result[:100]}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ============================================================
# PROJECT / RESEARCH PIPELINE ROUTES
# ============================================================

class ProjectRequest(BaseModel):
    topics: list[str]
    model: str = "gpt-4o"
    provider: str = "openai"
    project_id: str = ""
    custom_prompts: dict = {}


@app.get("/api/projects")
async def list_projects(user=Depends(get_current_user)):
    projects = db.get_projects(user["id"])
    return [
        {
            "id": p["id"],
            "title": p["title"],
            "topics": json.loads(p["topics"]) if p["topics"] else [],
            "model": p["model"],
            "provider": p["provider"],
            "status": p["status"],
            "created_at": p["created_at"],
        }
        for p in projects
    ]


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str, user=Depends(get_current_user)):
    p = db.get_project(project_id, user["id"])
    if not p:
        raise HTTPException(404, "Project not found")
    return {
        "id": p["id"],
        "title": p["title"],
        "topics": json.loads(p["topics"]) if p["topics"] else [],
        "model": p["model"],
        "provider": p["provider"],
        "status": p["status"],
        "idea": json.loads(p["idea"]) if p["idea"] else None,
        "plan": json.loads(p["plan"]) if p["plan"] else None,
        "results": json.loads(p["results"]) if p["results"] else None,
        "paper": p["paper"],
        "error": p["error"],
        "created_at": p["created_at"],
        "updated_at": p["updated_at"],
    }


@app.delete("/api/projects/{project_id}")
async def delete_project_route(project_id: str, user=Depends(get_current_user)):
    db.delete_project(project_id, user["id"])
    return {"ok": True}


@app.post("/api/projects/run")
async def run_research(req: ProjectRequest, user=Depends(get_current_user)):
    """Run the full 4-stage research pipeline."""
    # Get API key for the provider
    api_key_row = db.get_default_api_key(user["id"], req.provider)
    if not api_key_row:
        raise HTTPException(400, f"No API key configured for {req.provider}. Add one in AI Models settings.")

    api_key = api_key_row["api_key"]
    api_base = api_key_row["api_base"] or ""

    project_id = req.project_id or f"proj_{uuid.uuid4().hex[:10]}"
    db.create_project(project_id, user["id"], project_id, req.topics, req.model, req.provider)

    try:
        # Stage 1: Ideation
        db.update_project(project_id, status="ideation")
        idea = await agents.run_ideation(
            req.provider, api_key, req.model, req.topics,
            req.custom_prompts.get("ideation", ""), api_base,
        )
        db.update_project(project_id, idea=json.dumps(idea), title=idea.get("title", project_id))

        # Stage 2: Planning
        db.update_project(project_id, status="planning")
        plan = await agents.run_planning(
            req.provider, api_key, req.model, idea,
            req.custom_prompts.get("planning", ""), api_base,
        )
        db.update_project(project_id, plan=json.dumps(plan))

        # Stage 3: Experiment
        db.update_project(project_id, status="experiment")
        results = await agents.run_experiment(
            req.provider, api_key, req.model, plan,
            req.custom_prompts.get("experiment", ""), api_base,
        )
        db.update_project(project_id, results=json.dumps(results))

        # Stage 4: Writing
        db.update_project(project_id, status="writing")
        paper = await agents.run_writing(
            req.provider, api_key, req.model, idea, plan, results,
            req.custom_prompts.get("writing", ""), api_base,
        )
        db.update_project(project_id, paper=paper, status="completed")

        return {
            "id": project_id,
            "status": "completed",
            "idea": idea,
            "plan": plan,
            "results": results,
            "paper": paper,
        }

    except Exception as e:
        db.update_project(project_id, status="error", error=str(e))
        raise HTTPException(500, f"Pipeline failed: {str(e)}")


# ============================================================
# R EXECUTION ROUTES
# ============================================================

class RCodeRequest(BaseModel):
    code: str
    timeout: int = 60


class RPackageRequest(BaseModel):
    package: str
    repo: str = "https://cloud.r-project.org"


@app.get("/api/r/status")
async def r_status():
    return {"available": r_engine.is_r_available()}


@app.post("/api/r/execute")
async def execute_r(req: RCodeRequest, user=Depends(get_current_user)):
    result = await r_engine.execute_r_code(req.code, timeout=req.timeout)
    db.save_r_execution(user["id"], req.code, result["output"], result["plots"], result["error"])
    return result


@app.get("/api/r/history")
async def r_history(user=Depends(get_current_user)):
    history = db.get_r_history(user["id"])
    return [
        {
            "id": h["id"],
            "code": h["code"],
            "output": h["output"],
            "plots": json.loads(h["plots"]) if h["plots"] else [],
            "error": h["error"],
            "created_at": h["created_at"],
        }
        for h in history
    ]


@app.post("/api/r/packages/install")
async def install_r_pkg(req: RPackageRequest, user=Depends(get_current_user)):
    result = await r_engine.install_r_package(req.package, req.repo)
    if result["success"]:
        db.add_package(req.package, "r")
    return result


@app.get("/api/r/packages")
async def list_r_pkgs():
    pkgs = await r_engine.list_r_packages()
    return pkgs


# ============================================================
# BIOMEDICAL API ROUTES
# ============================================================

@app.get("/api/bio/pubmed")
async def pubmed_search(query: str, max_results: int = 20, user=Depends(get_current_user)):
    ncbi_key = db.get_setting(user["id"], "ncbi_api_key", "")
    return await bio.search_pubmed(query, max_results, ncbi_key)


@app.get("/api/bio/uniprot")
async def uniprot_search(query: str, max_results: int = 20, user=Depends(get_current_user)):
    return await bio.search_uniprot(query, max_results)


@app.get("/api/bio/clinicaltrials")
async def clinicaltrials_search(query: str, max_results: int = 20, status: str = "", user=Depends(get_current_user)):
    return await bio.search_clinical_trials(query, max_results, status or None)


@app.get("/api/bio/gene")
async def gene_search(query: str, max_results: int = 20, user=Depends(get_current_user)):
    ncbi_key = db.get_setting(user["id"], "ncbi_api_key", "")
    return await bio.search_gene(query, max_results, ncbi_key)


@app.get("/api/bio/europepmc")
async def europepmc_search(query: str, max_results: int = 20, user=Depends(get_current_user)):
    return await bio.search_europe_pmc(query, max_results)


# ============================================================
# FILE MANAGEMENT ROUTES
# ============================================================

@app.post("/api/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    project_id: str = Form(""),
    user=Depends(get_current_user),
):
    # Save file
    user_dir = os.path.join(UPLOAD_DIR, str(user["id"]))
    os.makedirs(user_dir, exist_ok=True)

    safe_name = file.filename.replace("/", "_").replace("\\", "_")
    filepath = os.path.join(user_dir, f"{uuid.uuid4().hex[:8]}_{safe_name}")

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    file_id = db.add_file(
        user["id"], project_id, safe_name, filepath,
        len(content), file.content_type or "", "upload",
    )
    return {"id": file_id, "filename": safe_name, "size": len(content)}


@app.get("/api/files")
async def list_files(project_id: str = "", user=Depends(get_current_user)):
    files = db.get_files(user["id"], project_id or None)
    return [
        {
            "id": f["id"],
            "filename": f["filename"],
            "size": f["size"],
            "mime_type": f["mime_type"],
            "source": f["source"],
            "project_id": f["project_id"],
            "created_at": f["created_at"],
        }
        for f in files
    ]


@app.get("/api/files/{file_id}/download")
async def download_file(file_id: int, user=Depends(get_current_user)):
    files = db.get_files(user["id"])
    target = None
    for f in files:
        if f["id"] == file_id:
            target = f
            break
    if not target:
        raise HTTPException(404, "File not found")
    return FileResponse(target["filepath"], filename=target["filename"])


@app.delete("/api/files/{file_id}")
async def delete_file_route(file_id: int, user=Depends(get_current_user)):
    db.delete_file(file_id, user["id"])
    return {"ok": True}


# ============================================================
# PACKAGE MANAGEMENT ROUTES
# ============================================================

class PkgInstallRequest(BaseModel):
    name: str
    pkg_type: str  # "python" or "r"
    repo: str = ""


@app.get("/api/packages")
async def list_packages(pkg_type: str = ""):
    pkgs = db.get_packages(pkg_type or None)
    return [{"name": p["name"], "type": p["pkg_type"], "version": p["version"]} for p in pkgs]


@app.post("/api/packages/install")
async def install_package(req: PkgInstallRequest, user=Depends(get_current_user)):
    if req.pkg_type == "r":
        result = await r_engine.install_r_package(req.name, req.repo or "https://cloud.r-project.org")
    elif req.pkg_type == "python":
        result = await r_engine.install_python_package(req.name)
    else:
        raise HTTPException(400, "pkg_type must be 'python' or 'r'")

    if result["success"]:
        db.add_package(req.name, req.pkg_type, "latest")
    return result


# ============================================================
# SETTINGS ROUTES
# ============================================================

class SettingRequest(BaseModel):
    key: str
    value: str


@app.get("/api/settings")
async def get_settings(user=Depends(get_current_user)):
    keys = ["ncbi_api_key", "google_drive_token", "theme", "default_model", "default_provider"]
    result = {}
    for key in keys:
        val = db.get_setting(user["id"], key, "")
        if "key" in key.lower() or "token" in key.lower():
            result[key] = val[:8] + "..." if len(val) > 8 else ("set" if val else "")
        else:
            result[key] = val
    return result


@app.post("/api/settings")
async def save_setting(req: SettingRequest, user=Depends(get_current_user)):
    db.set_setting(user["id"], req.key, req.value)
    return {"ok": True}


# ============================================================
# GOOGLE DRIVE (placeholder — requires OAuth setup)
# ============================================================

@app.get("/api/drive/status")
async def drive_status(user=Depends(get_current_user)):
    token = db.get_setting(user["id"], "google_drive_token", "")
    return {"connected": bool(token), "note": "Configure Google OAuth credentials in settings"}


# ============================================================
# SERVE FRONTEND (must be last)
# ============================================================

DOCS_DIR = Path(__file__).parent.parent / "docs"
if DOCS_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DOCS_DIR), html=True), name="frontend")
