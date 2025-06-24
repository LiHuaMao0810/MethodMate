# 本地缓存优先功能验证指南

## 🎯 验证目标
确认文献推荐功能是否会优先从本地缓存搜索，然后再调用外部API补充结果。

## 📋 验证步骤

### 步骤1：通过前端界面添加论文到缓存

1. **启动前端应用**
   ```bash
   npm run dev
   ```

2. **访问文献推荐页面**
   - 打开浏览器访问 `http://localhost:5173`
   - 进入"文献推荐"页面

3. **获取一些推荐文献**
   - 在关键词输入框中输入："research methods"
   - 点击"获取相关文献"按钮
   - 等待获取到一些论文结果

4. **保存论文到本地缓存**
   - 点击某篇论文查看详情
   - 在论文详情页右上角点击"保存到本地"按钮
   - 确认看到"已保存"或"已更新"的状态提示
   - 重复操作，保存2-3篇论文

### 步骤2：验证缓存搜索功能

1. **测试缓存API**
   - 打开新的终端窗口
   - 执行以下命令：
   ```bash
   curl -X POST http://localhost:3004/api/paper-cache/search \
     -H "Content-Type: application/json" \
     -d "{\"query\": \"research methods\", \"limit\": 5}"
   ```

2. **查看结果**
   - 如果返回的JSON中包含论文数组，说明缓存功能正常
   - 记录返回的论文数量

### 步骤3：验证Scholar Search的本地优先功能

1. **清除浏览器缓存**
   - 清除浏览器缓存和Cookie
   - 或使用无痕浏览模式

2. **执行搜索测试**
   ```bash
   curl -X POST http://localhost:3004/api/scholar-search \
     -H "Content-Type: application/json" \
     -d "{\"query\": \"research methods\", \"num_results\": 5, \"lang\": \"zh-CN\"}"
   ```

3. **分析返回结果**
   查看JSON响应中的关键字段：
   - `cache_hits`: 本地缓存命中数量
   - `external_hits`: 外部API调用数量
   - `results[].from_cache`: 每篇论文是否来自缓存

### 步骤4：查看服务器日志

1. **观察服务器控制台输出**
   在运行Scholar Search API时，应该能看到类似的日志：
   ```
   🔍 首先从本地缓存搜索...
   📚 本地缓存找到 X 篇论文
   🌐 本地结果不足，继续外部搜索...
   ```

2. **验证逻辑流程**
   - 确认日志显示"首先从本地缓存搜索"
   - 确认显示找到的缓存论文数量
   - 如果缓存结果不足，确认继续外部搜索

## ✅ 预期结果

### 正常工作的标志：
1. **缓存API正常**：`/api/paper-cache/search` 能返回保存的论文
2. **本地优先生效**：`cache_hits > 0` 在Scholar Search结果中
3. **混合结果**：返回结果既包含缓存论文（`from_cache: true`）也包含外部论文（`from_cache: false`）
4. **日志确认**：服务器日志显示"首先从本地缓存搜索"

### 问题排查：

如果 `cache_hits = 0`：
1. 检查论文是否成功保存到缓存
2. 检查搜索关键词是否匹配
3. 检查数据库连接是否正常

如果保存失败：
1. 检查数据库表 `paper_cache` 是否存在
2. 检查数据库连接配置
3. 查看服务器错误日志

## 🔧 快速测试命令

```bash
# 1. 测试缓存搜索
curl -X POST http://localhost:3004/api/paper-cache/search -H "Content-Type: application/json" -d "{\"query\": \"research\", \"limit\": 5}"

# 2. 测试Scholar Search（应显示本地优先）
curl -X POST http://localhost:3004/api/scholar-search -H "Content-Type: application/json" -d "{\"query\": \"research methods\", \"num_results\": 5}"

# 3. 获取缓存统计
curl http://localhost:3004/api/paper-cache/stats
```

## 📊 成功验证的JSON示例

成功的Scholar Search响应应该类似：
```json
{
  "success": true,
  "total_results": 5,
  "cache_hits": 2,
  "external_hits": 3,
  "results": [
    {
      "title": "本地缓存的论文标题",
      "from_cache": true,
      ...
    },
    {
      "title": "外部API的论文标题", 
      "from_cache": false,
      ...
    }
  ]
}
```

这表明系统正确地：
1. 优先从本地缓存找到了2篇论文
2. 然后从外部API补充了3篇论文
3. 总共返回了5篇论文的混合结果 