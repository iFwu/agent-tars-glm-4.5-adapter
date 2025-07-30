# TARS Agent GLM-4.5 Adapter

AI API 转换器，支持多服务提供商的 OpenAI 兼容 API，具备自动 fallback 机制。

## 功能特性

- 🔄 **自动 Fallback**: 当主服务商失败时自动切换到备用服务商
- 🎯 **智能重试**: 区分网络错误和参数错误，智能决定重试或 fallback
- ✅ **参数验证**: 使用 Zod 进行严格的参数验证，提供友好的错误提示
- 🔧 **TypeScript**: 完整的类型安全，支持类型推导和验证
- 📊 **实时日志**: 提供详细的请求日志和进度指示
- 🚀 **高性能**: 基于 Bun.js 运行时，启动快速，性能优异

## 支持的服务提供商

### 优先级顺序（自动 fallback）

1. **GLM-4.5** (智谱AI)
   - 模型: `glm-4.5`
   - 特性: tool_calls index 自动修复
   - Fallback: 400+ 错误

2. **Kimi** (月之暗面)
   - 模型: `kimi-k2-0711-preview`
   - 特性: OpenAI 兼容，直接透传
   - Fallback: 400+ 错误

3. **ModelScope** (魔搭社区)
   - 模型: `Qwen/Qwen3-Coder-480B-A35B-Instruct`
   - 特性: OpenAI 兼容，支持大 token
   - Fallback: 400+ 错误

## 安装与使用

### 环境要求

- Bun.js >= 1.0
- Node.js >= 18 (TypeScript 支持)

### 安装依赖

```bash
cd tars-agent-glm-4.5-adapter
bun install
```

### 配置环境变量

复制并编辑环境变量文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置各服务提供商的 API Key：

```env
# GLM API Configuration
GLM_API_KEY=your_glm_api_key_here
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4

# Kimi API Configuration  
KIMI_API_KEY=your_kimi_api_key_here
KIMI_BASE_URL=https://api.moonshot.cn/v1

# ModelScope API Configuration
MODELSCOPE_API_KEY=your_modelscope_api_key_here
MODELSCOPE_BASE_URL=https://api-inference.modelscope.cn/v1

# Server Configuration
PORT=3000
```

### 启动服务

```bash
# 开发模式（自动重启）
bun run dev

# 生产模式
bun run start
```

### API 使用示例

```javascript
// 使用标准 OpenAI 客户端
const response = await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo', // 实际会根据配置路由到对应服务
    messages: [
      { role: 'user', content: '你好' }
    ],
    stream: true // 必须设置为 true
  })
})
```

## API 端点

### 主要端点

- `POST /v1/chat/completions` - OpenAI 兼容的聊天完成接口
- `GET /health` - 健康检查，返回可用服务商列表
- `GET /providers` - 获取当前配置的服务提供商
- `POST /reload` - 重新加载配置

### 响应格式

标准 OpenAI SSE 流式响应格式：

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk",...}
data: [DONE]
```

## 项目结构

```
src/
├── config/          # 配置文件
│   └── providers.ts  # 服务提供商配置
├── core/            # 核心功能
│   ├── fallback-manager.ts # Fallback 管理器
│   ├── logger.ts    # 日志系统
│   └── stream.ts    # SSE 流处理
├── providers/       # 服务提供商
│   └── openai-compatible.ts # 通用 OpenAI 兼容提供商
├── transformers/    # 数据转换器
│   ├── glm.ts      # GLM 特定转换
│   ├── kimi.ts     # Kimi 转换
│   └── modelscope.ts # ModelScope 转换
├── types/          # 类型定义
│   └── index.ts    # 所有类型和 Zod schema
└── server.ts       # 主服务器文件
```

## 核心特性

### 智能 Fallback 机制

当服务请求失败时，系统会：

1. **参数验证失败**: 使用 Zod 提供详细错误信息
2. **网络错误 (5xx)**: 自动重试，达到上限后 fallback
3. **参数错误 (4xx)**: 不重试，直接 fallback
4. **fallback 提示**: 向用户发送切换提示信息

### 参数验证

使用 Zod 对不同服务商进行个性化验证：

- **GLM**: 严格的 temperature (0.01-0.99) 和 token 限制
- **Kimi**: 标准 OpenAI 参数 + 扩展 token 支持
- **ModelScope**: 大 token 支持 (最高 32K)

### 错误处理

- **友好错误**: 清晰的中文错误提示
- **错误分类**: 区分网络错误、参数错误、服务错误
- **自动恢复**: 支持服务提供商之间的无缝切换

## 开发说明

### 添加新的服务提供商

1. 在 `src/transformers/` 创建转换器
2. 在 `src/config/providers.ts` 添加配置
3. 更新环境变量模板

### 自定义验证规则

在 `src/types/index.ts` 中添加新的 Zod schema。

## 许可证

MIT License