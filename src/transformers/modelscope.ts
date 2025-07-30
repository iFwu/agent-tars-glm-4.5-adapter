import { OpenAIResponse, OpenAIRequest, ModelScopeRequest, TransformerFunction } from '../types/index.js'

/**
 * ModelScope 响应数据转换器
 * ModelScope 使用 OpenAI 兼容格式，通常直接透传
 */
export const modelscopeTransformer: TransformerFunction = (data: OpenAIResponse): OpenAIResponse => {
  // ModelScope 直接透传，不需要特殊处理
  return data
}

/**
 * 创建 ModelScope 请求体
 */
export function createModelScopeRequest(openaiRequest: OpenAIRequest): ModelScopeRequest {
  return {
    ...openaiRequest,
    model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct' // 使用 Qwen3-Coder 模型
  }
}

/**
 * ModelScope 错误检查
 */
export function shouldModelScopeFallback(statusCode: number): boolean {
  return statusCode >= 400
}

/**
 * ModelScope 重试检查
 */
export function shouldModelScopeRetry(statusCode: number): boolean {
  return statusCode >= 500 || statusCode === 429
}