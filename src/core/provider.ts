import { Response } from 'express'
import { OpenAIRequest, StreamContext, TransformerFunction } from '../types/index.js'
import { handleSSEStream } from './stream.js'

export interface ProviderConfig {
  name: string
  apiKey: string
  baseUrl: string
  model: string
  timeout?: number
  maxRetries?: number
  transformer?: TransformerFunction
  shouldRetryOnError?: (statusCode: number) => boolean
  shouldFallbackOnError?: (statusCode: number) => boolean
  requestTransformer?: (request: OpenAIRequest) => any
}

export class Provider {
  private config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
  }

  async handleRequest(
    request: OpenAIRequest, 
    res: Response,
    onFallback?: (context: StreamContext) => Promise<void>
  ): Promise<{ success: boolean; shouldFallback?: boolean; error?: string }> {
    
    // 转换请求（设置模型名称等）
    const transformedRequest = this.config.requestTransformer 
      ? this.config.requestTransformer(request)
      : { ...request, model: this.config.model }
    
    const url = `${this.config.baseUrl}/chat/completions`
    
    const headers = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json'
    }

    const result = await handleSSEStream({
      url,
      headers,
      body: JSON.stringify(transformedRequest),
      providerId: this.config.name,
      transformer: this.config.transformer,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      shouldRetryOnError: this.config.shouldRetryOnError,
      shouldFallbackOnError: this.config.shouldFallbackOnError
    }, res, onFallback)

    if (!result.success && !result.shouldFallback) {
      // 如果失败且不需要 fallback，发送错误响应
      if (!res.headersSent) {
        res.status(500).json({ 
          error: result.error || `${this.config.name} 服务不可用` 
        })
      }
    }

    return result
  }

  getName(): string {
    return this.config.name
  }

  getModel(): string {
    return this.config.model
  }
}