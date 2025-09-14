import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthService, UpdateProfileData } from '../services/auth.service'
import { AuthUser } from '../test/utils/test-utils'

export interface UseAuthOptions {
  sessionTimeout?: number // in milliseconds
  autoRefresh?: boolean
  validateOnFocus?: boolean
}

export interface SessionInfo {
  startTime: Date
  lastActivity: Date
  duration: number
}

export interface SecurityAlert {
  type: 'suspicious_login' | 'rate_limited' | 'csrf_error' | 'session_expired'
  message: string
  timestamp: Date
}

export interface UseAuthReturn {
  // User state
  user: AuthUser | null
  isAuthenticated: boolean
  profile?: AuthUser['profile']
  preferences?: AuthUser['profile']['preferences']
  
  // Loading states
  isLoading: boolean
  isSigningIn: boolean
  isSigningOut: boolean
  isRefreshing: boolean
  isUpdatingProfile: boolean
  
  // Error states
  error: Error | null
  signInError: Error | null
  signOutError: Error | null
  refreshError: Error | null
  profileError: Error | null
  
  // Security states
  securityAlert: SecurityAlert | null
  isRateLimited: boolean
  rateLimitedUntil: Date | null
  isSessionExpired: boolean
  
  // Session management
  sessionInfo: SessionInfo | null
  
  // Actions
  signInWithGoogle: () => Promise<void>
  signInWithGitHub: () => Promise<void>
  signInWithMicrosoft: () => Promise<void>
  signOut: () => Promise<void>
  refreshToken: () => Promise<void>
  updateProfile: (data: UpdateProfileData) => Promise<void>
  extendSession: () => void
  
  // Utility functions
  hasPermission: (permission: string) => boolean
  hasRole: (role: string) => boolean
}

const AUTH_QUERY_KEY = 'auth'

export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const {
    sessionTimeout = 30 * 60 * 1000, // 30 minutes default
    autoRefresh = true,
    validateOnFocus = true,
  } = options

  const queryClient = useQueryClient()
  
  // State
  const [securityAlert, setSecurityAlert] = useState<SecurityAlert | null>(null)
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [rateLimitedUntil, setRateLimitedUntil] = useState<Date | null>(null)
  const [isSessionExpired, setIsSessionExpired] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  
  // Refs for timers
  const refreshTimerRef = useRef<NodeJS.Timeout>()
  const sessionTimerRef = useRef<NodeJS.Timeout>()
  const rateLimitTimerRef = useRef<NodeJS.Timeout>()

  // Query for current user
  const {
    data: user = null,
    isLoading,
    error,
    refetch: refetchUser,
  } = useQuery({
    queryKey: [AUTH_QUERY_KEY],
    queryFn: () => AuthService.getCurrentUser(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error: any) => {
      // Don't retry on auth errors
      if (error?.status === 401 || error?.status === 403) {
        return false
      }
      return failureCount < 3
    },
  })

  // Sign in mutations
  const signInGoogleMutation = useMutation({
    mutationFn: () => AuthService.signInWithGoogle(),
    onSuccess: (user) => {
      queryClient.setQueryData([AUTH_QUERY_KEY], user)
      initializeSession()
      setSecurityAlert(null)
      setIsRateLimited(false)
      setRateLimitedUntil(null)
    },
    onError: (error: any) => {
      handleAuthError(error)
    },
  })

  const signInGitHubMutation = useMutation({
    mutationFn: () => AuthService.signInWithGitHub(),
    onSuccess: (user) => {
      queryClient.setQueryData([AUTH_QUERY_KEY], user)
      initializeSession()
    },
    onError: (error: any) => {
      handleAuthError(error)
    },
  })

  const signInMicrosoftMutation = useMutation({
    mutationFn: () => AuthService.signInWithMicrosoft(),
    onSuccess: (user) => {
      queryClient.setQueryData([AUTH_QUERY_KEY], user)
      initializeSession()
    },
    onError: (error: any) => {
      handleAuthError(error)
    },
  })

  // Sign out mutation
  const signOutMutation = useMutation({
    mutationFn: () => AuthService.signOut(),
    onSuccess: () => {
      queryClient.setQueryData([AUTH_QUERY_KEY], null)
      queryClient.clear() // Clear all cached data on sign out
      cleanupSession()
    },
    onError: (error: any) => {
      // Even on error, clear local state for security
      queryClient.setQueryData([AUTH_QUERY_KEY], null)
      queryClient.clear()
      cleanupSession()
    },
  })

  // Refresh token mutation
  const refreshTokenMutation = useMutation({
    mutationFn: () => AuthService.refreshToken(),
    onSuccess: (user) => {
      queryClient.setQueryData([AUTH_QUERY_KEY], user)
      if (user.tokenExpiresAt) {
        scheduleTokenRefresh(user)
      }
    },
    onError: (error) => {
      // Sign out on refresh failure
      queryClient.setQueryData([AUTH_QUERY_KEY], null)
      AuthService.clearStoredToken()
      cleanupSession()
    },
  })

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data: UpdateProfileData) => AuthService.updateProfile(data),
    onSuccess: (user) => {
      queryClient.setQueryData([AUTH_QUERY_KEY], user)
    },
  })

  // Error handling
  const handleAuthError = useCallback((error: any) => {
    if (error.name === 'OAuth2CancelledError') {
      // Don't show error for user cancellation
      return
    }

    if (error.name === 'SuspiciousLoginError') {
      setSecurityAlert({
        type: 'suspicious_login',
        message: 'Suspicious login attempt detected. Please try again or contact support.',
        timestamp: new Date(),
      })
    } else if (error.name === 'RateLimitError') {
      setIsRateLimited(true)
      const rateLimitExpiry = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
      setRateLimitedUntil(rateLimitExpiry)
      
      // Clear rate limit after expiry
      rateLimitTimerRef.current = setTimeout(() => {
        setIsRateLimited(false)
        setRateLimitedUntil(null)
      }, 15 * 60 * 1000)
    } else if (error.name === 'CSRFError') {
      setSecurityAlert({
        type: 'csrf_error',
        message: 'Security validation failed. Please refresh and try again.',
        timestamp: new Date(),
      })
    }
  }, [])

  // Session management
  const initializeSession = useCallback(() => {
    const now = new Date()
    setSessionInfo({
      startTime: now,
      lastActivity: now,
      duration: 0,
    })
    setIsSessionExpired(false)
    
    // Start session timeout
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current)
    }
    
    sessionTimerRef.current = setTimeout(() => {
      setIsSessionExpired(true)
      setSecurityAlert({
        type: 'session_expired',
        message: 'Your session has expired. Please sign in again.',
        timestamp: new Date(),
      })
    }, sessionTimeout)
  }, [sessionTimeout])

  const extendSession = useCallback(() => {
    if (!sessionInfo) return
    
    const now = new Date()
    setSessionInfo(prev => prev ? {
      ...prev,
      lastActivity: now,
      duration: now.getTime() - prev.startTime.getTime(),
    } : null)
    
    // Reset session timer
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current)
    }
    
    setIsSessionExpired(false)
    sessionTimerRef.current = setTimeout(() => {
      setIsSessionExpired(true)
    }, sessionTimeout)
  }, [sessionInfo, sessionTimeout])

  const cleanupSession = useCallback(() => {
    setSessionInfo(null)
    setIsSessionExpired(false)
    
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current)
    }
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
    }
  }, [])

  // Token refresh scheduling
  const scheduleTokenRefresh = useCallback((user: AuthUser) => {
    if (!autoRefresh || !user.tokenExpiresAt) {
      return
    }

    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
    }

    const expiryTime = new Date(user.tokenExpiresAt).getTime()
    const currentTime = Date.now()
    const timeUntilExpiry = expiryTime - currentTime
    const refreshTime = Math.max(timeUntilExpiry - 5 * 60 * 1000, 1000) // Refresh 5 minutes before expiry

    refreshTimerRef.current = setTimeout(() => {
      if (AuthService.isTokenNearExpiry(user, 5)) {
        refreshTokenMutation.mutate()
      }
    }, refreshTime)
  }, [autoRefresh, refreshTokenMutation])

  // Auth state change listener
  useEffect(() => {
    const unsubscribe = AuthService.onAuthStateChange((newUser) => {
      queryClient.setQueryData([AUTH_QUERY_KEY], newUser)
      
      if (newUser) {
        initializeSession()
        if (newUser.tokenExpiresAt) {
          scheduleTokenRefresh(newUser)
        }
      } else {
        cleanupSession()
      }
    })

    return unsubscribe
  }, [queryClient, initializeSession, scheduleTokenRefresh, cleanupSession])

  // Initialize session for existing user
  useEffect(() => {
    if (user && !sessionInfo) {
      initializeSession()
      
      if (user.tokenExpiresAt) {
        scheduleTokenRefresh(user)
      }
    }
  }, [user, sessionInfo, initializeSession, scheduleTokenRefresh])

  // Focus validation
  useEffect(() => {
    if (!validateOnFocus) return

    const handleFocus = () => {
      if (user) {
        refetchUser()
        extendSession()
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [validateOnFocus, user, refetchUser, extendSession])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
      if (sessionTimerRef.current) {
        clearTimeout(sessionTimerRef.current)
      }
      if (rateLimitTimerRef.current) {
        clearTimeout(rateLimitTimerRef.current)
      }
    }
  }, [])

  // Action functions
  const signInWithGoogle = useCallback(async () => {
    await signInGoogleMutation.mutateAsync()
  }, [signInGoogleMutation])

  const signInWithGitHub = useCallback(async () => {
    await signInGitHubMutation.mutateAsync()
  }, [signInGitHubMutation])

  const signInWithMicrosoft = useCallback(async () => {
    await signInMicrosoftMutation.mutateAsync()
  }, [signInMicrosoftMutation])

  const signOut = useCallback(async () => {
    await signOutMutation.mutateAsync()
  }, [signOutMutation])

  const refreshToken = useCallback(async () => {
    await refreshTokenMutation.mutateAsync()
  }, [refreshTokenMutation])

  const updateProfile = useCallback(async (data: UpdateProfileData) => {
    await updateProfileMutation.mutateAsync(data)
  }, [updateProfileMutation])

  // Permission and role checks
  const hasPermission = useCallback((permission: string): boolean => {
    return user?.permissions?.includes(permission) ?? false
  }, [user])

  const hasRole = useCallback((role: string): boolean => {
    return user?.roles?.includes(role) ?? false
  }, [user])

  return {
    // User state
    user,
    isAuthenticated: !!user,
    profile: user?.profile,
    preferences: user?.profile?.preferences,
    
    // Loading states
    isLoading,
    isSigningIn: signInGoogleMutation.isPending || signInGitHubMutation.isPending || signInMicrosoftMutation.isPending,
    isSigningOut: signOutMutation.isPending,
    isRefreshing: refreshTokenMutation.isPending,
    isUpdatingProfile: updateProfileMutation.isPending,
    
    // Error states
    error,
    signInError: signInGoogleMutation.error || signInGitHubMutation.error || signInMicrosoftMutation.error,
    signOutError: signOutMutation.error,
    refreshError: refreshTokenMutation.error,
    profileError: updateProfileMutation.error,
    
    // Security states
    securityAlert,
    isRateLimited,
    rateLimitedUntil,
    isSessionExpired,
    
    // Session management
    sessionInfo,
    
    // Actions
    signInWithGoogle,
    signInWithGitHub,
    signInWithMicrosoft,
    signOut,
    refreshToken,
    updateProfile,
    extendSession,
    
    // Utility functions
    hasPermission,
    hasRole,
  }
}