import { exec } from 'child_process'
import { promisify } from 'util'
import { basename } from 'path'
import { insertGitLog } from './db'

const execAsync = promisify(exec)

const WATCHED_REPOS = [
  'F:\\AstraSync',
  'D:\\OSkernel\\kernel'
]

async function fetchRepoGitLogs(repoPath: string) {
  const repoName = basename(repoPath)
  try {
    const command = `git -C "${repoPath}" log --since="24 hours ago" --pretty=format:"%H|%ad|%s" --date=iso --shortstat`
    const { stdout } = await execAsync(command)

    if (!stdout.trim()) return

    const blocks = stdout.split('\n\n')
    for (const block of blocks) {
      const lines = block.trim().split('\n')
      if (lines.length === 0 || !lines[0]) continue

      const [hash, date, ...msgParts] = lines[0].split('|')
      const message = msgParts.join('|')
      let insertions = 0
      let deletions = 0

      if (lines.length > 1) {
        const statLine = lines[1]
        const insMatch = statLine.match(/(\d+) insertion/)
        const delMatch = statLine.match(/(\d+) deletion/)
        if (insMatch) insertions = parseInt(insMatch[1], 10)
        if (delMatch) deletions = parseInt(delMatch[1], 10)
      }

      const changes = insertGitLog(repoName, hash, date, message, insertions, deletions)
      if (changes > 0) {
        console.log(`[Git探针] 捕获新提交 | 仓库: ${repoName} | +${insertions} -${deletions} | ${message}`)
      }
    }
  } catch (error) {
    // 过滤并忽略非 Git 目录的执行异常
  }
}

export function startGitCommitProbe() {
  console.log('[代码探针] 本地 Git 仓库监听服务已启动...')
  WATCHED_REPOS.forEach(fetchRepoGitLogs)
  
  setInterval(() => {
    WATCHED_REPOS.forEach(fetchRepoGitLogs)
  }, 60 * 60 * 1000)
}