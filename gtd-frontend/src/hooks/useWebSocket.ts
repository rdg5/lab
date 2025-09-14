import { useEffect, useRef, useCallback, useState } from 'react'

interface WebSocketHook {
  connected: boolean
  subscribe: (channel: string, callback: (data: any) => void) => void
  unsubscribe: (channel: string) => void
  send: (data: any) => void
}

export function useWebSocket(url?: string): WebSocketHook {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const subscriptionsRef = useRef<Map<string, (data: any) => void>>(new Map())
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()

  const wsUrl = url || process.env.VITE_WS_URL || 'ws://localhost:3000/ws'

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    try {
      wsRef.current = new WebSocket(wsUrl)

      wsRef.current.onopen = () => {
        setConnected(true)
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }
      }

      wsRef.current.onclose = () => {
        setConnected(false)
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 3000)
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        setConnected(false)
      }

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          const { type, channel, data } = message
          
          if (type === 'message' && channel) {
            const callback = subscriptionsRef.current.get(channel)
            if (callback) {
              callback(data)
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }
    } catch (error) {
      console.error('Error creating WebSocket connection:', error)
      setConnected(false)
    }
  }, [wsUrl])

  const subscribe = useCallback((channel: string, callback: (data: any) => void) => {
    subscriptionsRef.current.set(channel, callback)
    
    // Send subscription message to server
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        channel,
      }))
    }
  }, [])

  const unsubscribe = useCallback((channel: string) => {
    subscriptionsRef.current.delete(channel)
    
    // Send unsubscribe message to server
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        channel,
      }))
    }
  }, [])

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  return {
    connected,
    subscribe,
    unsubscribe,
    send,
  }
}