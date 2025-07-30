import { OpenAIResponse, OpenAIRequest, TransformerFunction } from '../types/index.js';

/**
 * JSON 配置中的 fallback provider 项
 */
export interface FallbackProviderConfig {
  provider?: string;     // 预定义服务商名称 (kimi, modelscope)
  name?: string;         // 自定义名称
  model?: string;        // 自定义模型名
  apiKey?: string;       // API Key
  baseUrl?: string;      // 自定义 base URL
  timeout?: number;      // 超时时间
  maxRetries?: number;   // 重试次数
}

/**
 * 预定义的服务商配置
 */
export const PREDEFINED_PROVIDERS = {
  kimi: {
    name: 'Kimi',
    model: 'kimi-k2-0711-preview',
    baseUrl: 'https://api.moonshot.cn/v1',
    timeout: 5 * 60 * 1000, // 5分钟
  },
  modelscope: {
    name: 'ModelScope', 
    model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    timeout: 3 * 60 * 1000, // 3分钟
  },
} as const;

/**
 * 通用 fallback 响应转换器
 * OpenAI 兼容的服务商通常可以直接透传
 */
export const fallbackTransformer: TransformerFunction = (data: OpenAIResponse): OpenAIResponse => {
  return data;
};

/**
 * 创建通用 fallback 请求体
 */
export function createFallbackRequest(openaiRequest: OpenAIRequest, targetModel: string): OpenAIRequest {
  return {
    ...openaiRequest,
    model: targetModel,
  };
}

/**
 * 通用错误检查 - fallback 条件
 */
export function shouldFallbackOnError(statusCode: number): boolean {
  return statusCode >= 400;
}

/**
 * 通用重试检查
 */
export function shouldRetryOnError(statusCode: number): boolean {
  return statusCode >= 500 || statusCode === 429;
}

// 移除了旧的 parseFallbackConfig 函数，现在使用 JSON 配置