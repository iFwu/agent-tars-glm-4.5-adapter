#!/usr/bin/env bun

import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { FallbackManager } from './core/fallback-manager.js'
import { validateProviderConfigs } from './config/providers.js'
import { OpenAIRequest, getRequestSchema, formatZodError } from './types/index.js'

// 加载环境变量
config()

const app = express()
const PORT = Number(process.env.PORT) || 3000

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// 初始化 fallback 管理器
const fallbackManager = new FallbackManager({
  enableFallbackNotice: true,
  maxFallbackAttempts: 3
})

// 验证配置
const configValidation = validateProviderConfigs()
if (!configValidation.valid) {
  console.error('❌ 配置验证失败:')
  configValidation.errors.forEach(error => console.error(`   ${error}`))
  process.exit(1)
}

// OpenAI 兼容的聊天完成端点
app.post('/v1/chat/completions', async (req, res) => {
  try {
    // 使用 zod 验证请求参数
    const requestSchema = getRequestSchema('base') // 使用基础验证
    const validationResult = requestSchema.safeParse(req.body)
    
    if (!validationResult.success) {
      const errors = formatZodError(validationResult.error)
      console.log('❌ 请求参数验证失败:', errors)
      
      return res.status(400).json({
        error: '请求参数验证失败',
        details: errors.map(err => `${err.field}: ${err.message}`).join('; ')
      })
    }

    const requestData: OpenAIRequest = validationResult.data

    // 检查是否为流式请求
    if (requestData.stream !== true) {
      return res.status(400).json({
        error: '此转换器仅支持流式请求，请设置 stream=true'
      })
    }

    console.log(`📨 收到请求: ${requestData.messages.length} 条消息，模型: ${requestData.model}`)

    // 使用 fallback 管理器处理请求
    await fallbackManager.handleRequest(requestData, res)

  } catch (error) {
    console.error('❌ 请求处理失败:', error)
    if (!res.headersSent) {
      res.status(500).json({
        error: '服务器内部错误',
        message: (error as Error).message
      })
    }
  }
})

// 健康检查端点
app.get('/health', (req, res) => {
  const availableProviders = fallbackManager.getAvailableProviders()
  
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    providers: availableProviders,
    version: '1.0.0'
  })
})

// 获取可用服务提供商列表
app.get('/providers', (req, res) => {
  const availableProviders = fallbackManager.getAvailableProviders()
  
  res.json({
    providers: availableProviders,
    fallbackStrategy: 'sequential'
  })
})

// 重新加载配置端点
app.post('/reload', (req, res) => {
  try {
    fallbackManager.refresh()
    const availableProviders = fallbackManager.getAvailableProviders()
    
    console.log('🔄 配置已重新加载')
    
    res.json({
      message: '配置已重新加载',
      providers: availableProviders
    })
  } catch (error) {
    console.error('❌ 配置重新加载失败:', error)
    res.status(500).json({
      error: '配置重新加载失败',
      message: (error as Error).message
    })
  }
})

// 错误处理中间件
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ 未处理的错误:', error)
  
  if (!res.headersSent) {
    res.status(500).json({
      error: '服务器内部错误',
      message: error.message
    })
  }
})

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 API 转换器服务启动成功')
  console.log(`📍 服务地址: http://localhost:${PORT}`)
  console.log(`🔗 主要端点: http://localhost:${PORT}/v1/chat/completions`)
  console.log(`❤️  健康检查: http://localhost:${PORT}/health`)
  console.log(`📋 服务提供商: ${fallbackManager.getAvailableProviders().join(' -> ')}`)
  console.log('💡 使用方法: 发送 OpenAI 格式请求，确保设置 stream=true')
  console.log('🔄 自动 fallback 已启用，请求失败时会自动切换到备用服务')
})