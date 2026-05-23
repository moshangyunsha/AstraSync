/// <reference types="vite/client" />

interface Window {
  electron: {
    ipcRenderer: {
      send(channel: string, ...args: any[]): void
      on(channel: string, listener: (event: any, ...args: any[]) => void): void
      once(channel: string, listener: (event: any, ...args: any[]) => void): void
      invoke(channel: 'fetch-dashboard'): Promise<any>
      invoke(channel: string, ...args: any[]): Promise<any>
    }
  }
}