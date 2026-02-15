import { ObjectId, ReadPreference, type Document } from "mongodb";
import { getDb } from "../config/database";
import { env } from "../config/env";
import type { QueryRequest } from "./queryBuilder";

export type MatchSource = "direct" | "nearby" | "fallback" | "unmatched";

export interface ConversationCustomerRow {
  occurredAt: string;
  answerAt: string;
  responseLatencyMs: number | null;
  channel: string;
  sessionId: string;
  customerId: string;
  questionCreatorType: string;
  questionCreatorRaw: string;
  questionText: string;
  finalAnswerText: string;
  finalAnswerModel: string;
  modelConfidence: number;
  creditUsed: number;
  sessionCreditTotal: number;
  matchSource: MatchSource;
  like: "좋아요" | "나빠요" | "";
  likeConfidence: number;
}

export interface ConversationCustomerSummary {
  totalRows: number;
  totalCreditUsed: number;
  fallbackCount: number;
  unmatchedCount: number;
}

export interface ConversationCustomerReportResult {
  rows: ConversationCustomerRow[];
  summary: ConversationCustomerSummary;
  pageSize: number;
  hasMore: boolean;
}

interface ChatMessageDoc extends Document {
  _id: ObjectId;
  creator?: string | ObjectId;
  creatorType?: string;
  channel?: string | ObjectId;
  session?: string | ObjectId;
  text?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UsageLogDoc extends Document {
  _id: ObjectId;
  channel?: string | ObjectId;
  creator?: string | ObjectId;
  amount?: number;
  createdAt?: Date;
  aiModel?: string;
  model?: string;
}

interface BotChatDoc extends Document {
  _id: ObjectId;
  channel?: string | ObjectId;
  aiModel?: string;
  createdAt?: Date;
}

interface TurnContext {
  question: ChatMessageDoc;
  answer: ChatMessageDoc | null;
  channel: string;
  sessionId: string;
  customerId: string;
}

interface LikeResolution {
  value: "좋아요" | "나빠요" | "";
  confidence: number;
}

const QUESTION_TYPES = new Set(["user", "guest", "customer", "human"]);
const ANSWER_TYPES = new Set(["assistant", "bot", "ai", "system"]);

function normalizeValue(value: unknown): string {
  if (value instanceof ObjectId) {
    return value.toHexString();
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

function toPositiveNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? value : 0;
  }

  return 0;
}

function normalizeModelValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const model = value.trim();
  return model.length > 0 ? model : null;
}

function toDateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function isQuestionMessage(message: ChatMessageDoc, customerId: string): boolean {
  const creator = normalizeValue(message.creator);
  const creatorType = normalizeValue(message.creatorType).toLowerCase();

  if (creator === customerId) {
    return true;
  }

  return QUESTION_TYPES.has(creatorType);
}

function isAnswerMessage(message: ChatMessageDoc): boolean {
  const creatorType = normalizeValue(message.creatorType).toLowerCase();
  return ANSWER_TYPES.has(creatorType);
}

function resolveDefaultModelByMatchSource(source: MatchSource): string {
  if (source === "direct" || source === "nearby") {
    return "unknown";
  }

  return "unknown";
}

function clampMatchWindowSec(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 60;
  }

  return Math.max(1, Math.min(300, Math.floor(value)));
}

function buildSessionKey(channel: string, sessionId: string): string {
  return `${channel}::${sessionId}`;
}

function extractModelFromUsageLog(log: UsageLogDoc): string | null {
  return normalizeModelValue(log.aiModel) ?? normalizeModelValue(log.model);
}

function pickClosestUsageLogByTime(baseTime: Date, candidates: UsageLogDoc[]): UsageLogDoc | null {
  if (candidates.length === 0) {
    return null;
  }

  let picked: UsageLogDoc | null = null;
  let minDiff = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const ts = toDateValue(candidate.createdAt);
    if (!ts) {
      continue;
    }

    const diff = Math.abs(ts.getTime() - baseTime.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      picked = candidate;
    }
  }

  return picked;
}

function findLatestModelBefore(
  messageTime: Date,
  modelTimeline: Array<{ at: Date; model: string }>
): string | null {
  for (let index = modelTimeline.length - 1; index >= 0; index -= 1) {
    const item = modelTimeline[index];
    if (item.at.getTime() <= messageTime.getTime()) {
      return item.model;
    }
  }

  return null;
}

function roundTo3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveLikeValue(value: unknown): "좋아요" | "나빠요" | "" {
  if (typeof value === "boolean") {
    return value ? "좋아요" : "나빠요";
  }

  if (typeof value === "number") {
    if (value > 0) {
      return "좋아요";
    }

    if (value < 0) {
      return "나빠요";
    }

    return "";
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["like", "liked", "up", "upvote", "thumbsup", "positive", "good", "좋아요"].includes(normalized)) {
      return "좋아요";
    }

    if (["dislike", "disliked", "down", "downvote", "thumbsdown", "negative", "bad", "나빠요"].includes(normalized)) {
      return "나빠요";
    }
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const nestedCandidates: unknown[] = [
      obj.like,
      obj.dislike,
      obj.status,
      obj.value,
      obj.type,
      obj.sentiment,
    ];

    for (const candidate of nestedCandidates) {
      const resolved = resolveLikeValue(candidate);
      if (resolved) {
        return resolved;
      }
    }
  }

  return "";
}

function resolveLikeFromTurn(turn: TurnContext): LikeResolution {
  const answerDoc = (turn.answer ?? {}) as Record<string, unknown>;
  const questionDoc = (turn.question ?? {}) as Record<string, unknown>;

  const weightedCandidates: Array<{ value: unknown; confidence: number }> = [
    { value: answerDoc.like, confidence: 1 },
    { value: answerDoc.dislike, confidence: 1 },
    { value: answerDoc.feedback, confidence: 0.95 },
    { value: answerDoc.feedbackType, confidence: 0.95 },
    { value: answerDoc.reaction, confidence: 0.9 },
    { value: answerDoc.review, confidence: 0.85 },
    { value: answerDoc.rating, confidence: 0.85 },
    { value: questionDoc.like, confidence: 0.8 },
    { value: questionDoc.dislike, confidence: 0.8 },
    { value: questionDoc.feedback, confidence: 0.75 },
    { value: questionDoc.feedbackType, confidence: 0.75 },
    { value: questionDoc.reaction, confidence: 0.7 },
    { value: questionDoc.review, confidence: 0.65 },
    { value: questionDoc.rating, confidence: 0.65 },
  ];

  for (const candidate of weightedCandidates) {
    const resolved = resolveLikeValue(candidate.value);
    if (resolved) {
      return {
        value: resolved,
        confidence: roundTo2(candidate.confidence),
      };
    }
  }

  return {
    value: "",
    confidence: 0,
  };
}

function ensureDateRange(request: QueryRequest): { start: Date; end: Date } {
  const start = new Date(request.dateRange.start);
  const end = new Date(request.dateRange.end);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("dateRange.start/end must be valid datetime strings");
  }

  if (start.getTime() > end.getTime()) {
    throw new Error("dateRange.start must be before or equal to dateRange.end");
  }

  return { start, end };
}

function buildConversationsMatch(request: QueryRequest, startedAt: Date, endedAt: Date): Document {
  const customerId = (request.customerId ?? "").trim();

  if (!customerId) {
    throw new Error("customerId is required for customer report mode");
  }

  const creatorCandidates: Array<string | ObjectId> = [customerId];
  if (ObjectId.isValid(customerId)) {
    creatorCandidates.push(new ObjectId(customerId));
  }

  const match: Document = {
    creator: { $in: creatorCandidates },
    createdAt: {
      $gte: startedAt,
      $lte: endedAt,
    },
  };

  const channelFilter = request.filters?.channel;
  if (typeof channelFilter === "string" && channelFilter.trim().length > 0) {
    const channel = channelFilter.trim();
    const channelCandidates: Array<string | ObjectId> = [channel];
    if (ObjectId.isValid(channel)) {
      channelCandidates.push(new ObjectId(channel));
    }

    match.channel = { $in: channelCandidates };
  }

  return match;
}

function buildUsageMatch(
  channelSet: Set<string>,
  minTime: Date,
  maxTime: Date
): Document {
  const channelValues = Array.from(channelSet);
  const channelMatchCandidates: Array<string | ObjectId> = [];

  for (const channel of channelValues) {
    channelMatchCandidates.push(channel);
    if (ObjectId.isValid(channel)) {
      channelMatchCandidates.push(new ObjectId(channel));
    }
  }

  return {
    channel: { $in: channelMatchCandidates },
    createdAt: {
      $gte: minTime,
      $lte: maxTime,
    },
  };
}

function buildTurns(messages: ChatMessageDoc[], customerId: string): TurnContext[] {
  const turns: TurnContext[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];

    if (!isQuestionMessage(message, customerId)) {
      continue;
    }

    const questionCreatedAt = toDateValue(message.createdAt);
    if (!questionCreatedAt) {
      continue;
    }

    const channel = normalizeValue(message.channel);
    const sessionId = normalizeValue(message.session);
    const creator = normalizeValue(message.creator);

    if (!channel || !sessionId || !creator) {
      continue;
    }

    let answer: ChatMessageDoc | null = null;
    for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
      const candidate = messages[nextIndex];
      const candidateSession = normalizeValue(candidate.session);

      if (candidateSession !== sessionId) {
        continue;
      }

      if (!isAnswerMessage(candidate)) {
        continue;
      }

      answer = candidate;
      break;
    }

    turns.push({
      question: message,
      answer,
      channel,
      sessionId,
      customerId: creator,
    });
  }

  return turns;
}

export async function buildConversationCustomerReport(
  request: QueryRequest
): Promise<ConversationCustomerReportResult> {
  const pageSize = Math.min(request.pageSize ?? 100, env.MAX_EXPORT_ROWS);
  const sortOrder = request.sortOrder ?? "asc";
  const matchWindowSec = clampMatchWindowSec(request.matchWindowSec);
  const fallbackWindowMs = 5 * 60 * 1000;
  const directWindowMs = matchWindowSec * 1000;

  const { start, end } = ensureDateRange(request);

  const prodDb = await getDb("prod");
  const conversationsMatch = buildConversationsMatch(request, start, end);

  const questionMessages = (await prodDb
    .collection<ChatMessageDoc>("chats")
    .find(conversationsMatch, {
      projection: {
        _id: 1,
        creator: 1,
        creatorType: 1,
        channel: 1,
        session: 1,
        text: 1,
        createdAt: 1,
      },
      readPreference: ReadPreference.SECONDARY_PREFERRED,
      maxTimeMS: env.QUERY_TIMEOUT_MS,
    })
    .sort({ createdAt: sortOrder === "asc" ? 1 : -1, _id: 1 })
    .limit(pageSize + 1)
    .toArray()) as ChatMessageDoc[];

  const hasMore = questionMessages.length > pageSize;
  const visibleQuestions = hasMore ? questionMessages.slice(0, pageSize) : questionMessages;

  const sessionIds = new Set<string>();
  const channels = new Set<string>();

  for (const message of visibleQuestions) {
    const sessionId = normalizeValue(message.session);
    const channel = normalizeValue(message.channel);

    if (sessionId) {
      sessionIds.add(sessionId);
    }

    if (channel) {
      channels.add(channel);
    }
  }

  if (sessionIds.size === 0 || channels.size === 0) {
    return {
      rows: [],
      summary: {
        totalRows: 0,
        totalCreditUsed: 0,
        fallbackCount: 0,
        unmatchedCount: 0,
      },
      pageSize,
      hasMore,
    };
  }

  const sessionMatchCandidates: Array<string | ObjectId> = [];
  for (const sessionId of sessionIds) {
    sessionMatchCandidates.push(sessionId);
    if (ObjectId.isValid(sessionId)) {
      sessionMatchCandidates.push(new ObjectId(sessionId));
    }
  }

  const sessionMessages = (await prodDb
    .collection<ChatMessageDoc>("chats")
    .find(
      {
        session: { $in: sessionMatchCandidates },
      },
      {
        projection: {
          _id: 1,
          creator: 1,
          creatorType: 1,
          channel: 1,
          session: 1,
          text: 1,
          createdAt: 1,
        },
        readPreference: ReadPreference.SECONDARY_PREFERRED,
        maxTimeMS: env.QUERY_TIMEOUT_MS,
      }
    )
    .sort({ createdAt: 1, _id: 1 })
    .toArray()) as ChatMessageDoc[];

  const sessionGrouped = new Map<string, ChatMessageDoc[]>();

  for (const message of sessionMessages) {
    const channel = normalizeValue(message.channel);
    const sessionId = normalizeValue(message.session);

    if (!channel || !sessionId) {
      continue;
    }

    const key = buildSessionKey(channel, sessionId);
    const group = sessionGrouped.get(key) ?? [];
    group.push(message);
    sessionGrouped.set(key, group);
  }

  const reportStart = new Date(start.getTime() - fallbackWindowMs);
  const reportEnd = new Date(end.getTime() + fallbackWindowMs);

  const usageMatch = buildUsageMatch(channels, reportStart, reportEnd);

  const usageLogs = (await prodDb
    .collection<UsageLogDoc>("usagelogs")
    .find(usageMatch, {
      projection: {
        _id: 1,
        channel: 1,
        creator: 1,
        amount: 1,
        createdAt: 1,
        aiModel: 1,
        model: 1,
      },
      readPreference: ReadPreference.SECONDARY_PREFERRED,
      maxTimeMS: env.QUERY_TIMEOUT_MS,
    })
    .sort({ createdAt: 1, _id: 1 })
    .toArray()) as UsageLogDoc[];

  const botChats = (await prodDb
    .collection<BotChatDoc>("botchats")
    .find(
      {
        channel: { $in: Array.from(channels) },
        createdAt: {
          $gte: reportStart,
          $lte: reportEnd,
        },
      },
      {
        projection: {
          _id: 1,
          channel: 1,
          aiModel: 1,
          createdAt: 1,
        },
        readPreference: ReadPreference.SECONDARY_PREFERRED,
        maxTimeMS: env.QUERY_TIMEOUT_MS,
      }
    )
    .sort({ createdAt: 1, _id: 1 })
    .toArray()) as BotChatDoc[];

  const usageByChannel = new Map<string, UsageLogDoc[]>();
  for (const usage of usageLogs) {
    const channel = normalizeValue(usage.channel);
    if (!channel) {
      continue;
    }

    const list = usageByChannel.get(channel) ?? [];
    list.push(usage);
    usageByChannel.set(channel, list);
  }

  const modelTimelineByChannel = new Map<string, Array<{ at: Date; model: string }>>();

  for (const usage of usageLogs) {
    const channel = normalizeValue(usage.channel);
    const at = toDateValue(usage.createdAt);
    const model = extractModelFromUsageLog(usage);

    if (!channel || !at || !model) {
      continue;
    }

    const timeline = modelTimelineByChannel.get(channel) ?? [];
    timeline.push({ at, model });
    modelTimelineByChannel.set(channel, timeline);
  }

  for (const botchat of botChats) {
    const channel = normalizeValue(botchat.channel);
    const at = toDateValue(botchat.createdAt);
    const model = normalizeModelValue(botchat.aiModel);

    if (!channel || !at || !model) {
      continue;
    }

    const timeline = modelTimelineByChannel.get(channel) ?? [];
    timeline.push({ at, model });
    modelTimelineByChannel.set(channel, timeline);
  }

  for (const timeline of modelTimelineByChannel.values()) {
    timeline.sort((left, right) => left.at.getTime() - right.at.getTime());
  }

  const customerId = (request.customerId ?? "").trim();

  const turns: TurnContext[] = [];
  for (const [key, messages] of sessionGrouped.entries()) {
    const parsed = key.split("::");
    if (parsed.length !== 2) {
      continue;
    }

    const groupTurns = buildTurns(messages, customerId);
    turns.push(...groupTurns);
  }

  turns.sort((left, right) => {
    const leftTime = toDateValue(left.question.createdAt)?.getTime() ?? 0;
    const rightTime = toDateValue(right.question.createdAt)?.getTime() ?? 0;

    if (sortOrder === "asc") {
      return leftTime - rightTime;
    }

    return rightTime - leftTime;
  });

  const rows: ConversationCustomerRow[] = [];
  const sessionCreditTotals = new Map<string, number>();
  let fallbackCount = 0;
  let unmatchedCount = 0;
  let totalCreditUsed = 0;

  for (const turn of turns) {
    const questionAt = toDateValue(turn.question.createdAt);
    if (!questionAt) {
      continue;
    }

    const resolvedAnswerAt = toDateValue(turn.answer?.createdAt);
    const answerAt = resolvedAnswerAt ?? questionAt;
    const responseLatencyMs = resolvedAnswerAt
      ? Math.max(0, resolvedAnswerAt.getTime() - questionAt.getTime())
      : null;
    const channelUsage = usageByChannel.get(turn.channel) ?? [];

    const directCandidates = channelUsage.filter((usage) => {
      const usageAt = toDateValue(usage.createdAt);
      if (!usageAt) {
        return false;
      }

      const diff = Math.abs(usageAt.getTime() - answerAt.getTime());
      return diff <= directWindowMs;
    });

    let pickedUsage = pickClosestUsageLogByTime(answerAt, directCandidates);
    let matchSource: MatchSource;

    if (pickedUsage) {
      matchSource = "direct";
    } else {
      const nearbyCandidates = channelUsage.filter((usage) => {
        const usageAt = toDateValue(usage.createdAt);
        if (!usageAt) {
          return false;
        }

        const diff = answerAt.getTime() - usageAt.getTime();
        return diff >= 0 && diff <= fallbackWindowMs;
      });

      pickedUsage = pickClosestUsageLogByTime(answerAt, nearbyCandidates);
      matchSource = pickedUsage ? "nearby" : "unmatched";
    }

    const usageAmount = pickedUsage ? toPositiveNumber(pickedUsage.amount) : 0;
    const sessionKey = buildSessionKey(turn.channel, turn.sessionId);
    const previousSessionTotal = sessionCreditTotals.get(sessionKey) ?? 0;
    const nextSessionTotal = roundTo3(previousSessionTotal + usageAmount);
    sessionCreditTotals.set(sessionKey, nextSessionTotal);

    let finalAnswerModel = "unknown";
    let modelConfidence = 0;
    if (turn.answer) {
      const modelFromAnswer = normalizeModelValue((turn.answer as Document).aiModel);
      if (modelFromAnswer) {
        finalAnswerModel = modelFromAnswer;
        modelConfidence = 1;
      }
    }

    if (finalAnswerModel === "unknown" && pickedUsage) {
      const modelFromUsage = extractModelFromUsageLog(pickedUsage);
      if (modelFromUsage) {
        finalAnswerModel = modelFromUsage;
        modelConfidence = matchSource === "direct" ? 0.92 : 0.8;
      }
    }

    if (finalAnswerModel === "unknown") {
      const timeline = modelTimelineByChannel.get(turn.channel) ?? [];
      const fallbackModel = findLatestModelBefore(answerAt, timeline);
      if (fallbackModel) {
        finalAnswerModel = fallbackModel;
        modelConfidence = 0.65;
        if (matchSource === "unmatched") {
          matchSource = "fallback";
        }
      }
    }

    if (matchSource === "fallback") {
      fallbackCount += 1;
    }

    if (matchSource === "unmatched") {
      unmatchedCount += 1;
      finalAnswerModel = resolveDefaultModelByMatchSource(matchSource);
      modelConfidence = 0;
    }

    totalCreditUsed = roundTo3(totalCreditUsed + usageAmount);

    const likeResolution = resolveLikeFromTurn(turn);
    const questionCreatorType = normalizeValue(turn.question.creatorType).toLowerCase() || "unknown";
    const questionCreatorRaw = normalizeValue(turn.question.creator) || turn.customerId;

    rows.push({
      occurredAt: questionAt.toISOString(),
      answerAt: resolvedAnswerAt ? resolvedAnswerAt.toISOString() : "",
      responseLatencyMs,
      channel: turn.channel,
      sessionId: turn.sessionId,
      customerId: turn.customerId,
      questionCreatorType,
      questionCreatorRaw,
      questionText: (turn.question.text ?? "").trim(),
      finalAnswerText: (turn.answer?.text ?? "").trim(),
      finalAnswerModel,
      modelConfidence: roundTo2(modelConfidence),
      creditUsed: roundTo3(usageAmount),
      sessionCreditTotal: nextSessionTotal,
      matchSource,
      like: likeResolution.value,
      likeConfidence: likeResolution.confidence,
    });
  }

  return {
    rows,
    summary: {
      totalRows: rows.length,
      totalCreditUsed,
      fallbackCount,
      unmatchedCount,
    },
    pageSize,
    hasMore,
  };
}
