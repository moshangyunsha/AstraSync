import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

const dbPath = join(app.getPath('userData'), 'astrasync_buffer.db')
const db = new Database(dbPath)

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
  );

  CREATE TABLE IF NOT EXISTS structured_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_id INTEGER NOT NULL,
    activity_type TEXT,
    duration_minutes INTEGER DEFAULT 0,
    tags TEXT,
    clean_text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(raw_id) REFERENCES raw_logs(id)
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
  
  // 新增针对结构化解析表的按活动类型时长统计
  const allocationStats = db.prepare(`
    SELECT activity_type, SUM(duration_minutes) as total_minutes 
    FROM structured_logs 
    WHERE date(created_at, 'localtime') = date('now', 'localtime') 
    GROUP BY activity_type
  `).all()

  return {
    timeline: timelineStmt.all(),
    stats: {
      manual: manualCount.count,
      focusSwitches: focusCount.count,
      allocation: allocationStats,
      git: {
        commits: gitStats.count,
        insertions: gitStats.ins || 0,
        deletions: gitStats.del || 0
      }
    }
  }
}

export function updateLogParsedStatus(rawId: number | bigint) {
  db.prepare('UPDATE raw_logs SET parsed_status = 1 WHERE id = ?').run(rawId)
}

export function insertStructuredLog(rawId: number | bigint, type: string, duration: number, tags: string, text: string) {
  const stmt = db.prepare('INSERT INTO structured_logs (raw_id, activity_type, duration_minutes, tags, clean_text) VALUES (?, ?, ?, ?, ?)')
  return stmt.run(rawId, type, duration, tags, text).lastInsertRowid
}