# MethodMate 过滤机制测试指南

本指南说明如何使用各种测试脚本来验证MethodMate项目的过滤机制功能。

## 🎯 测试概述

MethodMate项目实现了基于OR逻辑的过滤机制，支持：
- **领域过滤**：Computer Science, Arts and Humanities, Psychology, Social Sciences
- **期刊过滤**：基于venue-classification.js中的A/B/C类期刊和会议
- **时间过滤**：2020年以后发表的论文
- **质量过滤**：排除撤回论文，只包含正式文章

## 📋 可用测试脚本

### 1. 基础功能测试
```bash
# 快速基础测试（推荐首先运行）
npm run test:filter

# 或直接运行
node simple-filter-test.js
```
**功能**：测试领域过滤、期刊过滤、组合过滤的基本功能
**时间**：约30秒
**适用**：日常验证、快速检查

### 2. 边界情况测试
```bash
# 边界情况和错误处理测试
npm run test:filter:edge

# 或直接运行
node test-edge-cases.js
```
**功能**：测试特殊查询、无效输入、API容错等
**时间**：约2分钟
**适用**：全面验证、发布前检查

### 3. 性能测试
```bash
# 性能和响应时间测试
npm run test:filter:performance

# 或直接运行
node test-performance.js
```
**功能**：测试响应时间、并发处理、性能指标
**时间**：约3分钟
**适用**：性能优化、负载评估

### 4. 全面测试
```bash
# 运行完整的测试套件
npm run test:filter:full

# 或直接运行
node test-filter-comprehensive.js
```
**功能**：包含所有测试类型的完整验证
**时间**：约5分钟
**适用**：深度验证、问题诊断

### 5. 组合测试
```bash
# 运行基础+边界测试
npm run test:all
```

## 🔧 测试配置

### 测试参数配置
可以在各测试脚本中修改以下参数：

```javascript
// 基础配置
const TEST_CONFIG = {
    baseUrl: 'https://api.openalex.org/works',
    timeout: 30000,        // 请求超时时间
    maxRetries: 3,         // 最大重试次数
    delay: 1000           // 请求间隔
};
```

### 性能测试配置
```javascript
const PERFORMANCE_CONFIG = {
    warmupRequests: 3,      // 预热请求数
    testRequests: 10,       // 测试请求数
    concurrentRequests: 5,  // 并发请求数
    maxAcceptableTime: 5000 // 可接受的最大响应时间
};
```

## 📊 测试结果解读

### 成功指标
- ✅ **HTTP 200状态码**：API请求成功
- ✅ **结果数量 > 0**：找到相关论文
- ✅ **响应时间 < 10秒**：性能可接受
- ✅ **成功率 > 90%**：系统稳定性良好

### 性能评级
- 🏆 **优秀**：< 1秒平均响应时间
- 👍 **良好**：1-2秒平均响应时间
- 👌 **一般**：2-3秒平均响应时间
- ⚠️ **较慢**：3-5秒平均响应时间
- ❌ **很慢**：> 5秒平均响应时间

## 🚨 故障排除

### 常见问题

#### 1. 网络连接错误
```
❌ 测试失败: connect ENOTFOUND api.openalex.org
```
**解决方案**：
- 检查网络连接
- 确认防火墙设置
- 尝试使用代理

#### 2. 超时错误
```
❌ 测试失败: timeout of 30000ms exceeded
```
**解决方案**：
- 增加timeout配置
- 检查API服务状态
- 减少并发请求数量

#### 3. 速率限制
```
❌ 测试失败: Request failed with status code 429
```
**解决方案**：
- 增加请求间隔delay
- 减少并发请求
- 等待后重试

#### 4. 模块导入错误
```
ReferenceError: require is not defined in ES module scope
```
**解决方案**：
- 确认使用正确的ES模块语法
- 检查package.json中的"type": "module"

## 📈 测试报告

### 报告位置
测试报告会自动保存到：
```
server/test-reports/filter-test-report-[timestamp].json
```

### 报告内容
```json
{
  "summary": {
    "totalTests": 15,
    "passed": 14,
    "failed": 1,
    "successRate": "93%",
    "totalTime": "45s"
  },
  "details": [...],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 🔄 持续集成

### 在CI/CD中使用
```yaml
# GitHub Actions 示例
- name: Test Filter Mechanism
  run: |
    cd server
    npm run test:filter
    npm run test:filter:edge
```

### 定期测试建议
- **开发阶段**：运行 `npm run test:filter`
- **代码提交前**：运行 `npm run test:all`
- **发布前**：运行 `npm run test:filter:full`
- **生产监控**：定期运行 `npm run test:filter:performance`

## 📝 自定义测试

### 添加新测试用例
在相应的测试文件中添加：

```javascript
// 在 simple-filter-test.js 中添加
const customTestQueries = [
    'your custom query 1',
    'your custom query 2'
];
```

### 修改期刊列表
更新 `server/config/venue-openalex-mapping.js` 文件：

```javascript
const NEW_JOURNAL_IDS = [
    'S12345678',  // 新期刊ID
    'S87654321'   // 另一个期刊ID
];
```

## 🎯 最佳实践

1. **定期运行测试**：确保过滤机制持续正常工作
2. **监控性能**：关注响应时间变化趋势
3. **更新测试用例**：根据业务需求调整测试查询
4. **保存测试记录**：建立测试历史数据库
5. **自动化测试**：集成到CI/CD流程中

## 📞 支持

如果遇到测试相关问题：
1. 检查本指南的故障排除部分
2. 查看测试报告的详细错误信息
3. 确认网络和API服务状态
4. 联系开发团队获取支持

---

*最后更新：2024年1月*
