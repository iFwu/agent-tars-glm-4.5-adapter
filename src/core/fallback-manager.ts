import { Response } from 'express'
import { OpenAIRequest, StreamContext } from '../types/index.js'
import { OpenAICompatibleProvider, OpenAICompatibleConfig } from '../providers/openai-compatible.js'
import { getEnabledProviders } from '../config/providers.js'

export interface FallbackOptions {
  enableFallbackNotice?: boolean
  maxFallbackAttempts?: number
}

export class FallbackManager {
  private providers: OpenAICompatibleProvider[] = []
  private options: FallbackOptions

  constructor(options: FallbackOptions = {}) {
    this.options = {
      enableFallbackNotice: true,
      maxFallbackAttempts: 3,
      ...options
    }
    
    // 初始化所有启用的服务提供商
    this.initializeProviders()
  }

  private initializeProviders(): void {
    const configs = getEnabledProviders()
    this.providers = configs.map(config => new OpenAICompatibleProvider(config))
    
    console.log(`📋 初始化 ${this.providers.length} 个服务提供商:`, 
      this.providers.map(p => p.getName()).join(' -> '))
  }

  /**
   * 处理请求，支持自动 fallback
   */
  async handleRequest(request: OpenAIRequest, res: Response): Promise<void> {
    if (this.providers.length === 0) {
      res.status(500).json({
        error: '没有可用的服务提供商'
      })
      return
    }

    // 验证请求参数
    const validationResult = await this.validateRequest(request)
    if (!validationResult.valid) {
      res.status(400).json({
        error: '请求参数验证失败',
        details: validationResult.errors
      })
      return
    }

    // 设置 SSE 头部
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    })

    let currentProviderIndex = 0
    let fallbackCount = 0

    const tryNextProvider = async (): Promise<void> => {
      if (currentProviderIndex >= this.providers.length) {
        // 所有服务商都失败了
        res.write(`data: {"error": "所有服务提供商都不可用"}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }

      if (fallbackCount >= (this.options.maxFallbackAttempts || 3)) {
        // 达到最大 fallback 次数
        res.write(`data: {"error": "达到最大 fallback 次数限制"}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }

      const currentProvider = this.providers[currentProviderIndex]
      console.log(`🚀 尝试使用 ${currentProvider.getName()} (第 ${currentProviderIndex + 1} 个服务商)`)

      try {
        const result = await currentProvider.handleRequest(request, res, async (context) => {
          // fallback 回调函数
          fallbackCount++
          currentProviderIndex++
          
          if (this.options.enableFallbackNotice && currentProviderIndex < this.providers.length) {
            const nextProvider = this.providers[currentProviderIndex]
            console.log(`🔄 ${context.providerId} 失败，切换到 ${nextProvider.getName()}`)
          }
          
          await tryNextProvider()
        })

        // 如果请求成功完成，不需要做额外处理
        if (result.success) {
          console.log(`✅ ${currentProvider.getName()} 请求成功完成`)
        }

      } catch (error) {
        console.error(`❌ ${currentProvider.getName()} 处理异常:`, error)
        // 异常情况下也尝试下一个服务商
        fallbackCount++
        currentProviderIndex++
        await tryNextProvider()
      }
    }

    // 开始处理请求
    await tryNextProvider()
  }

  /**
   * 验证请求参数
   */
  private async validateRequest(request: OpenAIRequest): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = []

    // 基础验证
    if (!request.model) {
      errors.push('model 参数是必需的')
    }

    if (!request.messages || !Array.isArray(request.messages) || request.messages.length === 0) {
      errors.push('messages 参数是必需的且不能为空')
    }

    // 检查 stream 参数
    if (request.stream !== true) {
      errors.push('此转换器仅支持流式请求，请设置 stream=true')
    }

    // 验证消息格式
    if (request.messages) {
      request.messages.forEach((message, index) => {
        if (!message.role) {
          errors.push(`消息 ${index}: role 是必需的`)
        }
        if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) {
          errors.push(`消息 ${index}: role 必须是 system, user, assistant 或 tool`)
        }
        if (!message.content && !message.tool_calls) {
          errors.push(`消息 ${index}: content 或 tool_calls 至少需要一个`)
        }
      })
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    }
  }

  /**
   * 获取当前可用的服务提供商列表
   */
  getAvailableProviders(): string[] {
    return this.providers.map(p => p.getName())
  }

  /**
   * 重新初始化服务提供商（用于配置更新后）
   */
  refresh(): void {
    this.initializeProviders()
  }
}