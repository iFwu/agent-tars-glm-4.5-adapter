import { OpenAIResponse, OpenAIRequest, GLMRequest, TransformerFunction } from '../types/index.js'

/**
 * GLM 响应数据转换器
 * 主要处理 tool_calls 的 index 修复问题
 */
export const glmTransformer: TransformerFunction = (data: OpenAIResponse): OpenAIResponse => {
  // 检查是否是 GLM 响应格式
  if (!data || typeof data !== 'object') {
    return data
  }

  // 只处理 tool_calls 的 index 修复，其他完全透传
  if (data.choices && 
      data.choices[0] && 
      data.choices[0].delta && 
      data.choices[0].delta.tool_calls) {
    
    // 修复 tool_calls 的 index
    data.choices[0].delta.tool_calls = data.choices[0].delta.tool_calls.map((toolCall: any, index: number) => ({
      ...toolCall,
      index: index
    }))
  }

  return data
}

/**
 * 创建 GLM 请求体
 * 将标准 OpenAI 请求转换为 GLM 格式
 */
export function createGLMRequest(openaiRequest: OpenAIRequest): GLMRequest {
  return {
    ...openaiRequest,
    model: 'glm-4.5' // 强制使用 GLM-4.5 模型
  }
}

/**
 * GLM 错误检查
 * 判断是否应该进行 fallback
 * 根据 TODO.md 要求，400 错误也要进行 fallback
 */
export function shouldGLMFallback(statusCode: number): boolean {
  // 对于所有 4xx 和 5xx 错误都进行 fallback
  // 特别包括 400 错误（参数不标准导致的错误）
  return statusCode >= 400
}

/**
 * GLM 重试检查  
 * 判断是否应该重试
 */
export function shouldGLMRetry(statusCode: number): boolean {
  // 对于网络问题（5xx）和限流（429）进行重试
  // 对于客户端错误（4xx，包括 400）不重试，直接 fallback
  return statusCode >= 500 || statusCode === 429
}