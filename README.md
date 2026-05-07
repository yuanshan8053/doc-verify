# doc-verify

> 技术文档自动化验证工具——从源码提取事实、对照控制台校验、生成差异报告。

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-yellow.svg)](https://opensource.org/licenses/Apache-2.0)

## 为什么需要这个工具

技术文档会腐化。按钮改名了、选项增减了、标签换词了——文档还停留在旧版本。手动逐页点控制台核对，既低效又容易遗漏。

doc-verify 让 AI Agent 自动完成这件事：从源码提取 UI 事实，对照控制台验证，输出差异报告，告诉你哪里错了、怎么改。

## 工作原理

两种模式，按是否有源码选择：

| 模式 | 适用场景 | 事实来源 |
|------|---------|---------|
| **Mode A — 源码增强** | 有前端源码 | 源码 70% + 控制台 30% |
| **Mode B — 纯控制台** | 无源码 | 控制台 100% |

工作流：

```
源码 ──→ 提取 UI 事实 ──→ 交叉比对 ──→ 差异报告
              │                  ↑
              └── 采集计划 ──────┘
                                     ↑
控制台 ───→ 验证/采集事实 ───────────┘
```

## 快速开始

**前置条件**：Node.js 18+、[Playwright CLI](https://github.com/microsoft/playwright-cli)

```bash
git clone https://github.com/yuanshan8053/doc-verify.git
cd doc-verify

# 1. 初始化项目（交互式，输入控制台地址、源码路径、语言等）
node bin/doc-verify.js init

# 2. 安装 Skills 到 AI Agent 目录
node bin/doc-verify.js install

# 3. 登录控制台（浏览器打开后手动登录，完成后 Ctrl+C）
node bin/doc-verify.js login

# 4. 让 AI Agent 验证你的文档
```

初始化完成后，项目目录结构如下：

```
your-project/
├── config/project.json         # 项目配置
├── .playwright/cli.config.json # Playwright 配置
├── skills/                     # 5 个 Skill 定义
└── fact-base/iga-byteplus-en/  # 事实库（按产品-控制台-语言组织）
```

## CLI 命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `init` | 交互式创建验证项目 | `node bin/doc-verify.js init` |
| `install` | 安装 Skills 到 AI Agent 目录 | `node bin/doc-verify.js install` |
| `login` | 打开浏览器手动登录，保存认证状态 | `node bin/doc-verify.js login` |
| `console` | 一键打开浏览器 + 加载认证 + 导航到控制台 | `node bin/doc-verify.js console` |
| `login-save` | 保存当前浏览器的认证状态 | `node bin/doc-verify.js login-save` |

## Skills

doc-verify 通过 5 个 Skill 指导 AI Agent 完成验证工作流。每个 Skill 职责单一，可独立使用，也可由编排器串联：

| Skill | 职责 | 何时使用 |
|-------|------|---------|
| `ui-code-fact-extractor` | 从前端源码提取 UI 事实（通用、LLM 驱动） | 有源码时 |
| `doc-collection-planner` | 根据文档 + 源码事实生成采集计划 | 每次验证前 |
| `console-fact-collector` | 通过 Playwright CLI 从控制台采集/验证事实 | 需要控制台验证时 |
| `doc-fact-verifier` | 将文档声明与事实库比对，生成差异报告 | 事实库就绪后 |
| `doc-console-verifier` | 编排完整工作流（顶层 Skill） | 端到端验证 |

编排器工作流：

```
读取配置 → [可选] 源码提取 → 生成采集计划 → 控制台验证 → 文档比对 → 输出报告
```

## 项目结构

```
doc-verify/
├── bin/doc-verify.js           # CLI 工具
├── config/project.json         # 项目配置
├── .playwright/cli.config.json # Playwright CLI 配置
├── skills/                     # Skill 定义
│   ├── ui-code-fact-extractor/
│   ├── doc-collection-planner/
│   ├── console-fact-collector/
│   ├── doc-fact-verifier/
│   └── doc-console-verifier/
├── fact-base/                  # 运行时产物（已 gitignore）
│   └── {product}-{console}-{locale}/
│       ├── meta.json           # 产品元数据
│       ├── source-facts/       # 源码事实（.json + .md 双格式）
│       ├── console-facts/      # 控制台验证结果 + 截图
│       ├── merged-facts/       # 合并后的事实库
│       └── reports/            # 差异报告
└── package.json
```

### 事实库组织方式

事实库按 **产品-控制台-语言** 三维组织，支持多产品并行：

```
fact-base/iga-byteplus-en/      # IGA 产品，BytePlus 控制台，英文
fact-base/dcdn-volcengine-zh/   # DCDN 产品，火山引擎控制台，中文
```

每个事实文件提供 **双格式输出**：

| 格式 | 用途 |
|------|------|
| `.json` | 机器可读，供程序化比对 |
| `.md` | 人类可读，便于审阅和协作 |

## 配置说明

### project.json

| 字段 | 类型 | 说明 |
|------|------|------|
| `project` | string | 项目名称 |
| `console_url` | string | 控制台 URL |
| `source_code_path` | string \| null | 前端源码路径，为 null 则使用 Mode B |
| `docs_path` | string \| null | 文档根目录 |
| `mode` | `"source-enhanced"` \| `"console-only"` | 验证模式 |
| `locale` | string | 主语言 |
| `locales` | string[] | 所有支持的语言 |
| `fact_base` | string | 事实库路径，格式：`fact-base/{product}-{console}-{locale}` |

### Playwright CLI 配置

`.playwright/cli.config.json` 中的 `--no-sandbox` 和 `--disable-gpu-sandbox` 参数是 **Trae IDE 沙箱环境必需的**。不加这两个参数，Chrome GPU 进程会崩溃并退出（报错 `GPU process isn't usable. Goodbye.`）。

## 输出示例

差异报告示例：

```markdown
# Best practices — Solutions by scenario: Diff report

## Summary

| 指标 | 数量 |
|------|------|
| 提取声明总数 | 32 |
| 确认匹配 | 22 |
| 不匹配 | 5 |
| 未记录 | 3 |

## C1 — 缺少 AI 场景文档 [高]

**文档声明**：4 个场景（APIs、Web pages、Uploads、Other）
**控制台事实**：6 个场景，分 2 组（AI services + Generic）
**修订建议**：补充 AI services 和 AI download 两个场景的文档
```

## 常见问题

### 浏览器打开后立即关闭

**原因**：Trae IDE 沙箱与 Chrome 沙箱冲突，GPU 进程崩溃。

**解决**：确认 `.playwright/cli.config.json` 的 `launchOptions.args` 包含 `--no-sandbox` 和 `--disable-gpu-sandbox`。

### 认证状态加载后仍显示未登录

**原因**：`state-load` 只注入 cookies，已渲染的页面不会自动刷新。

**解决**：加载认证后，执行 `goto` 导航到目标 URL 触发页面刷新。

### 多步表单卡在中间步骤

**原因**：部分表单（如"添加域名"向导）需要有效测试数据才能通过验证。

**解决**：复用已有数据并修改前缀。例如，从域名列表中选一个已有域名，修改前缀后填入，通常可绕过所有权验证。

### 认证过期

**解决**：重新运行 `node bin/doc-verify.js login`，手动登录后保存新的认证状态。

## 系统要求

- Node.js 18+
- [@playwright/cli](https://github.com/microsoft/playwright-cli) >= 0.1.12
- Chromium 浏览器（通过 `npx playwright-cli install-browser chromium` 安装）
- 支持 Skills 的 AI Agent（Claude Code、Trae、Copilot 等）

## 许可证

Apache-2.0
