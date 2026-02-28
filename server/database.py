"""
Database module — SQLite persistence for users, projects, API keys, files, R sessions.
Easy to swap to PostgreSQL later if needed.
"""

import sqlite3
import os
import json
from pathlib import Path
from contextlib import contextmanager

DB_PATH = os.environ.get("OPENFARS_DB", "openfars.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db_session():
    conn = get_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Create all tables if they don't exist."""
    with db_session() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                display_name TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                provider TEXT NOT NULL,
                api_key TEXT NOT NULL,
                api_base TEXT DEFAULT '',
                label TEXT DEFAULT '',
                is_default INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                title TEXT DEFAULT '',
                topics TEXT DEFAULT '[]',
                model TEXT DEFAULT 'gpt-4o',
                provider TEXT DEFAULT 'openai',
                status TEXT DEFAULT 'pending',
                idea TEXT DEFAULT '',
                plan TEXT DEFAULT '',
                results TEXT DEFAULT '',
                paper TEXT DEFAULT '',
                error TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                project_id TEXT DEFAULT '',
                filename TEXT NOT NULL,
                filepath TEXT NOT NULL,
                size INTEGER DEFAULT 0,
                mime_type TEXT DEFAULT '',
                source TEXT DEFAULT 'upload',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS r_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                code TEXT NOT NULL,
                output TEXT DEFAULT '',
                plots TEXT DEFAULT '[]',
                error TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS installed_packages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                pkg_type TEXT NOT NULL,
                version TEXT DEFAULT '',
                installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name, pkg_type)
            );

            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                key TEXT NOT NULL,
                value TEXT DEFAULT '',
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, key)
            );
        """)


# ---- User helpers ----

def create_user(username, password_hash):
    with db_session() as conn:
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, password_hash),
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_user_by_username(username):
    with db_session() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()


def get_user_by_id(user_id):
    with db_session() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()


def update_password(user_id, password_hash):
    with db_session() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, user_id),
        )


# ---- API key helpers ----

def add_api_key(user_id, provider, api_key, api_base="", label=""):
    with db_session() as conn:
        conn.execute(
            "INSERT INTO api_keys (user_id, provider, api_key, api_base, label) VALUES (?, ?, ?, ?, ?)",
            (user_id, provider, api_key, api_base, label),
        )


def get_api_keys(user_id):
    with db_session() as conn:
        return conn.execute(
            "SELECT * FROM api_keys WHERE user_id = ?", (user_id,)
        ).fetchall()


def delete_api_key(key_id, user_id):
    with db_session() as conn:
        conn.execute(
            "DELETE FROM api_keys WHERE id = ? AND user_id = ?", (key_id, user_id)
        )


def get_default_api_key(user_id, provider):
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM api_keys WHERE user_id = ? AND provider = ? ORDER BY is_default DESC, id ASC LIMIT 1",
            (user_id, provider),
        ).fetchone()
        return row


# ---- Project helpers ----

def create_project(project_id, user_id, title, topics, model, provider):
    with db_session() as conn:
        conn.execute(
            "INSERT INTO projects (id, user_id, title, topics, model, provider, status) VALUES (?, ?, ?, ?, ?, ?, 'running')",
            (project_id, user_id, title, json.dumps(topics), model, provider),
        )


def get_projects(user_id):
    with db_session() as conn:
        return conn.execute(
            "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()


def get_project(project_id, user_id):
    with db_session() as conn:
        return conn.execute(
            "SELECT * FROM projects WHERE id = ? AND user_id = ?",
            (project_id, user_id),
        ).fetchone()


def update_project(project_id, **kwargs):
    with db_session() as conn:
        sets = ", ".join(f"{k} = ?" for k in kwargs)
        vals = list(kwargs.values()) + [project_id]
        conn.execute(f"UPDATE projects SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", vals)


def delete_project(project_id, user_id):
    with db_session() as conn:
        conn.execute(
            "DELETE FROM projects WHERE id = ? AND user_id = ?",
            (project_id, user_id),
        )


# ---- File helpers ----

def add_file(user_id, project_id, filename, filepath, size, mime_type, source="upload"):
    with db_session() as conn:
        conn.execute(
            "INSERT INTO files (user_id, project_id, filename, filepath, size, mime_type, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, project_id, filename, filepath, size, mime_type, source),
        )
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_files(user_id, project_id=None):
    with db_session() as conn:
        if project_id:
            return conn.execute(
                "SELECT * FROM files WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC",
                (user_id, project_id),
            ).fetchall()
        return conn.execute(
            "SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()


def delete_file(file_id, user_id):
    with db_session() as conn:
        row = conn.execute(
            "SELECT filepath FROM files WHERE id = ? AND user_id = ?",
            (file_id, user_id),
        ).fetchone()
        if row:
            try:
                os.remove(row["filepath"])
            except OSError:
                pass
            conn.execute("DELETE FROM files WHERE id = ?", (file_id,))


# ---- R history helpers ----

def save_r_execution(user_id, code, output, plots=None, error=""):
    with db_session() as conn:
        conn.execute(
            "INSERT INTO r_history (user_id, code, output, plots, error) VALUES (?, ?, ?, ?, ?)",
            (user_id, code, output, json.dumps(plots or []), error),
        )


def get_r_history(user_id, limit=50):
    with db_session() as conn:
        return conn.execute(
            "SELECT * FROM r_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()


# ---- Settings helpers ----

def get_setting(user_id, key, default=""):
    with db_session() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE user_id = ? AND key = ?",
            (user_id, key),
        ).fetchone()
        return row["value"] if row else default


def set_setting(user_id, key, value):
    with db_session() as conn:
        conn.execute(
            "INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?",
            (user_id, key, value, value),
        )


# ---- Package helpers ----

def add_package(name, pkg_type, version=""):
    with db_session() as conn:
        conn.execute(
            "INSERT INTO installed_packages (name, pkg_type, version) VALUES (?, ?, ?) ON CONFLICT(name, pkg_type) DO UPDATE SET version = ?",
            (name, pkg_type, version, version),
        )


def get_packages(pkg_type=None):
    with db_session() as conn:
        if pkg_type:
            return conn.execute(
                "SELECT * FROM installed_packages WHERE pkg_type = ? ORDER BY name",
                (pkg_type,),
            ).fetchall()
        return conn.execute(
            "SELECT * FROM installed_packages ORDER BY pkg_type, name"
        ).fetchall()


def remove_package(name, pkg_type):
    with db_session() as conn:
        conn.execute(
            "DELETE FROM installed_packages WHERE name = ? AND pkg_type = ?",
            (name, pkg_type),
        )
