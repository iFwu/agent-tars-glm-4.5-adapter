import { config } from 'dotenv';
import { ProviderConfig } from '../core/provider.js';
import { OpenAIRequest } from '../types/index.js';
import {
  glmTransformer,
  createGLMRequest,
  shouldGLMRetry,
  shouldGLMFallback,
} from '../transformers/glm.js';
import {
  fallbackTransformer,
  createFallbackRequest,
  shouldRetryOnError,
  shouldFallbackOnError,
  PREDEFINED_PROVIDERS,
  FallbackProviderConfig,
} from '../transformers/fallback.js';

// 加载环境变量
config();

/**
 * 创建主 GLM provider 配置
 */
function createGLMConfig(): ProviderConfig {
  return {
    name: 'GLM',
    apiKey: process.env.GLM_API_KEY || '',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4', // 固定 URL，不允许自定义
    model: 'glm-4.5',
    timeout: 3 * 60 * 1000, // 3分钟
    maxRetries: 3,
    transformer: glmTransformer,
    requestTransformer: createGLMRequest,
    shouldRetryOnError: shouldGLMRetry,
    shouldFallbackOnError: shouldGLMFallback,
  };
}

/**
 * 解析 JSON 格式的 fallback 配置
 */
function parseFallbackJSON(jsonStr: string): FallbackProviderConfig[] {
  try {
    const configs = JSON.parse(jsonStr);
    if (!Array.isArray(configs)) {
      console.warn('⚠️ FALLBACK_PROVIDERS 必须是数组格式');
      return [];
    }
    return configs;
  } catch (error) {
    console.warn('⚠️ FALLBACK_PROVIDERS JSON 解析失败，使用默认配置');
    return [];
  }
}

/**
 * 创建 fallback provider 配置
 */
function createFallbackConfigs(): ProviderConfig[] {
  // 默认配置
  const defaultConfig = JSON.stringify([
    { "provider": "kimi" },
    { "provider": "modelscope" }
  ]);
  
  const fallbackEnv = process.env.FALLBACK_PROVIDERS || defaultConfig;
  const fallbackConfigs = parseFallbackJSON(fallbackEnv);
  
  const validConfigs: ProviderConfig[] = [];
  
  for (const config of fallbackConfigs) {
    // 处理预定义 provider
    if (config.provider && config.provider in PREDEFINED_PROVIDERS) {
      const predefined = PREDEFINED_PROVIDERS[config.provider as keyof typeof PREDEFINED_PROVIDERS];
      const apiKey = config.apiKey || process.env[`${predefined.name.toUpperCase()}_API_KEY`];
      
      if (!apiKey) {
        console.warn(`⚠️ ${predefined.name} API Key 未配置，跳过该服务商`);
        continue;
      }
      
      validConfigs.push({
        name: predefined.name,
        apiKey,
        baseUrl: predefined.baseUrl,
        model: predefined.model,
        timeout: config.timeout || predefined.timeout,
        maxRetries: config.maxRetries || 3,
        transformer: fallbackTransformer,
        requestTransformer: (request: OpenAIRequest) => createFallbackRequest(request, predefined.model),
        shouldRetryOnError,
        shouldFallbackOnError,
      });
      continue;
    }
    
    // 处理自定义 provider
    if (config.model && config.apiKey && config.baseUrl) {
      validConfigs.push({
        name: config.name || `Custom-${config.model}`,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        timeout: config.timeout || 3 * 60 * 1000,
        maxRetries: config.maxRetries || 3,
        transformer: fallbackTransformer,
        requestTransformer: (request: OpenAIRequest) => createFallbackRequest(request, config.model!),
        shouldRetryOnError,
        shouldFallbackOnError,
      });
      continue;
    }
    
    console.warn(`⚠️ 无效的 fallback 配置:`, config);
  }
  
  return validConfigs;
}

/**
 * 全局服务提供商配置
 * 优先级：GLM -> Fallback1 -> Fallback2 -> ...
 */
export const providerConfigs: ProviderConfig[] = [
  createGLMConfig(),
  ...createFallbackConfigs(),
];

/**
 * 获取启用的服务提供商配置
 * 过滤掉没有 API Key 的服务商
 */
export function getEnabledProviders(): ProviderConfig[] {
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
): ProviderConfig | undefined {
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
