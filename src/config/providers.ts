import { config } from 'dotenv';
import { OpenAICompatibleConfig } from '../providers/openai-compatible.js';
import {
  glmTransformer,
  createGLMRequest,
  shouldGLMRetry,
  shouldGLMFallback,
} from '../transformers/glm.js';
import {
  kimiTransformer,
  createKimiRequest,
  shouldKimiRetry,
  shouldKimiFallback,
} from '../transformers/kimi.js';
import {
  modelscopeTransformer,
  createModelScopeRequest,
  shouldModelScopeRetry,
  shouldModelScopeFallback,
} from '../transformers/modelscope.js';

// 加载环境变量
config();

/**
 * 全局服务提供商配置
 * 按优先级排序：GLM -> Kimi -> ModelScope
 */
export const providerConfigs: OpenAICompatibleConfig[] = [
  {
    name: 'GLM',
    apiKey: process.env.GLM_API_KEY || '',
    baseUrl: process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.5',
    timeout: 3 * 60 * 1000, // 3分钟
    maxRetries: 3,
    transformer: glmTransformer,
    requestTransformer: createGLMRequest,
    shouldRetryOnError: shouldGLMRetry,
    shouldFallbackOnError: shouldGLMFallback,
  },
  {
    name: 'ModelScope',
    apiKey: process.env.MODELSCOPE_API_KEY || '',
    baseUrl:
      process.env.MODELSCOPE_BASE_URL ||
      'https://api-inference.modelscope.cn/v1',
    model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    timeout: 3 * 60 * 1000,
    maxRetries: 3,
    transformer: modelscopeTransformer,
    requestTransformer: createModelScopeRequest,
    shouldRetryOnError: shouldModelScopeRetry,
    shouldFallbackOnError: shouldModelScopeFallback,
  },
  {
    name: 'Kimi',
    apiKey: process.env.KIMI_API_KEY || '',
    baseUrl: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
    model: 'kimi-k2-0711-preview',
    timeout: 5 * 60 * 1000, // Kimi token 慢，设置更长超时
    maxRetries: 3,
    transformer: kimiTransformer,
    requestTransformer: createKimiRequest,
    shouldRetryOnError: shouldKimiRetry,
    shouldFallbackOnError: shouldKimiFallback,
  },
];

/**
 * 获取启用的服务提供商配置
 * 过滤掉没有 API Key 的服务商
 */
export function getEnabledProviders(): OpenAICompatibleConfig[] {
  return providerConfigs.filter((config) => {
    if (!config.apiKey) {
      console.warn(`⚠️ ${config.name} API Key 未配置，跳过该服务商`);
      return false;
    }
    return true;
  });
}

/**
 * 按名称获取服务提供商配置
 */
export function getProviderByName(
  name: string
): OpenAICompatibleConfig | undefined {
  return providerConfigs.find(
    (config) => config.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * 验证配置
 */
export function validateProviderConfigs(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const enabledProviders = getEnabledProviders();

  if (enabledProviders.length === 0) {
    errors.push('没有可用的服务提供商，请检查环境变量配置');
  }

  enabledProviders.forEach((config) => {
    if (!config.baseUrl) {
      errors.push(`${config.name}: baseUrl 未配置`);
    }

    try {
      new URL(config.baseUrl);
    } catch {
      errors.push(`${config.name}: baseUrl 格式无效`);
    }

    if (!config.model) {
      errors.push(`${config.name}: model 未配置`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
