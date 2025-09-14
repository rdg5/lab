import { AuthUser } from '../test/utils/test-utils'

export interface SignInResponse {
  user: AuthUser
  token: string
  refreshToken: string
  expiresAt: Date
}

export interface UpdateProfileData {
  name?: string
  email?: string
  avatar?: string
  preferences?: {
    theme?: 'light' | 'dark' | 'system'
    language?: string
    timezone?: string
  }
  settings?: {
    notifications?: boolean
    autoSync?: boolean
    emailUpdates?: boolean
  }
}

class AuthServiceClass {
  private readonly TOKEN_KEY = 'auth_token'
  private readonly REFRESH_TOKEN_KEY = 'auth_refresh_token'
  private readonly API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3000/api'
  private authStateListeners: Set<(user: AuthUser | null) => void> = new Set()

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getStoredToken()
    const url = `${this.API_BASE_URL}${endpoint}`
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const error = new Error(errorData.message || `API request failed: ${response.statusText}`)
      
      // Add error names for specific cases
      if (response.status === 429) {
        error.name = 'RateLimitError'
      } else if (response.status === 403 && errorData.code === 'CSRF_ERROR') {
        error.name = 'CSRFError'
      } else if (errorData.code === 'SUSPICIOUS_LOGIN') {
        error.name = 'SuspiciousLoginError'
      }
      
      throw error
    }

    return response.json()
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const token = this.getStoredToken()
    if (!token) {
      return null
    }

    try {
      const user = await this.request<AuthUser>('/auth/me')
      return user
    } catch (error) {
      // Clear invalid token
      this.clearStoredToken()
      throw error
    }
  }

  async signInWithGoogle(): Promise<AuthUser> {
    return this.initiateOAuthFlow('google')
  }

  async signInWithGitHub(): Promise<AuthUser> {
    return this.initiateOAuthFlow('github')
  }

  async signInWithMicrosoft(): Promise<AuthUser> {
    return this.initiateOAuthFlow('microsoft')
  }

  private async initiateOAuthFlow(provider: string): Promise<AuthUser> {
    const popup = window.open(
      `${this.API_BASE_URL}/auth/${provider}`,
      'oauth_popup',
      'width=500,height=600,scrollbars=yes,resizable=yes'
    )

    if (!popup) {
      const error = new Error('Popup blocked')
      error.name = 'PopupBlockedError'
      throw error
    }

    return new Promise((resolve, reject) => {
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed)
          const error = new Error('User cancelled OAuth')
          error.name = 'OAuth2CancelledError'
          reject(error)
        }
      }, 1000)

      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) {
          return
        }

        const { type, data, error } = event.data

        if (type === 'oauth_success') {
          clearInterval(checkClosed)
          window.removeEventListener('message', messageHandler)
          popup.close()

          const { user, token, refreshToken, expiresAt } = data
          this.storeTokens(token, refreshToken)
          this.notifyAuthStateChange(user)
          resolve(user)
        } else if (type === 'oauth_error') {
          clearInterval(checkClosed)
          window.removeEventListener('message', messageHandler)
          popup.close()

          const authError = new Error(error.message)
          authError.name = error.name || 'OAuthError'
          reject(authError)
        }
      }

      window.addEventListener('message', messageHandler)
    })
  }

  async signOut(): Promise<void> {
    try {
      await this.request('/auth/signout', { method: 'POST' })
    } catch (error) {
      // Continue with local cleanup even if server request fails
      console.error('Sign out request failed:', error)
    } finally {
      this.clearStoredToken()
      this.notifyAuthStateChange(null)
    }
  }

  async refreshToken(): Promise<AuthUser> {
    const refreshToken = localStorage.getItem(this.REFRESH_TOKEN_KEY)
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    try {
      const response = await this.request<SignInResponse>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      })

      this.storeTokens(response.token, response.refreshToken)
      this.notifyAuthStateChange(response.user)
      return response.user
    } catch (error) {
      this.clearStoredToken()
      this.notifyAuthStateChange(null)
      throw error
    }
  }

  async updateProfile(data: UpdateProfileData): Promise<AuthUser> {
    const user = await this.request<AuthUser>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })

    this.notifyAuthStateChange(user)
    return user
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    this.authStateListeners.add(callback)
    
    // Return unsubscribe function
    return () => {
      this.authStateListeners.delete(callback)
    }
  }

  private notifyAuthStateChange(user: AuthUser | null): void {
    this.authStateListeners.forEach(callback => {
      try {
        callback(user)
      } catch (error) {
        console.error('Error in auth state change callback:', error)
      }
    })
  }

  getStoredToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY)
  }

  private storeTokens(token: string, refreshToken: string): void {
    localStorage.setItem(this.TOKEN_KEY, token)
    localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken)
  }

  clearStoredToken(): void {
    localStorage.removeItem(this.TOKEN_KEY)
    localStorage.removeItem(this.REFRESH_TOKEN_KEY)
  }

  // Utility method to check if token is near expiry
  isTokenNearExpiry(user: AuthUser, minutesBeforeExpiry = 5): boolean {
    if (!user.tokenExpiresAt) {
      return false
    }

    const expiryTime = new Date(user.tokenExpiresAt).getTime()
    const currentTime = Date.now()
    const timeUntilExpiry = expiryTime - currentTime
    const minutesUntilExpiry = timeUntilExpiry / (1000 * 60)

    return minutesUntilExpiry <= minutesBeforeExpiry
  }
}

export const AuthService = new AuthServiceClass()