// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface Auth { userId: string; username: string; role: string; avatarUrl: string | null }
export interface ApiConfig { apiBase: string; token: string }
export interface BundyStatus {
  isClockedIn: boolean; onBreak: boolean; isTracking: boolean
  elapsedMs: number; username: string; role: string
}
export interface UserInfo {
  id: string; username: string; alias: string | null; avatarUrl: string | null; role?: string; userStatus?: string | null
}
export interface ChannelMember {
  userId: string; user: UserInfo
}
export interface Conversation {
  id: string; type: 'channel' | 'group' | 'dm' | 'task'
  name: string; avatar?: string | null
  lastMessage?: string; lastTime?: string
  unread?: number
  members: ChannelMember[]
  partnerId?: string
  createdBy?: string
  /** Set on type === 'task' channels — the linked Task id. Lets the
   *  Discussion sidebar match a channel to its task without an extra
   *  fetch. */
  taskId?: string | null
}
export interface ChatMessage {
  id: string; content: string; createdAt: string; editedAt: string | null
  sender: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  reads?: { userId: string; readAt?: string }[]
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
  recentReplies?: { content: string; createdAt: string; sender: { alias: string | null; username: string; avatarUrl: string | null } }[]
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
  stagingUrl?: string | null
  productionUrl?: string | null
  stagingLinkId?: string | null
  productionLinkId?: string | null
  project: { id: string; name: string; color: string } | null
  section: { id: string; name: string } | null
  assignee: { id: string; username: string; alias: string | null; avatarUrl: string | null } | null
  creator?: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  multiAssignees?: { user: UserInfo }[]
  comments?: TaskComment[]
  subtasks?: Task[]
  activities?: TaskActivityItem[]
  /** 1:1 backing channel for the task discussion (post-migration).
   *  Null for subtasks — they use their parent's channel. */
  discussionChannel?: { id: string } | null
  /** Resolved channel id (own channel, or parent's for subtasks).
   *  Use this rather than discussionChannel.id when subscribing to
   *  realtime updates so subtasks work too. */
  discussionChannelId?: string | null
  attachments?: TaskAttachment[]
  _count: { comments: number; subtasks: number }
}
export interface TaskComment {
  id: string; body: string; createdAt: string; editedAt: string | null; attachmentUrl: string | null; attachmentName: string | null
  parentCommentId: string | null
  user: { id: string; username: string; alias: string | null; avatarUrl: string | null }
  reactions?: { id: string; emoji: string; userId: string; user: { id: string; username: string; alias: string | null } }[]
  replies?: TaskComment[]
}
export interface TaskAttachment {
  id: string; url: string; name: string; mimeType: string | null; size?: number | null; createdAt: string
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

export type Tab = 'home' | 'messages' | 'tasks' | 'activity' | 'calendar' | 'report' | 'settings'
export interface NavItem { id: Tab; icon: (active: boolean) => React.ReactNode; label: string }

export interface TaskNotificationItem {
  id: string
  type: 'assigned' | 'discussion' | 'status_change' | 'mentioned' | 'subtask_update'
  message: string
  createdAt: string
  readAt: string | null
  taskId: string
  /** When set, click should deep-link to this comment in the discussion. */
  commentId?: string | null
  /** When set, the notification is about a specific subtask under taskId. */
  subtaskId?: string | null
  task: { id: string; title: string; parentTaskId: string | null; project: { name: string } | null }
  actorId?: string | null
}
