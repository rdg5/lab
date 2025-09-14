import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '../useAuth'
import { createMockUser } from '../../test/utils/test-utils'

// Mock Auth service
vi.mock('../../services/auth.service', () => ({
  AuthService: {
    getCurrentUser: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithGitHub: vi.fn(),
    signInWithMicrosoft: vi.fn(),
    signOut: vi.fn(),
    refreshToken: vi.fn(),
    onAuthStateChange: vi.fn(),
    getStoredToken: vi.fn(),
    clearStoredToken: vi.fn(),
  },
}))

// Mock local storage
const mockLocalStorage = () => {
  const storage: { [key: string]: string } = {}
  
  return {
    getItem: vi.fn((key: string) => storage[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      storage[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete storage[key]
    }),
    clear: vi.fn(() => {
      Object.keys(storage).forEach(key => delete storage[key])
    }),
  }
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('useAuth Hook', () => {
  const mockUser = createMockUser({
    id: '123',
    email: 'test@example.com',
    name: 'Test User',
    provider: 'google',
  })

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage(),
      writable: true,
    })
  })

  describe('Authentication State', () => {
    it('should initialize with no user when not authenticated', async () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(null)
      AuthService.getStoredToken.mockReturnValue(null)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should initialize with user when authenticated', async () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(mockUser)
      AuthService.getStoredToken.mockReturnValue('valid-token')

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.user).toEqual(mockUser)
      expect(result.current.isAuthenticated).toBe(true)
    })

    it('should handle authentication loading state', async () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockUser), 100))
      )

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.user).toBeNull()

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.user).toEqual(mockUser)
    })

    it('should handle authentication errors', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const error = new Error('Authentication failed')
      AuthService.getCurrentUser.mockRejectedValue(error)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.error).toEqual(error)
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
    })
  })

  describe('OAuth Sign In', () => {
    it('should sign in with Google', async () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(null)
      AuthService.signInWithGoogle.mockResolvedValue(mockUser)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.signInWithGoogle()
      })

      expect(result.current.isSigningIn).toBe(true)

      await waitFor(() => {
        expect(result.current.isSigningIn).toBe(false)
      })

      expect(AuthService.signInWithGoogle).toHaveBeenCalled()
      expect(result.current.user).toEqual(mockUser)
      expect(result.current.isAuthenticated).toBe(true)
    })

    it('should sign in with GitHub', async () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(null)
      AuthService.signInWithGitHub.mockResolvedValue(mockUser)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.signInWithGitHub()
      })

      expect(result.current.isSigningIn).toBe(true)

      await waitFor(() => {
        expect(result.current.isSigningIn).toBe(false)
      })

      expect(AuthService.signInWithGitHub).toHaveBeenCalled()
      expect(result.current.user).toEqual(mockUser)
    })

    it('should sign in with Microsoft', async () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(null)
      AuthService.signInWithMicrosoft.mockResolvedValue(mockUser)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.signInWithMicrosoft()
      })

      await waitFor(() => {
        expect(result.current.isSigningIn).toBe(false)
      })

      expect(AuthService.signInWithMicrosoft).toHaveBeenCalled()
      expect(result.current.user).toEqual(mockUser)
    })

    it('should handle sign in errors', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const signInError = new Error('Google sign in failed')
      AuthService.getCurrentUser.mockResolvedValue(null)
      AuthService.signInWithGoogle.mockRejectedValue(signInError)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.signInWithGoogle()
      })

      await waitFor(() => {
        expect(result.current.signInError).toEqual(signInError)
      })

      expect(result.current.isSigningIn).toBe(false)
      expect(result.current.user).toBeNull()
    })

    it('should handle OAuth cancellation', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const cancelError = new Error('User cancelled OAuth')
      cancelError.name = 'OAuth2CancelledError'
      AuthService.getCurrentUser.mockResolvedValue(null)
      AuthService.signInWithGoogle.mockRejectedValue(cancelError)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.signInWithGoogle()
      })

      await waitFor(() => {
        expect(result.current.isSigningIn).toBe(false)
      })

      // Should not set error for cancellation
      expect(result.current.signInError).toBeNull()
      expect(result.current.user).toBeNull()
    })

    it('should handle popup blocker errors', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const popupError = new Error('Popup blocked')
      popupError.name = 'PopupBlockedError'
      AuthService.getCurrentUser.mockResolvedValue(null)
      AuthService.signInWithGoogle.mockRejectedValue(popupError)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.signInWithGoogle()
      })

      await waitFor(() => {
        expect(result.current.signInError?.name).toBe('PopupBlockedError')
      })
    })
  })

  describe('Sign Out', () => {
    it('should sign out successfully', async () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(mockUser)
      AuthService.signOut.mockResolvedValue()

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      act(() => {
        result.current.signOut()
      })

      expect(result.current.isSigningOut).toBe(true)

      await waitFor(() => {
        expect(result.current.isSigningOut).toBe(false)
      })

      expect(AuthService.signOut).toHaveBeenCalled()
      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should handle sign out errors', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const signOutError = new Error('Sign out failed')
      AuthService.getCurrentUser.mockResolvedValue(mockUser)
      AuthService.signOut.mockRejectedValue(signOutError)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      act(() => {
        result.current.signOut()
      })

      await waitFor(() => {
        expect(result.current.signOutError).toEqual(signOutError)
      })

      expect(result.current.isSigningOut).toBe(false)
      // User should still be signed out on error for security
      expect(result.current.user).toBeNull()
    })

    it('should clear local storage on sign out', async () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(mockUser)
      AuthService.signOut.mockResolvedValue()
      AuthService.clearStoredToken.mockImplementation(() => {
        window.localStorage.removeItem('auth_token')
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      act(() => {
        result.current.signOut()
      })

      await waitFor(() => {
        expect(result.current.user).toBeNull()
      })

      expect(AuthService.clearStoredToken).toHaveBeenCalled()
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('auth_token')
    })
  })

  describe('Token Management', () => {
    it('should refresh token when expired', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const refreshedUser = { ...mockUser, id: '456' }
      
      AuthService.getCurrentUser.mockResolvedValue(mockUser)
      AuthService.refreshToken.mockResolvedValue(refreshedUser)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      act(() => {
        result.current.refreshToken()
      })

      expect(result.current.isRefreshing).toBe(true)

      await waitFor(() => {
        expect(result.current.isRefreshing).toBe(false)
      })

      expect(AuthService.refreshToken).toHaveBeenCalled()
      expect(result.current.user).toEqual(refreshedUser)
    })

    it('should handle token refresh failures', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const refreshError = new Error('Token refresh failed')
      
      AuthService.getCurrentUser.mockResolvedValue(mockUser)
      AuthService.refreshToken.mockRejectedValue(refreshError)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      act(() => {
        result.current.refreshToken()
      })

      await waitFor(() => {
        expect(result.current.refreshError).toEqual(refreshError)
      })

      expect(result.current.isRefreshing).toBe(false)
      // Should sign out user on refresh failure
      expect(result.current.user).toBeNull()
    })

    it('should automatically refresh token before expiry', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const userWithToken = {
        ...mockUser,
        tokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
      }
      
      AuthService.getCurrentUser.mockResolvedValue(userWithToken)
      AuthService.refreshToken.mockResolvedValue(userWithToken)

      renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      // Wait for auto-refresh to trigger (mocked timer)
      await waitFor(() => {
        expect(AuthService.refreshToken).toHaveBeenCalled()
      }, { timeout: 1000 })
    })

    it('should validate token on app focus', async () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(mockUser)

      renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(AuthService.getCurrentUser).toHaveBeenCalledTimes(1)
      })

      // Simulate app focus
      window.dispatchEvent(new Event('focus'))

      await waitFor(() => {
        expect(AuthService.getCurrentUser).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('Auth State Changes', () => {
    it('should listen to auth state changes', async () => {
      const { AuthService } = await import('../../services/auth.service')
      let authStateCallback: Function

      AuthService.getCurrentUser.mockResolvedValue(null)
      AuthService.onAuthStateChange.mockImplementation((callback) => {
        authStateCallback = callback
        return () => {} // unsubscribe function
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      expect(AuthService.onAuthStateChange).toHaveBeenCalled()

      // Simulate auth state change
      act(() => {
        authStateCallback(mockUser)
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })
    })

    it('should handle auth state change to null', async () => {
      const { AuthService } = await import('../../services/auth.service')
      let authStateCallback: Function

      AuthService.getCurrentUser.mockResolvedValue(mockUser)
      AuthService.onAuthStateChange.mockImplementation((callback) => {
        authStateCallback = callback
        return () => {}
      })

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      // Simulate sign out
      act(() => {
        authStateCallback(null)
      })

      await waitFor(() => {
        expect(result.current.user).toBeNull()
        expect(result.current.isAuthenticated).toBe(false)
      })
    })

    it('should unsubscribe from auth state changes on unmount', () => {
      const { AuthService } = await import('../../services/auth.service')
      const unsubscribeMock = vi.fn()
      
      AuthService.getCurrentUser.mockResolvedValue(null)
      AuthService.onAuthStateChange.mockReturnValue(unsubscribeMock)

      const { unmount } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      unmount()

      expect(unsubscribeMock).toHaveBeenCalled()
    })
  })

  describe('User Profile', () => {
    it('should provide user profile information', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const userWithProfile = {
        ...mockUser,
        profile: {
          preferences: {
            theme: 'dark',
            language: 'en',
          },
          settings: {
            notifications: true,
            autoSync: true,
          },
        },
      }
      
      AuthService.getCurrentUser.mockResolvedValue(userWithProfile)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(userWithProfile)
      })

      expect(result.current.profile).toEqual(userWithProfile.profile)
      expect(result.current.preferences).toEqual(userWithProfile.profile.preferences)
    })

    it('should update user profile', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const updatedUser = {
        ...mockUser,
        name: 'Updated Name',
      }
      
      AuthService.getCurrentUser.mockResolvedValue(mockUser)
      AuthService.updateProfile = vi.fn().mockResolvedValue(updatedUser)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      act(() => {
        result.current.updateProfile({ name: 'Updated Name' })
      })

      expect(result.current.isUpdatingProfile).toBe(true)

      await waitFor(() => {
        expect(result.current.isUpdatingProfile).toBe(false)
      })

      expect(AuthService.updateProfile).toHaveBeenCalledWith({ name: 'Updated Name' })
      expect(result.current.user).toEqual(updatedUser)
    })
  })

  describe('Permissions and Roles', () => {
    it('should check user permissions', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const userWithRoles = {
        ...mockUser,
        roles: ['user', 'premium'],
        permissions: ['create_todos', 'export_data'],
      }
      
      AuthService.getCurrentUser.mockResolvedValue(userWithRoles)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(userWithRoles)
      })

      expect(result.current.hasPermission('create_todos')).toBe(true)
      expect(result.current.hasPermission('admin_access')).toBe(false)
      expect(result.current.hasRole('premium')).toBe(true)
      expect(result.current.hasRole('admin')).toBe(false)
    })

    it('should handle users without roles/permissions', async () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(mockUser)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      expect(result.current.hasPermission('any_permission')).toBe(false)
      expect(result.current.hasRole('any_role')).toBe(false)
    })
  })

  describe('Session Management', () => {
    it('should track session activity', async () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(mockUser)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      expect(result.current.sessionInfo).toBeDefined()
      expect(result.current.sessionInfo?.startTime).toBeDefined()
      expect(result.current.sessionInfo?.lastActivity).toBeDefined()
    })

    it('should handle session timeout', async () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(mockUser)

      const { result } = renderHook(() => useAuth({
        sessionTimeout: 1000, // 1 second for testing
      }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      // Wait for session to timeout
      await waitFor(() => {
        expect(result.current.isSessionExpired).toBe(true)
      }, { timeout: 1500 })
    })

    it('should extend session on activity', async () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(mockUser)

      const { result } = renderHook(() => useAuth({
        sessionTimeout: 5000,
      }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      const initialActivity = result.current.sessionInfo?.lastActivity

      // Simulate user activity
      act(() => {
        result.current.extendSession()
      })

      expect(result.current.sessionInfo?.lastActivity).toBeGreaterThan(initialActivity!)
    })
  })

  describe('Security Features', () => {
    it('should detect suspicious login attempts', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const suspiciousError = new Error('Suspicious login detected')
      suspiciousError.name = 'SuspiciousLoginError'
      
      AuthService.getCurrentUser.mockResolvedValue(null)
      AuthService.signInWithGoogle.mockRejectedValue(suspiciousError)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.signInWithGoogle()
      })

      await waitFor(() => {
        expect(result.current.securityAlert).toBeDefined()
      })

      expect(result.current.securityAlert?.type).toBe('suspicious_login')
    })

    it('should handle rate limiting', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const rateLimitError = new Error('Too many login attempts')
      rateLimitError.name = 'RateLimitError'
      
      AuthService.getCurrentUser.mockResolvedValue(null)
      AuthService.signInWithGoogle.mockRejectedValue(rateLimitError)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.signInWithGoogle()
      })

      await waitFor(() => {
        expect(result.current.isRateLimited).toBe(true)
      })

      expect(result.current.rateLimitedUntil).toBeDefined()
    })

    it('should validate CSRF tokens', async () => {
      const { AuthService } = await import('../../services/auth.service')
      const csrfError = new Error('Invalid CSRF token')
      csrfError.name = 'CSRFError'
      
      AuthService.getCurrentUser.mockResolvedValue(null)
      AuthService.signInWithGoogle.mockRejectedValue(csrfError)

      const { result } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.signInWithGoogle()
      })

      await waitFor(() => {
        expect(result.current.signInError?.name).toBe('CSRFError')
      })
    })
  })

  describe('Cleanup and Memory Management', () => {
    it('should cleanup timers on unmount', () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(mockUser)

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

      const { unmount } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      unmount()

      expect(clearTimeoutSpy).toHaveBeenCalled()
    })

    it('should clear sensitive data on unmount', () => {
      const { AuthService } = await import('../../services/auth.service')
      AuthService.getCurrentUser.mockResolvedValue(mockUser)

      const { result, unmount } = renderHook(() => useAuth(), {
        wrapper: createWrapper(),
      })

      unmount()

      // Sensitive data should be cleared
      expect(result.current.user).toBeUndefined()
    })
  })
})