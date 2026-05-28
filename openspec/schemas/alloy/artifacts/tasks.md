# tasks 制品指令

产出: tasks.md（层级编号 checkbox 清单）
依赖: specs + design

## 生成指令

1. 读取 specs（确定"做什么"）
2. 读取 design（确定"怎么做"）
3. 将实现拆分为层级编号的 checkbox 清单
4. 粗粒度追踪整体进度

## 约束

- 任务粒度适中（每个 task 对应一个可独立交付的功能单元）
- 不涉及 TDD 微步骤（留给 plan 制品处理）
