# MVP 性能基线报告

> 目标：在进入 Phase 3 前锁定一组可对比的性能基线，作为后续回归告警的阈值。
>
> 每次 CI 对比该文件记录的历史值，偏移 > 30% 触发 review。

## 采集方法

| 维度 | 工具 | 场景 |
|------|------|------|
| 后端 Move 耗时 | `packages/bot/scripts/perf-baseline.ts` | 200 局 × 5 玩家 × 25 回合简化战斗 |
| 前端 Web Vitals | `packages/e2e/tests-offline/perf-web-vitals.spec.ts` | prod 构建 + `vite preview` + Chromium |

运行命令：

```bash
# 后端 Move 基线
pnpm --filter @icgame/bot perf

# 前端 Web Vitals 基线（自动 kill → build → preview）
pnpm --filter @icgame/e2e test:offline
```

## 基线值（2026-04-19 记录）

### 后端 · Move 耗时分布（advanceStep）

| 指标 | 值 | 预算 | 状态 |
|------|---:|-----:|------|
| Step avg | 0.3μs | 1ms | ✅ |
| Step p50 | 0.2μs | 1ms | ✅ |
| Step p95 | 0.6μs | 2ms | ✅ |
| Step p99 | 1.4μs | 5ms | ✅ |
| 吞吐 | 1.49M steps/s | > 100k | ✅ |
| 单局 p95 | 117.7μs | 50ms | ✅ |
| 单局 p99 | 455.7μs | 200ms | ✅ |

**说明**：当前 `advanceStep` 仍为简化 move（drawPhase + 弃牌 + rotateToNextPlayer），真实 engine move（含 SHOOT/解封等）接入后基线会上调。

### 前端 · Web Vitals（首页 `/`）

| 指标 | 值 | 预算（MVP） | Core Web Vitals 阈值 | 状态 |
|------|---:|-------:|---------------------:|------|
| FCP | 68ms | < 2000ms | < 1800ms | ✅ |
| LCP | 364ms | < 3500ms | < 2500ms | ✅ |
| CLS | 0 | < 0.25 | < 0.1 | ✅ |
| domContentLoaded | 37ms | < 3000ms | — | ✅ |
| loadComplete | 37ms | — | — | ✅ |
| /local DOM ready | 67ms | < 5000ms | — | ✅ |

**测试环境**：macOS Apple Silicon，本地 `vite preview` 无网络延迟；在弱网 / 真机场景会大幅劣化，**这组值仅作"算法性能"下界**。

## 回归门（MVP 阶段）

| 事件 | 动作 |
|------|------|
| Move p95 > 2ms | 触发 CI 告警，查 engine/bot 热点 |
| FCP > 2s (lab) | 检查首屏 JS bundle 是否回归（Vite 构建分析） |
| LCP > 3.5s (lab) | 图像/字体加载路径异常 |
| CLS > 0.25 | 布局跳动，检查未保留空间的图片/延迟组件 |

## 生成产物

- `packages/bot/perf-baseline.json`（每次 `pnpm --filter @icgame/bot perf` 覆写）
- `packages/e2e/perf-web-vitals.json`（每次 `pnpm test:offline` 覆写）

两个文件已加入 `.gitignore`，避免每次提交都产生 diff。CI 可将历史值归档到独立存储或 artifact。

## 后续规划

- Phase 3 前：接入真实 engine move 后重跑基线并更新本文件
- Phase 4：引入 Lighthouse CI + Web Vitals 实时上报（前端 `web-vitals` 库），区分 lab / field
- Phase 5：真机 + 弱网（iPhone 12 / 小米 10 / 4G）补一组外场基线
