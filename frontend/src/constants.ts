import type { DataType } from './lib/api'

export const DATA_TYPES: DataType[] = [
  'conversations',
  'api_usage_logs',
  'event_logs',
  'error_logs',
  'billing_logs',
  'user_activities',
]

export interface DataTypeGuide {
  label: string
  description: string
  customerKey: string
  customerInputHint: string
  customerExample: string
  supportsUserLookup: boolean
}

export const DATA_TYPE_GUIDE: Record<DataType, DataTypeGuide> = {
  conversations: {
    label: '대화 로그',
    description: '채팅/대화 단위 로그를 조회합니다.',
    customerKey: 'creator (사용자 ID)',
    customerInputHint: '사용자 ID가 필요합니다. 이메일/이름을 알면 상단 고객 검색으로 찾을 수 있습니다.',
    customerExample: '예: 65f0c1e2d3a4b5c6d7e8f901',
    supportsUserLookup: true,
  },
  api_usage_logs: {
    label: 'API 사용 로그',
    description: '토큰/크레딧 사용량 중심 로그를 조회합니다.',
    customerKey: 'creator (사용자 ID)',
    customerInputHint: '사용자 ID가 필요합니다. 이메일/이름으로 고객 검색 후 자동 입력할 수 있습니다.',
    customerExample: '예: 65f0c1e2d3a4b5c6d7e8f901',
    supportsUserLookup: true,
  },
  event_logs: {
    label: '이벤트 로그',
    description: '서비스 이벤트/행동성 로그를 조회합니다.',
    customerKey: 'user_id',
    customerInputHint: 'user_id를 입력하세요. 운영자가 알고 있는 사용자 ID를 그대로 사용합니다.',
    customerExample: '예: user_123456',
    supportsUserLookup: false,
  },
  error_logs: {
    label: '에러 로그',
    description: '오류/예외 중심 로그를 조회합니다.',
    customerKey: 'ip',
    customerInputHint: '이 데이터 타입은 고객 식별값으로 IP를 사용합니다.',
    customerExample: '예: 203.0.113.10',
    supportsUserLookup: false,
  },
  billing_logs: {
    label: '결제/플랜 이력',
    description: '구독/플랜 변경 및 만료 관련 로그를 조회합니다.',
    customerKey: 'user (사용자 ID)',
    customerInputHint: '사용자 ID가 필요합니다. 이메일/이름으로 고객 검색 후 입력 가능합니다.',
    customerExample: '예: 65f0c1e2d3a4b5c6d7e8f901',
    supportsUserLookup: true,
  },
  user_activities: {
    label: '사용자 활동 로그',
    description: '세션/채널 기반 활동 로그를 조회합니다.',
    customerKey: 'channel',
    customerInputHint: '운영자가 알고 있는 채널 ID를 Customer ID에 그대로 입력하세요.',
    customerExample: '예: channel_abc123',
    supportsUserLookup: false,
  },
}
