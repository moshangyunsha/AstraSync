import { insertStructuredLog, updateLogParsedStatus } from './db'

export function parseRawLog(rawId: number | bigint, rawText: string) {
  try {
    let durationMinutes = 0
    const tags: string[] = []
    let cleanText = rawText

    const timeRegex = /(\d+(?:\.\d+)?)\s*(h|m|min|小时|分钟)/gi
    const timeMatch = timeRegex.exec(rawText)
    
    if (timeMatch) {
      const value = parseFloat(timeMatch[1])
      const unit = timeMatch[2].toLowerCase()
      durationMinutes = (unit === 'h' || unit === '小时') ? Math.round(value * 60) : Math.round(value)
      cleanText = cleanText.replace(timeMatch[0], '')
    }

    const tagRegex = /#(\S+)/g
    let tagMatch
    while ((tagMatch = tagRegex.exec(rawText)) !== null) {
      tags.push(tagMatch[1])
      cleanText = cleanText.replace(tagMatch[0], '')
    }

    let activityType = 'general'
    if (tags.includes('开发') || tags.includes('代码') || tags.includes('网安')) {
      activityType = 'engineering'
    } else if (tags.includes('阅读') || tags.includes('文献')) {
      activityType = 'learning'
    }

    cleanText = cleanText.trim()

    insertStructuredLog(rawId, activityType, durationMinutes, tags.join(','), cleanText)
    updateLogParsedStatus(rawId)
    
    console.log(`[解析引擎] ID:${rawId} 解析完成 | 耗时:${durationMinutes}m | 标签:${tags.join(',')} | 净文本:${cleanText}`)
  } catch (error) {
    console.error(`[解析引擎] 处理日志 ID:${rawId} 失败:`, error)
  }
}