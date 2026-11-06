import type { ClaimResult, OverallLabel } from '../api/contract'

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function seconds(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`
  return `${(ms / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giây`
}

export function dateTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

export function excerpt(text: string, max = 110): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export type Tone = 'fake' | 'real' | 'mixed' | 'unknown'

export const LABEL_TEXT: Record<OverallLabel, { title: string; short: string; tone: Tone }> = {
  likely_false: { title: 'Có dấu hiệu là tin giả', short: 'Tin giả', tone: 'fake' },
  likely_true: { title: 'Nhiều khả năng là tin thật', short: 'Tin thật', tone: 'real' },
  mixed: { title: 'Thông tin lẫn lộn', short: 'Lẫn lộn', tone: 'mixed' },
  insufficient_evidence: { title: 'Chưa đủ cơ sở kết luận', short: 'Chưa rõ', tone: 'unknown' },
}

export const VERDICT_TEXT: Record<ClaimResult['verdict'], { text: string; tone: Tone }> = {
  supported: { text: 'Được xác nhận', tone: 'real' },
  refuted: { text: 'Bị bác bỏ', tone: 'fake' },
  mixed: { text: 'Lẫn lộn', tone: 'mixed' },
  unverifiable: { text: 'Chưa kiểm chứng được', tone: 'unknown' },
}

/**
 * Mức chắc chắn của mô hình phân loại, dựa vào khoảng cách xác suất tới ngưỡng 0.5.
 * Mức thấp nghĩa là mô hình phân vân, người dùng cần kiểm chứng thêm.
 */
export function certainty(probFake: number): { level: 'cao' | 'trung bình' | 'thấp'; note: string } {
  const distance = Math.abs(probFake - 0.5)
  if (distance >= 0.35) return { level: 'cao', note: 'Mô hình khá chắc chắn với kết luận này.' }
  if (distance >= 0.15) return { level: 'trung bình', note: 'Nên đối chiếu thêm với nguồn chính thống.' }
  return { level: 'thấp', note: 'Mô hình đang phân vân. Đừng dựa vào kết quả này, hãy tự kiểm chứng.' }
}
