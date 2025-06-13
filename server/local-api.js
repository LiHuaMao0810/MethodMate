import express from 'express';
import cors from 'cors';
import https from 'https';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载.env文件
dotenv.config({ path: join(__dirname, '..', '.env') });

const app = express();
const PORT = 3002;

// API配置
const SEMANTIC_API_BASE = 'https://api.semanticscholar.org/graph/v1';
const CORE_API_BASE = 'https://api.core.ac.uk/v3';
const CORE_API_KEY = process.env.CORE_API_KEY;
const SEMANTIC_API_KEY = process.env.SEMANTIC_API_KEY || '';

// 简单的重试函数
const fetchWithRetry = async (url, options, retries = 3, delay = 1000) => {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries <= 1) throw err;
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(url, options, retries - 1, delay * 2);
  }
};

if (!CORE_API_KEY) {
  console.warn('CORE_API_KEY not found in environment variables');
  console.log('Available environment variables:', Object.keys(process.env).filter(key => !key.includes('SECRET')));
} else {
  console.log('CORE_API_KEY found:', CORE_API_KEY.substring(0, 4) + '...');
}

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// 添加根路由重定向到测试页面
app.get('/', (req, res) => {
  res.redirect('/test-core-api.html');
});

// 从CORE API获取论文全文
const getFullTextFromCore = async (title) => {
  try {
    console.log(`正在从CORE API获取论文全文，标题: "${title}"`);
    
    // 使用标题搜索论文
    const searchResponse = await fetch(`${CORE_API_BASE}/search/works`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CORE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: title,
        limit: 1,
        fields: ['title', 'fullText', 'abstract']
      })
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error(`CORE API错误响应 (${searchResponse.status}):`, errorText);
      throw new Error(`CORE API responded with status: ${searchResponse.status}`);
    }

    const result = await searchResponse.json();
    console.log('CORE API搜索结果:', JSON.stringify(result, null, 2));
    
    if (result.results && result.results.length > 0) {
      // 如果有全文就返回全文，否则返回摘要
      const paper = result.results[0];
      if (paper.fullText) {
        console.log('找到论文全文');
        return paper.fullText;
      } else if (paper.abstract) {
        console.log('未找到全文，使用摘要代替');
        return paper.abstract;
      }
    }
    
    console.log('未找到相关论文信息');
    return null;
  } catch (error) {
    console.error('从CORE获取全文时出错:', error);
    console.error('错误堆栈:', error.stack);
    return null;
  }
};

// 解析语义学术API响应
const parseSemanticResponse = async (papers) => {
  // 定义允许的期刊/会议列表
  const allowedVenues = [
    // 顶会
    'Computer-Supported Cooperative Work', 'CSCW',
    'Human Factors in Computing Systems', 'CHI',
    'Pervasive and Ubiquitous Computing', 'UbiComp',
    'User Interface Software and Technology', 'UIST',
    
    // 顶刊
    'Computers in Human Behavior',
    'CoDesign',
    'Technovation',
    'Design Studies',
    'Journal of Mixed Methods Research',
    'ACM Transactions on Computer-Human Interaction', 'TOCHI',
    'International Journal of Human-Computer Studies',
    'Design Issues',
    'Human-Computer Interaction',
    'Computer-Aided Design',
    'Applied Ergonomics',
    'International Journal of Design',
    'Human Factors',
    'Leonardo',
    'The Design Journal'
  ];

  const parsedPapers = [];
  
  for (const paper of papers) {
    // 添加延迟，避免请求过于频繁
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 获取论文全文
    const fullText = await getFullTextFromCore(paper.title);
    
    // 检查是否是顶会顶刊
    const venue = paper.venue || '';
    const venueLower = venue.toLowerCase();
    
    // 更精确的顶会顶刊判断逻辑
    const isTopVenue = allowedVenues.some(allowedVenue => {
      const allowedLower = allowedVenue.toLowerCase();
      
      // 完全匹配
      if (venueLower === allowedLower) return true;
      
      // 处理简写形式的精确匹配
      if (allowedLower === 'cscw' && (venueLower === 'cscw' || venueLower.includes('computer-supported cooperative work'))) return true;
      if (allowedLower === 'chi' && (venueLower === 'chi' || venueLower.includes('human factors in computing systems'))) return true;
      if (allowedLower === 'ubicomp' && (venueLower === 'ubicomp' || venueLower.includes('pervasive and ubiquitous computing'))) return true;
      if (allowedLower === 'uist' && (venueLower === 'uist' || venueLower.includes('user interface software and technology'))) return true;
      if (allowedLower === 'tochi' && (venueLower === 'tochi' || venueLower.includes('transactions on computer-human interaction'))) return true;
      
      // 对于其他期刊，使用更严格的匹配规则
      // 检查是否是完整的子字符串，而不是部分匹配
      const words = allowedLower.split(' ');
      if (words.length > 1) {
        // 对于多词名称，要求完整匹配或作为独立短语出现
        return venueLower === allowedLower || 
               venueLower.includes(` ${allowedLower} `) || 
               venueLower.startsWith(`${allowedLower} `) || 
               venueLower.endsWith(` ${allowedLower}`);
      }
      
      // 对于单词名称，要求是完整的单词匹配
      return venueLower === allowedLower || 
             venueLower.includes(` ${allowedLower} `) || 
             venueLower.startsWith(`${allowedLower} `) || 
             venueLower.endsWith(` ${allowedLower}`);
    });
    
    console.log(`Venue: "${venue}", isTopVenue: ${isTopVenue}`);
    
    parsedPapers.push({
      title: paper.title,
      abstract: paper.abstract || '暂无摘要',
      downloadUrl: (paper.openAccessPdf && paper.openAccessPdf.url) || paper.url || null,
      // 添加额外的语义学术特有信息
      year: paper.year,
      citationCount: paper.citationCount,
      authors: (paper.authors && paper.authors.map(author => author.name).join(', ')) || '未知作者',
      venue: venue,
      // 添加全文字段
      fullText: fullText || null,
      // 添加是否是顶会顶刊的标记
      isTopVenue: isTopVenue
    });
  }
  
  return parsedPapers;
};

// Scholar Search API路由
app.post('/api/scholar-search', async (req, res) => {
  console.log('Scholar Search API被调用');
  
  try {
    const { query, num_results = 10, lang = 'zh-CN', filter_venues = false } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        success: false,
        error: 'Query parameter is required' 
      });
    }

    console.log(`执行学术搜索，查询: "${query}", 结果数: ${num_results}, 语言: ${lang}`);
    
    // 定义允许的期刊/会议列表
    const allowedVenues = [
      // 顶会
      'Computer-Supported Cooperative Work', 'CSCW',
      'Human Factors in Computing Systems', 'CHI',
      'Pervasive and Ubiquitous Computing', 'UbiComp',
      'User Interface Software and Technology', 'UIST',
      
      // 顶刊
      'Computers in Human Behavior',
      'CoDesign',
      'Technovation',
      'Design Studies',
      'Journal of Mixed Methods Research',
      'ACM Transactions on Computer-Human Interaction', 'TOCHI',
      'International Journal of Human-Computer Studies',
      'Design Issues',
      'Human-Computer Interaction',
      'Computer-Aided Design',
      'Applied Ergonomics',
      'International Journal of Design',
      'Human Factors',
      'Leonardo',
      'The Design Journal'
    ];
    
    // 构建 Semantic Scholar API 请求
    // 根据最新的API文档调整字段，移除不支持的doi字段
    const fields = 'title,authors,abstract,year,citationCount,venue,url,openAccessPdf,externalIds';
    
    // 构建基本查询参数，不进行任何编码
    let searchUrl = `${SEMANTIC_API_BASE}/paper/search?query=${query}&limit=${num_results}&fields=${fields}`;
    
    // 如果需要过滤期刊/会议，使用venue参数
    if (filter_venues) {
      // 直接使用原始venue名称，用逗号连接
      const venueParam = allowedVenues.join(',');
      // 直接添加到URL中，不进行编码
      searchUrl += `&venue=${venueParam}`;
    }
    
    console.log('请求URL:', searchUrl);
    
    // 准备请求头
    const headers = {
      'Accept': 'application/json',
    };
    
    
    
    // 使用重试机制发送请求
    const response = await fetchWithRetry(searchUrl, {
      headers: headers
    }, 3, 1000); // 最多重试3次，初始延迟1秒

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Semantic Scholar API错误响应 (${response.status}):`, errorText);
      throw new Error(`Semantic Scholar API responded with status: ${response.status}`);
    }

    const searchData = await response.json();
    console.log('Semantic Scholar API响应:', JSON.stringify(searchData, null, 2));
    
    // 检查是否有搜索结果
    if (!searchData.data || searchData.data.length === 0) {
      console.log('没有找到匹配的论文');
      return res.json({
        success: true,
        query: query,
        results: [],
        total_results: 0
      });
    }
    
    // 转换结果
    const results = searchData.data.map(paper => {
      const venue = paper.venue || '';
      
      // 更精确的顶会顶刊判断逻辑
      const isTopVenue = allowedVenues.some(allowedVenue => {
        const allowedLower = allowedVenue.toLowerCase();
        const venueLower = venue.toLowerCase();
        
        // 完全匹配
        if (venueLower === allowedLower) return true;
        
        // 处理简写形式的精确匹配
        if (allowedLower === 'cscw' && (venueLower === 'cscw' || venueLower.includes('computer-supported cooperative work'))) return true;
        if (allowedLower === 'chi' && (venueLower === 'chi' || venueLower.includes('human factors in computing systems'))) return true;
        if (allowedLower === 'ubicomp' && (venueLower === 'ubicomp' || venueLower.includes('pervasive and ubiquitous computing'))) return true;
        if (allowedLower === 'uist' && (venueLower === 'uist' || venueLower.includes('user interface software and technology'))) return true;
        if (allowedLower === 'tochi' && (venueLower === 'tochi' || venueLower.includes('transactions on computer-human interaction'))) return true;
        
        // 对于其他期刊，使用更严格的匹配规则
        // 检查是否是完整的子字符串，而不是部分匹配
        // 例如，"design studies"应该匹配"design studies"，但不应该匹配"design studies in earth science"
        const words = allowedLower.split(' ');
        if (words.length > 1) {
          // 对于多词名称，要求完整匹配或作为独立短语出现
          return venueLower === allowedLower || 
                 venueLower.includes(` ${allowedLower} `) || 
                 venueLower.startsWith(`${allowedLower} `) || 
                 venueLower.endsWith(` ${allowedLower}`);
        }
        
        // 对于单词名称，要求是完整的单词匹配
        return venueLower === allowedLower || 
               venueLower.includes(` ${allowedLower} `) || 
               venueLower.startsWith(`${allowedLower} `) || 
               venueLower.endsWith(` ${allowedLower}`);
      });
      
      console.log(`Scholar Search - Venue: "${venue}", isTopVenue: ${isTopVenue}`);
      
      return {
        title: paper.title || '',
        authors: paper.authors?.map(author => author.name) || [],
        journal: venue,
        year: paper.year?.toString() || '',
        citations: paper.citationCount || 0,
        summary: paper.abstract || '',
        pdf_url: paper.openAccessPdf?.url || null,
        scholar_url: paper.url || '',
        doi: paper.externalIds?.DOI || '',
        relevance_score: 0.9, // Semantic Scholar API 目前不返回相关性分数
        isTopVenue: isTopVenue // 标记是否来自顶会顶刊
      };
    });

    res.json({
      success: true,
      query: query,
      results: results,
      total_results: results.length
    });
  } catch (error) {
    console.error('Scholar Search Error:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

// 语义推荐API路由
app.post('/api/semantic-recommend', async (req, res) => {
  console.log('语义推荐API被调用');
  
  try {
    const { chatHistory = [], filter_venues = false } = req.body;
    console.log('接收到的数据:', JSON.stringify(req.body, null, 2));
    
    // 从聊天历史中提取关键词
    let searchQuery = '';
    
    // 如果有有效的聊天历史，从中提取关键信息
    const validHistory = chatHistory.filter(msg => 
      msg.type === 'user' || (msg.type === 'assistant' && !msg.isError)
    );
    
    if (validHistory.length > 1) {
      // 从最近的对话中提取关键词
      const recentHistory = validHistory.slice(-4); // 只取最近4条消息
      searchQuery = recentHistory
        .map(msg => msg.content)
        .join(' ')
        .replace(/[^\w\s]/g, ' ') // 移除标点符号
        .split(/\s+/)
        .filter(word => word.length > 2) // 过滤掉太短的词
        .slice(0, 10) // 只取前10个关键词
        .join(' ');
    } else {
      // 默认搜索研究方法相关文献
      searchQuery = 'research methodology quantitative analysis experimental design';
    }

    console.log('构建的搜索查询:', searchQuery);

    // 定义允许的期刊/会议列表
    const allowedVenues = [
      // 顶会
      'Computer-Supported Cooperative Work', 'CSCW',
      'Human Factors in Computing Systems', 'CHI',
      'Pervasive and Ubiquitous Computing', 'UbiComp',
      'User Interface Software and Technology', 'UIST',
      
      // 顶刊
      'Computers in Human Behavior',
      'CoDesign',
      'Technovation',
      'Design Studies',
      'Journal of Mixed Methods Research',
      'ACM Transactions on Computer-Human Interaction', 'TOCHI',
      'International Journal of Human-Computer Studies',
      'Design Issues',
      'Human-Computer Interaction',
      'Computer-Aided Design',
      'Applied Ergonomics',
      'International Journal of Design',
      'Human Factors',
      'Leonardo',
      'The Design Journal'
    ];

    // 构建基本查询参数，不进行任何编码
    let searchUrl = `${SEMANTIC_API_BASE}/paper/search?query=${searchQuery}&limit=5&fields=title,abstract,url,openAccessPdf,year,citationCount,authors,venue`;
    
    // 如果需要过滤期刊/会议，使用venue参数
    if (filter_venues) {
      // 直接使用原始venue名称，用逗号连接
      const venueParam = allowedVenues.join(',');
      // 直接添加到URL中，不进行编码
      searchUrl += `&venue=${venueParam}`;
    }

    // 调用Semantic Scholar API搜索相关论文
    const searchResponse = await fetch(
      searchUrl,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Semantic Scholar API错误响应:', errorText);
      throw new Error(`Semantic Scholar API responded with status: ${searchResponse.status}`);
    }

    const result = await searchResponse.json();
    console.log('语义学术API响应:', JSON.stringify(result, null, 2));

    // 检查是否有搜索结果
    if (!result.data || result.data.length === 0) {
      console.log('没有找到匹配的论文');
      return res.json({
        success: true,
        papers: [],
        rawResponse: JSON.stringify(result),
        session_id: (req.body && req.body.session_id) || 'default'
      });
    }

    // 解析返回的论文数据
    const papers = await parseSemanticResponse(result.data);

    res.json({
      success: true,
      papers: papers,
      rawResponse: JSON.stringify(result.data),
      session_id: (req.body && req.body.session_id) || 'default'
    });
  } catch (error) {
    console.error('推荐API错误:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({ 
      success: false,
      error: error.message,
      papers: [],
      rawResponse: `错误：${error.message}`,
      session_id: (req.body && req.body.session_id) || 'default'
    });
  }
});

// 测试CORE API路由
app.post('/api/test-core', async (req, res) => {
  try {
    const { title } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: '需要提供论文标题' });
    }

    console.log('测试CORE API，搜索标题:', title);
    const fullText = await getFullTextFromCore(title);
    
    res.json({
      success: true,
      title: title,
      fullText: fullText,
      hasContent: !!fullText
    });
  } catch (error) {
    console.error('CORE API测试错误:', error);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 本地API服务器运行在 http://localhost:${PORT}`);
}); 