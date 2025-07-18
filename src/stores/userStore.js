import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getApiBaseUrl } from '../config/environment.js'

export const useUserStore = defineStore('user', () => {
  // 状态
  const user = ref(null)
  const token = ref(localStorage.getItem('token') || null)
  const loading = ref(false)

  // 计算属性
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const isLoading = computed(() => loading.value)

  // 设置认证头
  const getAuthHeaders = () => {
    return {
      'Content-Type': 'application/json',
      ...(token.value && { 'Authorization': `Bearer ${token.value}` })
    }
  }

  // 处理API错误
  const handleApiError = (error, response) => {
    if (response?.status === 401) {
      // Token过期或无效，清除用户状态
      logout()
      throw new Error('登录已过期，请重新登录')
    }
    
    if (response?.status === 403) {
      throw new Error('权限不足')
    }
    
    if (response?.status >= 500) {
      throw new Error('服务器错误，请稍后重试')
    }
    
    throw error
  }

  // 用户注册
  const register = async (username, email, password) => {
    loading.value = true
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username,
          email,
          password
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '注册失败')
      }

      if (data.success) {
        // 注册成功，保存用户信息和token
        user.value = data.user
        token.value = data.token
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        
        // 注册成功后加载用户数据（对于新用户应该是空的）
        try {
          const { loadUserData } = await import('./chatStore.js')
          await loadUserData()
        } catch (loadError) {
          console.error('注册后加载用户数据失败:', loadError)
        }
        
        return data
      } else {
        throw new Error(data.error || '注册失败')
      }
    } catch (error) {
      console.error('注册错误:', error)
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('网络连接失败，请检查网络连接')
      }
      throw error
    } finally {
      loading.value = false
    }
  }

  // 用户登录
  const login = async (username, password) => {
    loading.value = true
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username,
          password
        })
      })

      const data = await response.json()

      if (!response.ok) {
        handleApiError(new Error(data.error || '登录失败'), response)
      }

      if (data.success) {
        // 登录成功，保存用户信息和token
        user.value = data.user
        token.value = data.token
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        
        // 登录成功后加载用户数据
        try {
          const { loadUserData } = await import('./chatStore.js')
          await loadUserData()
        } catch (loadError) {
          console.error('加载用户数据失败:', loadError)
        }
        
        return data
      } else {
        throw new Error(data.error || '登录失败')
      }
    } catch (error) {
      console.error('登录错误:', error)
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('网络连接失败，请检查网络连接')
      }
      throw error
    } finally {
      loading.value = false
    }
  }

  // 获取用户信息
  const fetchUserInfo = async () => {
    if (!token.value) {
      throw new Error('未找到访问令牌')
    }

    loading.value = true
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
        method: 'GET',
        headers: getAuthHeaders()
      })

      const data = await response.json()

      if (!response.ok) {
        handleApiError(new Error(data.error || '获取用户信息失败'), response)
      }

      if (data.success) {
        user.value = data.user
        localStorage.setItem('user', JSON.stringify(data.user))
        return data.user
      } else {
        throw new Error(data.error || '获取用户信息失败')
      }
    } catch (error) {
      console.error('获取用户信息错误:', error)
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('网络连接失败，请检查网络连接')
      }
      throw error
    } finally {
      loading.value = false
    }
  }

  // 用户登出
  const logout = async () => {
    // 清理用户数据
    try {
      const { 
        clearMessages, 
        papersState, 
        historyState,
        currentPlanState 
      } = await import('./chatStore.js')
      
      // 只清理前端状态，不清理数据库
      papersState.referencedPapers.clear()
      papersState.referencedPapersList = []
      papersState.recommendedPapers = []
      papersState.selectedPaper = null
      
      historyState.historyPlans = []
      historyState.currentViewingPlan = null
      historyState.currentAppliedPlanId = null
      
      // 重置当前方案为默认状态
      currentPlanState.isGenerated = false
      
      clearMessages()
      console.log('已清理用户数据')
    } catch (clearError) {
      console.error('清理用户数据失败:', clearError)
    }
    
    // 清除新手引导状态，让新账号显示新手引导
    localStorage.removeItem('paperDetail_tutorial_shown')
    localStorage.removeItem('researchPlanDetail_tutorial_shown')
    console.log('已清除新手引导状态，新账号将显示新手引导')
    
    user.value = null
    token.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('currentConversationId') // 清除保存的对话ID
  }

  // 初始化用户状态（从localStorage恢复）
  const initializeUser = async () => {
    const savedToken = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    
    if (savedToken && savedUser) {
      try {
        token.value = savedToken
        user.value = JSON.parse(savedUser)
        
        // 验证token是否仍然有效
        await fetchUserInfo()
        
        // token有效，加载用户数据
        try {
          const { loadUserData } = await import('./chatStore.js')
          await loadUserData()
        } catch (loadError) {
          console.error('初始化时加载用户数据失败:', loadError)
        }
      } catch (error) {
        console.error('初始化用户状态失败:', error)
        // 如果token无效，清除本地存储
        await logout()
      }
    }
  }

  // 检查认证状态
  const checkAuth = () => {
    return !!token.value && !!user.value
  }

  return {
    // 状态
    user: computed(() => user.value),
    token: computed(() => token.value),
    loading,
    
    // 计算属性
    isAuthenticated,
    isLoading,
    
    // 方法
    register,
    login,
    logout,
    fetchUserInfo,
    initializeUser,
    checkAuth,
    getAuthHeaders
  }
}) 