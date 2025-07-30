import { OpenAIResponse, OpenAIRequest, KimiRequest, TransformerFunction } from '../types/index.js'

/**
 * Kimi 响应数据转换器
 * Kimi API 通常直接兼容 OpenAI 格式，所以主要是透传
 */
export const kimiTransformer: TransformerFunction = (data: OpenAIResponse): OpenAIResponse => {
  // Kimi 直接透传，不需要特殊处理
  return data
}

/**
 * 创建 Kimi 请求体
 */
export function createKimiRequest(openaiRequest: OpenAIRequest): KimiRequest {
  return {
    ...openaiRequest,
    model: 'kimi-k2-0711-preview' // 使用 Kimi 模型
  }
}

/**
 * Kimi 错误检查
 */
export function shouldKimiFallback(statusCode: number): boolean {
  return statusCode >= 400
}

/**
 * Kimi 重试检查
 */
export function shouldKimiRetry(statusCode: number): boolean {
  return statusCode >= 500 || statusCode === 429
}