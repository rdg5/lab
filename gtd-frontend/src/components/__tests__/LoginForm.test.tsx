import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '../LoginForm'
import { render } from '../../test/utils/test-utils'

// Mock OAuth providers
vi.mock('../../services/auth.service', () => ({
  AuthService: {
    signInWithGoogle: vi.fn(),
    signInWithGitHub: vi.fn(),
    signInWithMicrosoft: vi.fn(),
    signOut: vi.fn(),
    getCurrentUser: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}))

// Mock environment variables
vi.mock('../../config/env', () => ({
  env: {
    GOOGLE_CLIENT_ID: 'mock-google-client-id',
    GITHUB_CLIENT_ID: 'mock-github-client-id',
    MICROSOFT_CLIENT_ID: 'mock-microsoft-client-id',
    API_BASE_URL: 'http://localhost:3000',
  },
}))

describe('LoginForm Component', () => {
  const defaultProps = {
    onLogin: vi.fn(),
    onError: vi.fn(),
    redirectTo: '/dashboard',
    providers: ['google', 'github', 'microsoft'] as const,
    isLoading: false,
    error: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:3000/login',
        origin: 'http://localhost:3000',
      },
      writable: true,
    })
  })

  describe('Basic Rendering', () => {
    it('should render login form with all providers', () => {
      render(<LoginForm {...defaultProps} />)

      expect(screen.getByText('Sign in to GTD Todo')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toBeInTheDocument()
    })

    it('should render only specified providers', () => {
      render(<LoginForm {...defaultProps} providers={['google', 'github']} />)

      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /sign in with microsoft/i })).not.toBeInTheDocument()
    })

    it('should show loading state', () => {
      render(<LoginForm {...defaultProps} isLoading={true} />)

      expect(screen.getByText('Signing in...')).toBeInTheDocument()
      
      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toBeDisabled()
      })
    })

    it('should show error message', () => {
      const error = 'Authentication failed. Please try again.'
      render(<LoginForm {...defaultProps} error={error} />)

      expect(screen.getByRole('alert')).toHaveTextContent(error)
    })

    it('should show welcome message', () => {
      render(<LoginForm {...defaultProps} />)

      expect(screen.getByText('Welcome to GTD Todo')).toBeInTheDocument()
      expect(screen.getByText('Organize your tasks with Getting Things Done methodology')).toBeInTheDocument()
    })
  })

  describe('Google OAuth', () => {
    it('should initiate Google OAuth when button is clicked', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with google/i }))

      expect(AuthService.signInWithGoogle).toHaveBeenCalledWith({
        redirectUri: 'http://localhost:3000/auth/callback',
        state: expect.any(String),
      })
    })

    it('should handle Google OAuth success', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      const mockUser = {
        id: '123',
        email: 'user@gmail.com',
        name: 'John Doe',
        avatar: 'https://example.com/avatar.jpg',
        provider: 'google',
      }
      
      AuthService.signInWithGoogle.mockResolvedValue(mockUser)
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with google/i }))

      await waitFor(() => {
        expect(defaultProps.onLogin).toHaveBeenCalledWith(mockUser)
      })
    })

    it('should handle Google OAuth error', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      const error = new Error('Google OAuth failed')
      
      AuthService.signInWithGoogle.mockRejectedValue(error)
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with google/i }))

      await waitFor(() => {
        expect(defaultProps.onError).toHaveBeenCalledWith(error)
      })
    })

    it('should disable Google button when client ID is missing', () => {
      // Mock missing Google client ID
      vi.doMock('../../config/env', () => ({
        env: {
          GOOGLE_CLIENT_ID: null,
          GITHUB_CLIENT_ID: 'mock-github-client-id',
          MICROSOFT_CLIENT_ID: 'mock-microsoft-client-id',
        },
      }))

      render(<LoginForm {...defaultProps} />)

      const googleButton = screen.getByRole('button', { name: /sign in with google/i })
      expect(googleButton).toBeDisabled()
      expect(screen.getByText('Google login not configured')).toBeInTheDocument()
    })
  })

  describe('GitHub OAuth', () => {
    it('should initiate GitHub OAuth when button is clicked', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with github/i }))

      expect(AuthService.signInWithGitHub).toHaveBeenCalledWith({
        redirectUri: 'http://localhost:3000/auth/callback',
        state: expect.any(String),
        scope: 'user:email',
      })
    })

    it('should handle GitHub OAuth success', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      const mockUser = {
        id: '456',
        email: 'user@github.com',
        name: 'Jane Doe',
        avatar: 'https://github.com/avatar.jpg',
        provider: 'github',
      }
      
      AuthService.signInWithGitHub.mockResolvedValue(mockUser)
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with github/i }))

      await waitFor(() => {
        expect(defaultProps.onLogin).toHaveBeenCalledWith(mockUser)
      })
    })

    it('should handle GitHub OAuth cancellation', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      const error = new Error('User cancelled GitHub OAuth')
      error.name = 'OAuth2CancelledError'
      
      AuthService.signInWithGitHub.mockRejectedValue(error)
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with github/i }))

      await waitFor(() => {
        expect(screen.getByText('Sign in was cancelled')).toBeInTheDocument()
      })
      
      expect(defaultProps.onError).not.toHaveBeenCalled()
    })
  })

  describe('Microsoft OAuth', () => {
    it('should initiate Microsoft OAuth when button is clicked', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with microsoft/i }))

      expect(AuthService.signInWithMicrosoft).toHaveBeenCalledWith({
        redirectUri: 'http://localhost:3000/auth/callback',
        state: expect.any(String),
        scope: 'openid profile email',
      })
    })

    it('should handle Microsoft OAuth with work account', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      const mockUser = {
        id: '789',
        email: 'user@company.com',
        name: 'Bob Smith',
        avatar: 'https://graph.microsoft.com/avatar.jpg',
        provider: 'microsoft',
        tenant: 'company.com',
      }
      
      AuthService.signInWithMicrosoft.mockResolvedValue(mockUser)
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with microsoft/i }))

      await waitFor(() => {
        expect(defaultProps.onLogin).toHaveBeenCalledWith(mockUser)
      })
    })
  })

  describe('OAuth Callback Handling', () => {
    it('should handle OAuth callback with success code', async () => {
      // Mock URL with OAuth callback
      Object.defineProperty(window, 'location', {
        value: {
          href: 'http://localhost:3000/auth/callback?code=auth_code&state=state_token',
          search: '?code=auth_code&state=state_token',
        },
        writable: true,
      })

      const { AuthService } = await import('../../services/auth.service')
      const mockUser = {
        id: '123',
        email: 'user@example.com',
        name: 'User Name',
        provider: 'google',
      }
      
      AuthService.handleOAuthCallback = vi.fn().mockResolvedValue(mockUser)
      
      render(<LoginForm {...defaultProps} />)

      await waitFor(() => {
        expect(AuthService.handleOAuthCallback).toHaveBeenCalledWith('auth_code', 'state_token')
        expect(defaultProps.onLogin).toHaveBeenCalledWith(mockUser)
      })
    })

    it('should handle OAuth callback with error', async () => {
      // Mock URL with OAuth error
      Object.defineProperty(window, 'location', {
        value: {
          href: 'http://localhost:3000/auth/callback?error=access_denied&error_description=User+denied+access',
          search: '?error=access_denied&error_description=User+denied+access',
        },
        writable: true,
      })

      render(<LoginForm {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('User denied access')).toBeInTheDocument()
      })
    })

    it('should handle OAuth callback with CSRF error', async () => {
      // Mock URL with invalid state
      Object.defineProperty(window, 'location', {
        value: {
          href: 'http://localhost:3000/auth/callback?code=auth_code&state=invalid_state',
          search: '?code=auth_code&state=invalid_state',
        },
        writable: true,
      })

      render(<LoginForm {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Security error: Invalid state parameter')).toBeInTheDocument()
      })
    })
  })

  describe('Security Features', () => {
    it('should generate secure state parameter', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with google/i }))

      const callArgs = AuthService.signInWithGoogle.mock.calls[0][0]
      expect(callArgs.state).toMatch(/^[a-zA-Z0-9_-]{32,}$/) // At least 32 chars, URL-safe
    })

    it('should validate CSRF state parameter', async () => {
      // Store state in sessionStorage
      const state = 'valid_state_token'
      sessionStorage.setItem('oauth_state', state)

      Object.defineProperty(window, 'location', {
        value: {
          search: `?code=auth_code&state=${state}`,
        },
        writable: true,
      })

      const { AuthService } = await import('../../services/auth.service')
      AuthService.handleOAuthCallback = vi.fn().mockResolvedValue({
        id: '123',
        email: 'user@example.com',
        name: 'User',
        provider: 'google',
      })

      render(<LoginForm {...defaultProps} />)

      await waitFor(() => {
        expect(AuthService.handleOAuthCallback).toHaveBeenCalled()
      })
    })

    it('should clear sensitive data from URL after callback', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          search: '?code=sensitive_auth_code&state=state_token',
          href: 'http://localhost:3000/auth/callback?code=sensitive_auth_code&state=state_token',
        },
        writable: true,
      })

      const replaceSpy = vi.fn()
      Object.defineProperty(window.history, 'replaceState', {
        value: replaceSpy,
        writable: true,
      })

      render(<LoginForm {...defaultProps} />)

      await waitFor(() => {
        expect(replaceSpy).toHaveBeenCalledWith(
          null,
          '',
          'http://localhost:3000/auth/callback'
        )
      })
    })

    it('should implement rate limiting for login attempts', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      
      // Mock multiple failed attempts
      AuthService.signInWithGoogle.mockRejectedValue(new Error('Invalid credentials'))
      
      render(<LoginForm {...defaultProps} />)

      // Make 5 rapid attempts
      for (let i = 0; i < 5; i++) {
        await user.click(screen.getByRole('button', { name: /sign in with google/i }))
      }

      await waitFor(() => {
        expect(screen.getByText('Too many login attempts. Please wait 5 minutes before trying again.')).toBeInTheDocument()
      })

      // Button should be disabled
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDisabled()
    })
  })

  describe('User Experience', () => {
    it('should show provider-specific loading states', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      
      // Mock slow Google OAuth
      AuthService.signInWithGoogle.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000))
      )
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with google/i }))

      expect(screen.getByText('Signing in with Google...')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDisabled()
      
      // Other providers should still be enabled
      expect(screen.getByRole('button', { name: /sign in with github/i })).toBeEnabled()
    })

    it('should show provider icons', () => {
      render(<LoginForm {...defaultProps} />)

      expect(screen.getByTestId('google-icon')).toBeInTheDocument()
      expect(screen.getByTestId('github-icon')).toBeInTheDocument()
      expect(screen.getByTestId('microsoft-icon')).toBeInTheDocument()
    })

    it('should remember last used provider', async () => {
      const user = userEvent.setup()
      
      localStorage.setItem('lastAuthProvider', 'github')
      
      render(<LoginForm {...defaultProps} />)

      // GitHub button should be highlighted
      expect(screen.getByRole('button', { name: /sign in with github/i })).toHaveClass('recommended')
    })

    it('should show privacy notice', () => {
      render(<LoginForm {...defaultProps} />)

      expect(screen.getByText('Privacy Notice')).toBeInTheDocument()
      expect(screen.getByText('By signing in, you agree to our Terms of Service and Privacy Policy')).toBeInTheDocument()
    })

    it('should provide help link', () => {
      render(<LoginForm {...defaultProps} />)

      expect(screen.getByText('Need help signing in?')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /contact support/i })).toHaveAttribute(
        'href',
        'mailto:support@gtd-todo.com'
      )
    })
  })

  describe('Keyboard Navigation', () => {
    it('should support keyboard navigation between providers', async () => {
      const user = userEvent.setup()
      
      render(<LoginForm {...defaultProps} />)

      await user.tab()
      expect(screen.getByRole('button', { name: /sign in with google/i })).toHaveFocus()

      await user.tab()
      expect(screen.getByRole('button', { name: /sign in with github/i })).toHaveFocus()

      await user.tab()
      expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toHaveFocus()
    })

    it('should activate OAuth with Enter key', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      
      render(<LoginForm {...defaultProps} />)

      const googleButton = screen.getByRole('button', { name: /sign in with google/i })
      googleButton.focus()

      await user.keyboard('{Enter}')

      expect(AuthService.signInWithGoogle).toHaveBeenCalled()
    })

    it('should activate OAuth with Space key', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      
      render(<LoginForm {...defaultProps} />)

      const githubButton = screen.getByRole('button', { name: /sign in with github/i })
      githubButton.focus()

      await user.keyboard(' ')

      expect(AuthService.signInWithGitHub).toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<LoginForm {...defaultProps} />)

      expect(screen.getByRole('main')).toHaveAccessibleName('Login form')
      expect(screen.getByRole('button', { name: /sign in with google/i })).toHaveAccessibleDescription(
        'Sign in using your Google account'
      )
    })

    it('should announce authentication state changes', async () => {
      const user = userEvent.setup()
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with google/i }))

      expect(screen.getByRole('status')).toHaveTextContent('Signing in with Google')
    })

    it('should support screen reader navigation', () => {
      render(<LoginForm {...defaultProps} />)

      expect(screen.getByText('Choose your preferred sign-in method:')).toBeInTheDocument()
      expect(screen.getAllByRole('button')).toHaveLength(3)
    })

    it('should provide error context for screen readers', () => {
      const error = 'Network error: Please check your connection'
      render(<LoginForm {...defaultProps} error={error} />)

      const errorElement = screen.getByRole('alert')
      expect(errorElement).toHaveAccessibleName('Authentication error')
      expect(errorElement).toHaveTextContent(error)
    })

    it('should support high contrast mode', () => {
      // Mock high contrast preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-contrast: high)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })

      render(<LoginForm {...defaultProps} />)

      expect(screen.getByTestId('login-form')).toHaveClass('high-contrast')
    })
  })

  describe('Responsive Design', () => {
    it('should adapt layout for mobile screens', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })

      render(<LoginForm {...defaultProps} />)

      expect(screen.getByTestId('login-form')).toHaveClass('mobile-layout')
    })

    it('should stack provider buttons vertically on small screens', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(max-width: 480px)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })

      render(<LoginForm {...defaultProps} />)

      expect(screen.getByTestId('provider-buttons')).toHaveClass('vertical-stack')
    })
  })

  describe('Error Handling', () => {
    it('should handle network connectivity issues', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      
      const networkError = new Error('Network error')
      networkError.name = 'NetworkError'
      AuthService.signInWithGoogle.mockRejectedValue(networkError)
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with google/i }))

      await waitFor(() => {
        expect(screen.getByText('Connection problem. Please check your internet and try again.')).toBeInTheDocument()
        expect(screen.getByText('Retry')).toBeInTheDocument()
      })
    })

    it('should handle OAuth provider maintenance', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      
      const maintenanceError = new Error('Service temporarily unavailable')
      maintenanceError.name = 'ServiceUnavailableError'
      AuthService.signInWithGoogle.mockRejectedValue(maintenanceError)
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with google/i }))

      await waitFor(() => {
        expect(screen.getByText('Google sign-in is temporarily unavailable. Please try another provider.')).toBeInTheDocument()
      })
    })

    it('should handle browser incompatibility', () => {
      // Mock old browser without required APIs
      const originalCrypto = window.crypto
      delete (window as any).crypto
      
      render(<LoginForm {...defaultProps} />)

      expect(screen.getByText('Your browser is not supported. Please use a modern browser.')).toBeInTheDocument()
      
      // Restore
      window.crypto = originalCrypto
    })

    it('should handle popup blockers', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      
      const popupError = new Error('Popup blocked')
      popupError.name = 'PopupBlockedError'
      AuthService.signInWithGoogle.mockRejectedValue(popupError)
      
      render(<LoginForm {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /sign in with google/i }))

      await waitFor(() => {
        expect(screen.getByText('Popup was blocked. Please allow popups for this site and try again.')).toBeInTheDocument()
      })
    })
  })

  describe('Performance', () => {
    it('should preload OAuth provider resources', () => {
      render(<LoginForm {...defaultProps} />)

      const linkElements = document.querySelectorAll('link[rel="preconnect"]')
      const preconnectUrls = Array.from(linkElements).map(link => link.getAttribute('href'))
      
      expect(preconnectUrls).toContain('https://accounts.google.com')
      expect(preconnectUrls).toContain('https://github.com')
      expect(preconnectUrls).toContain('https://login.microsoftonline.com')
    })

    it('should lazy load provider scripts', async () => {
      render(<LoginForm {...defaultProps} />)

      // Scripts should be loaded on demand
      expect(document.querySelector('script[src*="googleapis.com"]')).not.toBeInTheDocument()
      
      // Simulate user interaction
      await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
      
      await waitFor(() => {
        expect(document.querySelector('script[src*="googleapis.com"]')).toBeInTheDocument()
      })
    })

    it('should debounce rapid button clicks', async () => {
      const user = userEvent.setup()
      const { AuthService } = await import('../../services/auth.service')
      
      render(<LoginForm {...defaultProps} />)

      const googleButton = screen.getByRole('button', { name: /sign in with google/i })
      
      // Click rapidly multiple times
      await user.click(googleButton)
      await user.click(googleButton)
      await user.click(googleButton)

      // Should only trigger once
      expect(AuthService.signInWithGoogle).toHaveBeenCalledTimes(1)
    })
  })
})