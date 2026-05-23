import neo4j from 'neo4j-driver'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

const dbPath = join(app.getPath('userData'), 'astrasync_buffer.db')
const db = new Database(dbPath)

const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', 'astrasync2026')
)

async function initGraphSchema() {
  const session = driver.session()
  try {
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (d:Day) REQUIRE d.date IS UNIQUE')
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (a:Activity) REQUIRE a.rawId IS UNIQUE')
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE')
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (c:Commit) REQUIRE c.hash IS UNIQUE')
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (r:Repo) REQUIRE r.name IS UNIQUE')
    console.log('[图数据库] 核心节点约束初始化完成')
  } catch (error) {
    console.error('[图数据库] 约束创建失败:', error)
  } finally {
    await session.close()
  }
}

async function syncTopology() {
  const session = driver.session()
  try {
    const activities = db.prepare(`SELECT * FROM structured_logs WHERE date(created_at, 'localtime') = date('now', 'localtime')`).all() as any[]
    for (const act of activities) {
      const dateStr = new Date(act.created_at).toISOString().split('T')[0]
      const tags = act.tags ? act.tags.split(',') : []
      
      // 使用 FOREACH 处理动态标签数组，避免空数组导致的执行链中断
      await session.executeWrite(tx => tx.run(`
        MERGE (d:Day {date: $dateStr})
        MERGE (a:Activity {rawId: $rawId})
        SET a.type = $type, a.duration = $duration, a.text = $text, a.timestamp = $timestamp
        MERGE (d)-[:RECORDED]->(a)
        FOREACH (tagName IN $tags |
          MERGE (t:Tag {name: tagName})
          MERGE (a)-[:HAS_TAG]->(t)
        )
      `, {
        dateStr,
        rawId: act.raw_id,
        type: act.activity_type,
        duration: act.duration_minutes,
        text: act.clean_text,
        timestamp: act.created_at,
        tags
      }))
    }

    const commits = db.prepare(`SELECT * FROM git_logs WHERE date(created_at, 'localtime') = date('now', 'localtime')`).all() as any[]
    for (const c of commits) {
      const dateStr = new Date(c.commit_date).toISOString().split('T')[0]
      await session.executeWrite(tx => tx.run(`
        MERGE (d:Day {date: $dateStr})
        MERGE (r:Repo {name: $repoName})
        MERGE (commit:Commit {hash: $hash})
        SET commit.message = $msg, commit.insertions = $ins, commit.deletions = $del, commit.timestamp = $timestamp
        MERGE (d)-[:COMMITTED]->(commit)
        MERGE (commit)-[:BELONGS_TO]->(r)
      `, {
        dateStr,
        repoName: c.repo_name,
        hash: c.commit_hash,
        msg: c.message,
        ins: c.insertions,
        del: c.deletions,
        timestamp: c.commit_date
      }))
    }
    console.log('[图数据库] 当日行为与代码流转拓扑同步完毕')
  } catch (error) {
    console.error('[图数据库] 拓扑同步异常:', error)
  } finally {
    await session.close()
  }
}

export function startGraphSyncEngine() {
  initGraphSchema().then(() => {
    syncTopology()
    setInterval(syncTopology, 5 * 60 * 1000)
  })
}

export async function closeGraphConnection() {
  await driver.close()
}