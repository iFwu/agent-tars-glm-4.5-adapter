# Agent TARS GLM-4.5 Adapter

AI API 转换器，支持多服务提供商的 OpenAI 兼容 API，具备自动 fallback 机制。

## 功能特性

- 🔄 **自动 Fallback**: 当主服务商失败时自动切换到备用服务商
- 🎯 **智能重试**: 区分网络错误和参数错误，智能决定重试或 fallback
- ✅ **参数验证**: 使用 Zod 进行严格的参数验证，提供友好的错误提示
- 🔧 **TypeScript**: 完整的类型安全，支持类型推导和验证
- 📊 **实时日志**: 提供详细的请求日志和进度指示
- 🚀 **高性能**: 基于 Bun.js 运行时，启动快速，性能优异

## 服务架构

### 主要服务商

**GLM-4.5** (智谱AI) - 优先使用
- 模型: `glm-4.5`
- 特性: tool_calls index 自动修复
- 高质量的中文支持

### Fallback 服务商

系统支持按配置顺序自动 fallback，内置支持：

1. **Kimi** (月之暗面)
   - 模型: `kimi-k2-0711-preview`
   - 特性: OpenAI 兼容，直接透传

2. **ModelScope** (魔搭社区)
   - 模型: `Qwen/Qwen3-Coder-480B-A35B-Instruct`
   - 特性: OpenAI 兼容，支持大 token

3. **自定义 OpenAI 兼容服务商**
   - 支持任意 OpenAI 兼容的 API
   - 可灵活配置 model/baseUrl/apiKey

## 安装与使用

### 环境要求

- Bun.js >= 1.0
- Node.js >= 18 (TypeScript 支持)

### 安装依赖

```bash
cd agent-tars-glm-4.5-adapter
bun install
```

### 配置环境变量

复制并编辑环境变量文件：

```bash
cp .env.example .env
```

#### 基本配置

```env
# GLM 主要服务商（必需）
GLM_API_KEY=your_glm_api_key_here

# Fallback 服务商（可选）
KIMI_API_KEY=your_kimi_api_key_here
MODELSCOPE_API_KEY=your_modelscope_api_key_here

# 服务器配置
PORT=3000
```

#### 高级配置 - JSON 格式 Fallback 定制

使用 `FALLBACK_PROVIDERS` 环境变量进行 JSON 配置：

```env
# 使用预定义服务商（需要对应 API Key）
FALLBACK_PROVIDERS=[{"provider":"kimi"},{"provider":"modelscope"}]

# 混合使用预定义和自定义
FALLBACK_PROVIDERS=[{"provider":"kimi"},{"model":"gpt-4","apiKey":"sk-xxx","baseUrl":"https://api.openai.com/v1"}]

# 完全自定义
FALLBACK_PROVIDERS=[{"name":"OpenAI","model":"gpt-4","apiKey":"sk-xxx","baseUrl":"https://api.openai.com/v1"},{"name":"Claude","model":"claude-3","apiKey":"sk-yyy","baseUrl":"https://api.anthropic.com/v1"}]
```

**JSON 配置字段说明：**
- `provider`: 预定义服务商名 (`kimi`, `modelscope`)
- `name`: 自定义服务商名称
- `model`: 模型名称
- `apiKey`: API 密钥
- `baseUrl`: API 基础 URL
- `timeout`: 超时时间 (毫秒)
- `maxRetries`: 最大重试次数

**默认配置：** `[{"provider":"kimi"},{"provider":"modelscope"}]`

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
├── config/              # 配置文件
│   └── providers.ts      # 服务提供商配置
├── core/                # 核心功能
│   ├── fallback-manager.ts # Fallback 管理器
│   ├── logger.ts        # 日志系统
│   ├── provider.ts      # 通用 Provider 类
│   └── stream.ts        # SSE 流处理
├── transformers/        # 数据转换器
│   ├── glm.ts          # GLM 特定转换
│   └── fallback.ts     # 通用 Fallback 转换器
├── types/              # 类型定义
│   └── index.ts        # 所有类型和 Zod schema
└── server.ts           # 主服务器文件
```

## 核心特性

### 智能 Fallback 机制

系统按以下优先级处理请求：

1. **GLM-4.5 优先**: 首先尝试 GLM-4.5 服务
2. **自动 Fallback**: GLM 失败后按配置顺序尝试 fallback 服务商
3. **错误分类处理**：
   - **参数验证失败**: 使用 Zod 提供详细错误信息
   - **网络错误 (5xx)**: 自动重试，达到上限后 fallback
   - **参数错误 (4xx)**: 不重试，直接 fallback
4. **用户通知**: 可选地向用户发送 fallback 切换提示

### 参数验证

使用 Zod 对不同服务商进行个性化验证：

- **GLM**: 严格的 temperature (0.01-0.99) 和 token 限制
- **Fallback 服务商**: 通用 OpenAI 兼容参数验证
- **灵活配置**: 支持自定义参数限制

### 错误处理

- **友好错误**: 清晰的中文错误提示
- **错误分类**: 区分网络错误、参数错误、服务错误
- **自动恢复**: 支持服务提供商之间的无缝切换

## 开发说明

### 添加新的 Fallback 服务商

#### 方式 1：使用环境变量快速添加

```env
# 添加自定义 OpenAI 兼容服务
FALLBACK_PROVIDERS=kimi,gpt-4|sk-xxx|https://api.openai.com/v1
```

#### 方式 2：添加预定义服务商

1. 在 `src/transformers/fallback.ts` 中添加到 `PREDEFINED_PROVIDERS`
2. 更新环境变量模板

### 自定义验证规则

在 `src/types/index.ts` 中添加新的 Zod schema，系统会自动选择合适的验证规则。

## 许可证

MIT License