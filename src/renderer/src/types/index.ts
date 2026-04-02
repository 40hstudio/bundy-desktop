// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface Auth { userId: string; username: string; role: string }
export interface ApiConfig { apiBase: string; token: string }
export interface BundyStatus {
  isClockedIn: boolean; onBreak: boolean; isTracking: boolean
  elapsedMs: number; username: string; role: string
}
export interface Permissions { screen: string; accessibility: boolean }
export interface UserInfo {
  id: string; username: string; alias: string | null; avatarUrl: string | null; role?: string; userStatus?: string | null
}
export interface ChannelMember {
  userId: string; user: UserInfo
}
export interface Conversation {
  id: string; type: 'channel' | 'group' | 'dm'
  name: string; avatar?: string | null
  lastMessage?: string; lastTime?: string
  unread?: number
  members: ChannelMember[]
  partnerId?: string
  createdBy?: string
}
export interface ChatMessage {
  id: string; content: string; createdAt: string; editedAt: string | null
  sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  reads?: { userId: string; readAt?: string | null }[]
  reactions?: { emoji: string; userId: string; user: { id: string; username: string; alias: string | null } }[]
  parentMessageId?: string | null
  replyCount?: number
  replySenders?: { id: string; username: string; alias: string | null; avatarUrl: string | null }[]
  isPinned?: boolean
  pinnedAt?: string | null
  pinnedBy?: string | null
}
export interface ThreadActivity {
  id: string
  channelId: string
  channelName: string
  channelType: 'channel' | 'group' | 'dm'
  parentMessage: { content: string; sender: { alias: string | null; username: string; avatarUrl: string | null } }
  lastReply: { content: string; sender: { alias: string | null; username: string; avatarUrl: string | null }; createdAt: string }
  recentReplies?: { content: string; sender: { alias: string | null; username: string; avatarUrl: string | null }; createdAt: string }[]
  replyCount: number
  unread: boolean
}
export interface Task {
  id: string; title: string; description: string | null
  status: string; priority: string
  dueDate: string | null; startDate?: string | null; estimatedHours: number | null
  createdBy: string
  projectId: string | null
  assigneeId: string | null
  sectionId?: string | null
  order?: number
  parentTaskId?: string | null
  project: { id: string; name: string; color: string } | null
  section: { id: string; name: string } | null
  assignee: { id: string; username: string; alias: string | null; avatarUrl: string | null } | null
  creator?: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  multiAssignees?: { user: UserInfo }[]
  comments?: TaskComment[]
  subtasks?: Task[]
  activities?: TaskActivityItem[]
  attachments?: TaskAttachment[]
  _count: { comments: number; subtasks: number }
}
export interface TaskComment {
  id: string; body: string; createdAt: string; attachmentUrl: string | null; attachmentName: string | null
  parentCommentId: string | null
  user: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  replies?: TaskComment[]
}
export interface TaskAttachment {
  id: string; url: string; name: string; mimeType: string | null; createdAt: string
  creator: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}
export interface TaskActivityItem {
  id: string; type: string; oldVal: string | null; newVal: string | null; createdAt: string
  user: { id: string; username: string; alias: string | null; avatarUrl: string | null }
}
export interface TaskSection {
  id: string; name: string; order: number; projectId: string
}
export interface TaskProject {
  id: string; name: string; color: string; clientName: string | null; description?: string | null
  _count?: { tasks: number }
}
export interface LogEntry { id: string; action: string; timestamp: string }
export interface PlanItem {
  id: string
  project: { id: string; name: string }
  details: string
  status: string
  outcome: string | null
}
export interface OgMeta {
  title: string | null; description: string | null; image: string | null; siteName: string | null
}
export interface IncomingCallPayload {
  from: string; fromName: string; fromAvatar: string | null; sdp: string; callType: 'audio' | 'video'
}

// ─── Activity types ───────────────────────────────────────────────────────────

export interface ActivityScreenshot {
  id: string; url: string; capturedAt: string; displayIndex: number
  topApp: string | null; mouseActivePct: number | null; keyActivePct: number | null; activityPct: number | null
}
export interface ActivityWindow {
  windowStart: string; mouseEvents: number; keyEvents: number
  activeSeconds: number; mouseActiveSeconds: number; keyActiveSeconds: number; totalSeconds: number
}
export interface ActivityStats {
  activityPercent: number; mousePercent: number; keyPercent: number
  mouseEvents: number; keyEvents: number; totalTrackedMinutes: number
}
export interface ManualTimeReq {
  id: string; startTime: string; endTime: string; reason: string; status: string; adminNote: string | null; createdAt: string
}
export interface ActivityData {
  screenshots: ActivityScreenshot[]; activity: ActivityWindow[]
  topApps: { name: string; seconds: number }[]; topUrls: { name: string; seconds: number }[]
  timeLogs: { action: string; timestamp: string }[]; manualRequests: ManualTimeReq[]; stats: ActivityStats
}
export interface TimelineSlot {
  slotTime: Date; screenshot: ActivityScreenshot | null; isBreak: boolean; isOffline: boolean
  activityPct: number | null; window: ActivityWindow | null
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export type Tab = 'home' | 'messages' | 'tasks' | 'activity' | 'settings'
export interface NavItem { id: Tab; icon: (active: boolean) => React.ReactNode; label: string }
