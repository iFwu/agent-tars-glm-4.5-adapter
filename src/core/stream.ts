import { Response } from 'express'
import { OpenAIResponse, TransformerFunction, StreamContext } from '../types/index.js'
import { RequestLoggerImpl, createProgressIndicator } from './logger.js'

export interface StreamOptions {
  url: string
  headers: Record<string, string>
  body: string
  providerId: string
  transformer?: TransformerFunction
  timeout?: number
  maxRetries?: number
  shouldRetryOnError?: (statusCode: number) => boolean
  shouldFallbackOnError?: (statusCode: number) => boolean
}

export interface StreamResult {
  success: boolean
  shouldFallback?: boolean
  error?: string
  statusCode?: number
}

/**
 * 通用的 SSE 流处理函数
 * 支持传入可选的 transformer 进行数据转换
 */
export async function handleSSEStream(
  options: StreamOptions,
  res: Response,
  onFallback?: (context: StreamContext) => Promise<void>
): Promise<StreamResult> {
  const {
    url,
    headers,
    body,
    providerId,
    transformer,
    timeout = 3 * 60 * 1000, // 3分钟默认超时
    maxRetries = 3,
    shouldRetryOnError = (status) => status >= 500 || status === 429,
    shouldFallbackOnError = (status) => status >= 400
  } = options

  console.log(`开始 ${providerId} 请求, 请求长度: ${body.length}`)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const progressIndicator = createProgressIndicator()
    const requestLogger = new RequestLoggerImpl(`${providerId}-${Date.now()}-${attempt}`)
    let progressInterval: NodeJS.Timeout | undefined

    try {
      // 开始进度指示器
      progressInterval = progressIndicator.start()

      // 创建带超时的 AbortController
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
      }, timeout)

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        progressIndicator.stop(progressInterval)
        progressInterval = undefined

        let errorBody = ''
        try {
          errorBody = await response.text()
        } catch (e) {
          // 忽略错误体读取失败
        }

        const errorMsg = `${providerId} API 错误: ${response.status}`

        // 检查是否应该重试
        if (shouldRetryOnError(response.status) && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
          console.log(`${providerId}: 重试中... (${delay}ms后)`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        // 检查是否应该 fallback
        if (shouldFallbackOnError(response.status) && onFallback) {
          console.log(`✗ ${providerId}: 请求失败，准备 fallback`)
          requestLogger.clear()

          const context: StreamContext = {
            providerId,
            requestId: requestLogger.requestId,
            startTime: Date.now(),
            res,
            logger: requestLogger
          }

          await onFallback(context)
          return { success: false, shouldFallback: true, statusCode: response.status }
        }

        // 不重试也不 fallback，直接返回错误
        console.log(`✗ ${providerId}: 请求失败 - ${errorMsg}${errorBody}`)
        return { 
          success: false, 
          error: errorMsg, 
          statusCode: response.status 
        }
      }

      // 连接成功，开始处理流
      process.stdout.write(`\r✓ ${providerId}: 连接成功，正在接收数据流...\n`)
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // 流结束处理函数
      const endStream = async (reason: string, errorMessage?: string, shouldFallback = false) => {
        if (progressInterval) {
          progressIndicator.stop(progressInterval)
        }

        if (errorMessage) {
          requestLogger.addChunk(`ERROR: ${errorMessage}`)
          console.log(`✗ ${providerId}: ${reason} - ${errorMessage}`)

          // 如果需要 fallback 且有回调函数
          if (shouldFallback && onFallback) {
            requestLogger.clear()

            // 发送切换说明
            const switchNotice: OpenAIResponse = {
              id: `chatcmpl-switch-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: providerId,
              choices: [{
                index: 0,
                delta: {
                  content: `\n\n[系统提示: ${providerId} 遇到问题，正在切换到备用服务 (${providerId})...]\n\n`
                },
                finish_reason: null
              }]
            }
            res.write(`data: ${JSON.stringify(switchNotice)}\n\n`)

            console.log(`🔄 ${providerId} 错误，切换到备用服务`)
            const context: StreamContext = {
              providerId,
              requestId: requestLogger.requestId,
              startTime: Date.now(),
              res,
              logger: requestLogger
            }
            await onFallback(context)
            return
          }

          requestLogger.finalize()

          // 发送错误响应
          const openaiError: OpenAIResponse = {
            id: `chatcmpl-error-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: providerId,
            choices: [{
              index: 0,
              delta: {
                content: `错误: ${errorMessage}`
              },
              finish_reason: 'stop'
            }]
          }
          res.write(`data: ${JSON.stringify(openaiError)}\n\n`)
        } else {
          requestLogger.addChunk('DONE')
          requestLogger.finalize()
          console.log(`✓ ${providerId}: ${reason}`)
        }

        res.write('data: [DONE]\n\n')
        res.end()
      }

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          // 流结束前检查剩余缓冲区是否有错误
          if (buffer.trim()) {
            try {
              const possibleError = JSON.parse(buffer.trim())
              if (possibleError.error) {
                await endStream('服务端返回错误', possibleError.error.message || possibleError.error.code || '操作失败', true)
                return { success: false, shouldFallback: true }
              }
            } catch (parseError) {
              // 不是JSON错误，继续正常结束
            }
          }
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 保留不完整的行

        for (const line of lines) {
          // 记录原始内容
          if (line.trim()) {
            requestLogger.addChunk(line)
          }

          // 处理标准的 SSE 格式
          if (line.startsWith('data: ')) {
            const dataContent = line.slice(6) // 移除 "data: " 前缀

            // 处理结束标记
            if (dataContent.trim() === '[DONE]' || dataContent.trim() === '') {
              await endStream('数据流接收完成')
              return { success: true }
            }

            try {
              // 解析响应数据
              const responseData = JSON.parse(dataContent)

              // 检查是否包含错误
              if (responseData.error) {
                await endStream('服务端返回错误', responseData.error.message || '操作失败', true)
                return { success: false, shouldFallback: true }
              }

              // 应用 transformer（如果提供）
              const transformedData = transformer ? transformer(responseData) : responseData

              // 输出转换后的数据
              res.write(`data: ${JSON.stringify(transformedData)}\n\n`)

            } catch (error) {
              console.log(`✗ ${providerId}: JSON解析错误: ${(error as Error).message}`)
              console.log(`${providerId}: 问题内容: ${dataContent}`)
              continue
            }
          }
          // 处理没有前缀的直接JSON错误响应
          else if (line.trim()) {
            try {
              const possibleError = JSON.parse(line.trim())
              if (possibleError.error) {
                await endStream('服务端返回错误', possibleError.error.message || possibleError.error.code || '操作失败', true)
                return { success: false, shouldFallback: true }
              }
            } catch (parseError) {
              // 不是JSON，继续处理
              continue
            }
          }
        }
      }

      // 流正常结束
      await endStream('数据流接收完成')
      return { success: true }

    } catch (error) {
      // 停止进度指示器
      if (progressInterval) {
        progressIndicator.stop(progressInterval)
      }

      const errorType = (error as any).name === 'AbortError' ? '请求超时' : `请求异常: ${(error as Error).message}`
      requestLogger.addChunk(`ERROR: ${errorType}`)

      if (attempt === maxRetries) {
        const errorMsg = `请求失败 (已重试 ${maxRetries} 次): ${(error as Error).message}`
        requestLogger.finalize()
        console.log(`✗ ${providerId}: 达到最大重试次数`)
        return { success: false, error: errorMsg }
      } else {
        requestLogger.clear() // 清除当前显示，准备重试
      }

      // 指数退避延迟
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
      console.log(`${providerId}: 重试中... (${delay}ms后)`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return { success: false, error: '未知错误' }
}