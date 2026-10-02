export type CommentStatus =
  | "pending"
  | "answered"
  | "skipped"
  | "needs_review"
  | "error";

export type CommentCategory =
  | "AMEN"
  | "THANKS"
  | "BLESSINGS"
  | "TESTIMONIAL"
  | "PRAYER_REQUEST"
  | "SAD_WAITING"
  | "NAMES_ONLY"
  | "GENERIC"
  | "NO_REPLY"
  | "REVIEW_REQUIRED";

export type YoutubeCommentRow = {
  id: string;
  channelId: string;
  youtubeCommentId: string;
  youtubeThreadId: string;
  videoId: string;
  videoTitle: string | null;
  authorName: string | null;
  authorChannelId: string | null;
  authorProfileImageUrl: string | null;
  commentText: string;
  publishedAt: string | null;
  updatedAtYt: string | null;
  likeCount: number;
  replyCount: number;
  ourReplyId: string | null;
  ourReplyText: string | null;
  category: CommentCategory | null;
  status: CommentStatus;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommentAutomationConfig = {
  enabled: boolean;
  language: "es" | "pt" | "en";
  aiEnabled: boolean;
  maxPerRun: number;
  skipDelicate: boolean;
  varyResponses: boolean;
  skipAlreadyAnswered: boolean;
  responseSets?: Partial<Record<CommentCategory, string[]>>;
};

export type CommentRunLogEntry = {
  at: string;
  youtubeCommentId: string;
  authorName: string | null;
  action: "answered" | "skipped" | "needs_review" | "error" | "dry_run";
  category?: CommentCategory | null;
  replyText?: string | null;
  message?: string | null;
};

export type YoutubeCommentRun = {
  id: string;
  channelId: string;
  status: "running" | "completed" | "stopped" | "quota_stopped" | "error";
  dryRun: boolean;
  maxItems: number;
  processed: number;
  answered: number;
  skipped: number;
  needsReview: number;
  errors: number;
  stopRequested: boolean;
  log: CommentRunLogEntry[];
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export const DEFAULT_COMMENT_AUTOMATION: CommentAutomationConfig = {
  enabled: true,
  language: "es",
  aiEnabled: false,
  maxPerRun: 50,
  skipDelicate: true,
  varyResponses: true,
  skipAlreadyAnswered: true,
};
