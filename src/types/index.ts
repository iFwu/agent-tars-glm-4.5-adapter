import { z } from 'zod'
import { Response } from 'express'

// OpenAI 消息格式验证
export const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().or(z.array(z.any())).optional(),
  name: z.string().optional(),
  tool_calls: z.array(z.any()).optional(),
  tool_call_id: z.string().optional()
})

// 基础 OpenAI 请求验证
export const BaseOpenAIRequestSchema = z.object({
  model: z.string().min(1, '模型名称不能为空'),
  messages: z.array(MessageSchema).min(1, '至少需要一条消息'),
  stream: z.boolean().optional().default(true),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  stop: z.string().or(z.array(z.string())).optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional()
})

// GLM 特定验证（更严格的参数限制）
export const GLMRequestSchema = BaseOpenAIRequestSchema.extend({
  temperature: z.number().min(0.01).max(0.99).optional(),
  top_p: z.number().min(0.1).max(0.9).optional(),
  max_tokens: z.number().min(1).max(32768).optional()
})

// Kimi 特定验证
export const KimiRequestSchema = BaseOpenAIRequestSchema.extend({
  max_tokens: z.number().min(1).max(32768).optional()
})

// ModelScope 特定验证
export const ModelScopeRequestSchema = BaseOpenAIRequestSchema.extend({
  max_tokens: z.number().min(1).max(32768).optional()
})

// OpenAI 响应格式
export const OpenAIResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number(),
    delta: z.object({
      content: z.string().optional(),
      role: z.string().optional(),
      tool_calls: z.array(z.any()).optional()
    }).optional(),
    finish_reason: z.string().nullable().optional()
  }))
})

// API 错误格式
export const APIErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().optional(),
    code: z.string().or(z.number()).optional()
  })
})

// 服务提供商配置验证
export const ProviderConfigSchema = z.object({
  name: z.string(),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  enabled: z.boolean(),
  timeout: z.number().positive().optional(),
  maxRetries: z.number().min(1).max(10).optional(),
  retryDelay: z.number().positive().optional(),
  requestSchema: z.enum(['base', 'glm', 'kimi', 'modelscope']).optional()
})

// 请求配置验证
export const RequestConfigSchema = z.object({
  providers: z.array(ProviderConfigSchema).min(1),
  fallbackStrategy: z.enum(['sequential', 'parallel']),
  globalTimeout: z.number().positive().optional(),
  enableFallbackNotice: z.boolean().optional().default(true)
})

// 导出推断的类型  
export type OpenAIRequest = z.infer<typeof BaseOpenAIRequestSchema>
export type GLMRequest = z.infer<typeof GLMRequestSchema>
export type KimiRequest = z.infer<typeof KimiRequestSchema>
export type ModelScopeRequest = z.infer<typeof ModelScopeRequestSchema>
export type OpenAIResponse = z.infer<typeof OpenAIResponseSchema>
export type APIError = z.infer<typeof APIErrorSchema>
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>
export type RequestConfig = z.infer<typeof RequestConfigSchema>

// 验证错误处理
export interface ValidationError {
  field: string
  message: string
  code: string
}

export function formatZodError(error: z.ZodError): ValidationError[] {
  return error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }))
}

// 获取对应的请求验证 schema
export function getRequestSchema(provider: string) {
  switch (provider.toLowerCase()) {
    case 'glm':
      return GLMRequestSchema
    case 'kimi':
      return KimiRequestSchema
    case 'modelscope':
      return ModelScopeRequestSchema
    default:
      return BaseOpenAIRequestSchema
  }
}

export type TransformerFunction = (data: OpenAIResponse) => OpenAIResponse

export interface StreamContext {
  providerId: string
  requestId: string
  startTime: number
  res: Response
  logger: RequestLogger
}

export interface RequestLogger {
  requestId: string
  chunks: string[]
  maxWidth: number
  isActive: boolean
  formatTimestamp(): string
  addChunk(rawLine: string): void
  display(): void
  finalize(): void
  clear(): void
}