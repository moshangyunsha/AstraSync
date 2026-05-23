import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

const dbPath = join(app.getPath('userData'), 'astrasync_buffer.db')
const db = new Database(dbPath)

// 开启预写式日志与写入同步优化，大幅降低 I/O 延迟
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS raw_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_text TEXT NOT NULL,
    parsed_status INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS focus_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_name TEXT NOT NULL,
    window_title TEXT NOT NULL,
    duration_ms INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS git_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_name TEXT NOT NULL,
    commit_hash TEXT UNIQUE NOT NULL,
    commit_date DATETIME NOT NULL,
    message TEXT,
    insertions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

export function insertRawLog(text: string): number | bigint {
  const stmt = db.prepare('INSERT INTO raw_logs (raw_text) VALUES (?)')
  return stmt.run(text).lastInsertRowid
}

export function insertFocusLog(appName: string, title: string): number | bigint {
  const stmt = db.prepare('INSERT INTO focus_logs (app_name, window_title) VALUES (?, ?)')
  return stmt.run(appName, title).lastInsertRowid
}

export function insertGitLog(repo: string, hash: string, date: string, msg: string, ins: number, del: number) {
  try {
    const stmt = db.prepare('INSERT OR IGNORE INTO git_logs (repo_name, commit_hash, commit_date, message, insertions, deletions) VALUES (?, ?, ?, ?, ?, ?)')
    return stmt.run(repo, hash, date, msg, ins, del).changes
  } catch (error) {
    console.error('[数据库] 写入 Git 日志失败:', error)
    return 0
  }
}

export function getRecentLogs(limit: number = 5) {
  return db.prepare('SELECT * FROM raw_logs ORDER BY created_at DESC LIMIT ?').all(limit)
}


export function getTodayDashboardData() {
  const timelineStmt = db.prepare(`
    SELECT 'manual' as type, id, raw_text as title, '' as subtitle, created_at FROM raw_logs WHERE date(created_at, 'localtime') = date('now', 'localtime')
    UNION ALL
    SELECT 'focus' as type, id, app_name as title, window_title as subtitle, created_at FROM focus_logs WHERE date(created_at, 'localtime') = date('now', 'localtime')
    UNION ALL
    SELECT 'git' as type, id, repo_name as title, message as subtitle, created_at FROM git_logs WHERE date(created_at, 'localtime') = date('now', 'localtime')
    ORDER BY created_at DESC
  `)

  const manualCount = db.prepare(`SELECT COUNT(*) as count FROM raw_logs WHERE date(created_at, 'localtime') = date('now', 'localtime')`).get() as { count: number }
  const focusCount = db.prepare(`SELECT COUNT(*) as count FROM focus_logs WHERE date(created_at, 'localtime') = date('now', 'localtime')`).get() as { count: number }
  const gitStats = db.prepare(`SELECT COUNT(*) as count, SUM(insertions) as ins, SUM(deletions) as del FROM git_logs WHERE date(created_at, 'localtime') = date('now', 'localtime')`).get() as { count: number, ins: number | null, del: number | null }

  return {
    timeline: timelineStmt.all(),
    stats: {
      manual: manualCount.count,
      focusSwitches: focusCount.count,
      git: {
        commits: gitStats.count,
        insertions: gitStats.ins || 0,
        deletions: gitStats.del || 0
      }
    }
  }
}