import { contextBridge, ipcRenderer, clipboard } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface StoredAuth {
  userId: string
  username: string
  role: string
  avatarUrl: string | null
}

export interface BundyStatus {
  isClockedIn: boolean
  onBreak: boolean
  isTracking: boolean
  elapsedMs: number
  username: string
  role: string
}

export interface Permissions {
  screen: string
  accessibility: boolean
}

export interface PlanItemData {
  id: string
  projectId: string
  project: { id: string; name: string }
  details: string
  status: string
  outcome: string | null
  createdAt: string
  updatedAt: string
}

export interface DailyPlanData {
  id: string
  userId: string
  date: string
  items: PlanItemData[]
}

export type SseTaskEvent =
  | { kind: 'task-update'; data: { taskId: string; mainTaskId: string; kind: 'created' | 'updated' | 'deleted'; changes?: Record<string, unknown> } }
  | { kind: 'task-comment'; data: {
      taskId: string; mainTaskId: string; summary: string; actorId: string;
      actorName?: string; taskTitle?: string; commentId?: string;
      comment?: {
        id: string; body: string; createdAt: string; editedAt: string | null;
        parentCommentId: string | null;
        attachmentUrl: string | null; attachmentName: string | null;
        user: { id: string; username: string; alias: string | null; avatarUrl: string | null };
        reactions: Array<{ emoji: string; userId: string; user: { id: string; username: string; alias: string | null } }>;
      };
    } }
  | { kind: 'task-comment-edit'; data: { taskId: string; mainTaskId: string; commentId: string; body: string; editedAt: string } }
  | { kind: 'task-comment-delete'; data: { taskId: string; mainTaskId: string; commentId: string } }
  | { kind: 'task-notification'; data: { userId: string; notificationId: string; taskId: string; type: string; message: string; commentId?: string | null; subtaskId?: string | null } }
  | { kind: 'task-typing'; data: { taskId: string; mainTaskId: string; userId: string; userName: string } }
  | { kind: 'task-typing-stop'; data: { taskId: string; mainTaskId: string; userId: string } }

export type SseReportEvent =
  | { kind: 'report-tree-update'; data: { kind: string; action: string; id: string; projectId?: string | null; clientId?: string | null; actorId?: string } }
  | { kind: 'feedback-pin'; data: { linkId: string; pinId: string; action: 'created' | 'updated' | 'deleted'; actorId?: string } }
  | { kind: 'feedback-reply'; data: { pinId: string; replyId: string; action: 'created' | 'updated' | 'deleted'; actorId?: string } }
  | { kind: 'report-doc-edit'; data: { documentId: string; editId: string; summary: string | null; actorId: string; actorName: string } }
  | { kind: 'report-doc-presence'; data: { documentId: string; editors: { userId: string; userName: string; avatar: string | null }[] } }
  | { kind: 'feedback-notification'; data: { userId: string; notificationId: string; pinId: string; type: string; message: string } }

export type SseCalendarEvent =
  | { kind: 'calendar-event'; data: { eventId: string; action: 'created' | 'updated' | 'deleted'; recipientIds: string[]; title?: string; startsAt?: string; hostId?: string } }

const api = {
  getStoredAuth: (): Promise<StoredAuth | null> => ipcRenderer.invoke('get-stored-auth'),
  login: (shortToken: string): Promise<StoredAuth> => ipcRenderer.invoke('login', shortToken),
  logout: (): Promise<void> => ipcRenderer.invoke('logout'),
  getStatus: (): Promise<BundyStatus> => ipcRenderer.invoke('get-status'),
  doAction: (action: string, note?: string): Promise<BundyStatus | void> =>
    ipcRenderer.invoke('do-action', action, note),
  submitReport: (content: string): Promise<void> =>
    ipcRenderer.invoke('submit-report', content),
  checkPermissions: (): Promise<Permissions> => ipcRenderer.invoke('check-permissions'),
  // P0-1 — exposes process.platform synchronously so the renderer can
  // skip macOS-only API calls on Windows / Linux without crashing.
  // 'darwin' | 'win32' | 'linux' (etc.); read once at boot.
  platform: process.platform,
  openAccessibilitySettings: (): Promise<void> =>
    ipcRenderer.invoke('open-accessibility-settings'),
  openScreenRecordingSettings: (): Promise<void> =>
    ipcRenderer.invoke('open-screen-recording-settings'),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('open-external', url),
  getVersion: (): Promise<string> =>
    ipcRenderer.invoke('get-version'),
  getUpdateState: (): Promise<{ version: string | null; percent: number | null; downloaded: boolean }> =>
    ipcRenderer.invoke('get-update-state'),
  checkForUpdates: (): Promise<void> =>
    ipcRenderer.invoke('check-for-updates'),
  installUpdate: (): Promise<void> =>
    ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (cb: (info: { version: string }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { version: string }): void => cb(info)
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },
  onDownloadProgress: (cb: (info: { percent: number }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { percent: number }): void => cb(info)
    ipcRenderer.on('download-progress', handler)
    return () => ipcRenderer.removeListener('download-progress', handler)
  },
  onUpdateDownloaded: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  },
  onStatusUpdate: (cb: (status: BundyStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: BundyStatus): void => cb(status)
    ipcRenderer.on('status-update', handler)
    return () => ipcRenderer.removeListener('status-update', handler)
  },
  onPermissionsUpdate: (cb: (perms: Permissions) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, perms: Permissions): void => cb(perms)
    ipcRenderer.on('permissions-update', handler)
    return () => ipcRenderer.removeListener('permissions-update', handler)
  },
  onPlanUpdate: (cb: (plan: DailyPlanData) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, plan: DailyPlanData): void => cb(plan)
    ipcRenderer.on('plan-update', handler)
    return () => ipcRenderer.removeListener('plan-update', handler)
  },
  onTokenExpired: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('token-expired', handler)
    return () => ipcRenderer.removeListener('token-expired', handler)
  },
  onTaskEvent: (cb: (event: SseTaskEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, event: SseTaskEvent): void => cb(event)
    ipcRenderer.on('task-event', handler)
    return () => ipcRenderer.removeListener('task-event', handler)
  },
  onReportEvent: (cb: (event: SseReportEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, event: SseReportEvent): void => cb(event)
    ipcRenderer.on('report-event', handler)
    return () => ipcRenderer.removeListener('report-event', handler)
  },
  onCalendarEvent: (cb: (event: SseCalendarEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, event: SseCalendarEvent): void => cb(event)
    ipcRenderer.on('calendar-event', handler)
    return () => ipcRenderer.removeListener('calendar-event', handler)
  },
  sendCrashReport: (note: string): Promise<void> =>
    ipcRenderer.invoke('send-crash-report', note),
  openFullWindow: (): Promise<void> =>
    ipcRenderer.invoke('open-full-window'),
  focusWindow: (): Promise<void> =>
    ipcRenderer.invoke('focus-window'),
  getScreenSources: (): Promise<Array<{ id: string; name: string; thumbnail: string }>> =>
    ipcRenderer.invoke('get-screen-sources'),
  getWindowMode: (): Promise<'popup' | 'full'> =>
    ipcRenderer.invoke('get-window-mode'),
  getApiConfig: (): Promise<{ apiBase: string; token: string }> =>
    ipcRenderer.invoke('get-api-config'),
  onOnlineState: (cb: (state: { isOnline: boolean; queuedCount: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: { isOnline: boolean; queuedCount: number }): void => cb(state)
    ipcRenderer.on('online-state', handler)
    return () => ipcRenderer.removeListener('online-state', handler)
  },
  onSyncToast: (cb: (data: { count: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { count: number }): void => cb(data)
    ipcRenderer.on('sync-toast', handler)
    return () => ipcRenderer.removeListener('sync-toast', handler)
  },
  getDailyPlan: (): Promise<DailyPlanData | null> =>
    ipcRenderer.invoke('get-daily-plan'),
  ensureDailyPlan: (): Promise<DailyPlanData> =>
    ipcRenderer.invoke('ensure-daily-plan'),
  getProjects: (): Promise<Array<{ id: string; name: string }>> =>
    ipcRenderer.invoke('get-projects'),
  addPlanItem: (projectName: string, details: string): Promise<PlanItemData> =>
    ipcRenderer.invoke('add-plan-item', projectName, details),
  updatePlanItem: (itemId: string, status?: string, outcome?: string): Promise<PlanItemData> =>
    ipcRenderer.invoke('update-plan-item', itemId, status, outcome),
  deletePlanItem: (itemId: string): Promise<void> =>
    ipcRenderer.invoke('delete-plan-item', itemId),
  submitReportWithPlan: (content: string, planItems: Array<{ itemId: string; status: string; outcome?: string }>): Promise<void> =>
    ipcRenderer.invoke('submit-report-with-plan', content, planItems),

  // ─── Dock / taskbar badge ─────────────────────────────────────────
  setBadgeCount: (count: number): void =>
    ipcRenderer.send('set-badge-count', count),

  // ─── Activity engine: in-call suppression ────────────────────────
  // Set true on call start, false on call end. While true, the activity
  // engine treats every tick as active so calls don't show as idle.
  setInCall: (value: boolean): void =>
    ipcRenderer.send('set-in-call', value),

  // ─── Activity engine: current task in focus ─────────────────────
  // Each 10-min heartbeat is tagged with the most-recent taskId so the
  // daily rollup can populate Task.actualHours.
  setCurrentTask: (taskId: string | null): void =>
    ipcRenderer.send('set-current-task', taskId),
  // Renderer error capture (auto-logs to userData/error.log).
  reportError: (payload: { level: string; message: string; stack?: string; url?: string; userAgent?: string; timestamp: string }): void =>
    ipcRenderer.send('report-renderer-error', payload),
  getErrorLogPath: (): Promise<string> => ipcRenderer.invoke('get-error-log-path'),
  // Renderer event stream — clicks, navigation, feature actions. Logs to
  // userData/events.log. Fires every click so it's `send` (one-way), not
  // `invoke`, to keep the call-site cheap.
  reportEvent: (payload: { ts: string; kind: string; name: string; data?: Record<string, unknown>; url?: string }): void =>
    ipcRenderer.send('report-renderer-event', payload),
  getEventLogPath: (): Promise<string> => ipcRenderer.invoke('get-event-log-path'),
  setCurrentReportDocument: (documentId: string | null): void =>
    ipcRenderer.send('set-current-report-document', documentId),
  setCurrentChannel: (channelId: string | null): void =>
    ipcRenderer.send('set-current-channel', channelId),
  setCurrentVoiceChannel: (voiceChannelId: string | null): void =>
    ipcRenderer.send('set-current-voice-channel', voiceChannelId),

  // ─── Desktop notifications ────────────────────────────────────────
  showNotification: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke('show-notification', { title, body }),

  // ─── Floating call window ──────────────────────────────────────────
  openCallFloat: (state: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('open-call-float', state),
  getCallFloatState: (): Promise<Record<string, unknown> | null> =>
    ipcRenderer.invoke('get-call-float-state'),
  closeCallFloat: (): Promise<void> =>
    ipcRenderer.invoke('close-call-float'),
  updateCallFloat: (state: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('update-call-float', state),
  sendCallFloatAction: (action: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('call-float-action', action),
  onCallFloatState: (cb: (state: Record<string, unknown>) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, state: Record<string, unknown>): void => cb(state)
    ipcRenderer.on('call-float-state', handler)
    return () => ipcRenderer.removeListener('call-float-state', handler)
  },
  onCallFloatAction: (cb: (action: Record<string, unknown>) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, action: Record<string, unknown>): void => cb(action)
    ipcRenderer.on('call-float-action', handler)
    return () => ipcRenderer.removeListener('call-float-action', handler)
  },
  setCallFloatAlwaysOnTop: (onTop: boolean): Promise<void> =>
    ipcRenderer.invoke('set-call-float-always-on-top', onTop),

  // ─── Clipboard ────────────────────────────────────────────────────
  writeClipboard: (text: string): void => clipboard.writeText(text),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (for dev environments without context isolation)
  window.electron = electronAPI
  // @ts-ignore
  window.electronAPI = api
}
