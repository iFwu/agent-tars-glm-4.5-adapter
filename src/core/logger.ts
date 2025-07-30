import logUpdate from 'log-update'
import { RequestLogger } from '../types/index.js'

// 修复 log-update ES module 导入问题
const logUpdateFn = typeof logUpdate === 'function' ? logUpdate : (logUpdate as any).default

/**
 * 管理请求日志显示
 */
export class RequestLoggerImpl implements RequestLogger {
  public requestId: string
  public chunks: string[] = []
  public maxWidth: number
  public isActive: boolean = true
  public providerName: string

  constructor(requestId: string) {
    this.requestId = requestId
    // 从 requestId 中提取供应商名称 (如 GLM-1753882029408-1 -> GLM)
    this.providerName = requestId.split('-')[0]
    this.maxWidth = (process.stdout.columns || 120) - 17 - this.providerName.length // 预留字符给时间戳和供应商名
  }

  formatTimestamp(): string {
    const now = new Date()
    return now.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  addChunk(rawLine: string): void {
    const timestamp = this.formatTimestamp()
    const prefix = `[${timestamp}] ${this.providerName}:`

    // 截取长度防止超过宽度
    const truncated = rawLine.length > this.maxWidth
      ? rawLine.substring(0, this.maxWidth - 3) + '...'
      : rawLine

    const logLine = `${prefix} ${truncated}`
    this.chunks.push(logLine)

    // 进行中的请求显示最后10行，完成的请求保留最后5行
    const maxLines = this.isActive ? 10 : 5
    if (this.chunks.length > maxLines) {
      this.chunks.shift()
    }

    this.display()
  }

  display(): void {
    if (this.isActive) {
      // 进行中的请求使用log-update动态更新
      const output = this.chunks.join('\n')
      logUpdateFn(output)
    }
  }

  finalize(): void {
    // 请求完成时调用
    this.isActive = false

    // 保留最后5行
    if (this.chunks.length > 5) {
      this.chunks = this.chunks.slice(-5)
    }

    // 清除动态显示
    logUpdateFn.clear()

    // 将最后几行永久输出到控制台
    this.chunks.forEach(line => console.log(line))
  }

  clear(): void {
    if (this.isActive) {
      logUpdateFn.clear()
    }
  }
}

/**
 * CLI 进度指示器
 */
export function createProgressIndicator() {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let frameIndex = 0
  let seconds = 0

  return {
    start: () => {
      const interval = setInterval(() => {
        process.stdout.write(`\r${frames[frameIndex]} 请求中... ${seconds}s`)
        frameIndex = (frameIndex + 1) % frames.length
        if (frameIndex === 0) seconds++
      }, 100)
      return interval
    },
    stop: (interval: NodeJS.Timeout) => {
      clearInterval(interval)
      process.stdout.write('\r\n')
    }
  }
}