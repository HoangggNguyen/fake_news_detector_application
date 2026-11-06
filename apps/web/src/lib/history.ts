/**
 * Lịch sử kiểm tra lưu trong trình duyệt (localStorage).
 * localStorage có thể bị chặn (chế độ ẩn danh, chính sách trình duyệt) hoặc bị sửa tay,
 * nên mọi thao tác đều bọc try/catch và dữ liệu đọc ra được kiểm tra lại kiểu.
 */

import type { AnalysisInput, OverallLabel, ViewResult } from '../api/contract'
import { config } from '../config'

const STORAGE_KEY = 'fakenews.history.v1'

export interface HistoryEntry {
  id: string
  createdAt: string
  input: AnalysisInput
  label: OverallLabel
  fakeProbability: number | null
  credibilityScore: number | null
}

function isEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const input = v.input as Record<string, unknown> | undefined
  return (
    typeof v.id === 'string' &&
    typeof v.createdAt === 'string' &&
    typeof v.label === 'string' &&
    typeof input === 'object' &&
    input !== null &&
    (input.type === 'text' || input.type === 'url') &&
    typeof input.content === 'string' &&
    (v.fakeProbability === null || typeof v.fakeProbability === 'number') &&
    (v.credibilityScore === null || typeof v.credibilityScore === 'number')
  )
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, config.historyLimit) : []
  } catch {
    return []
  }
}

function persist(entries: HistoryEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Hết dung lượng hoặc bị chặn: lịch sử chỉ là tiện ích, bỏ qua.
  }
}

export function addToHistory(current: HistoryEntry[], result: ViewResult): HistoryEntry[] {
  const entry: HistoryEntry = {
    id: result.id,
    createdAt: result.createdAt,
    input: result.input,
    label: result.label,
    fakeProbability: result.fakeProbability,
    credibilityScore: result.credibilityScore,
  }
  // Cùng nội dung thì chỉ giữ lần mới nhất.
  const next = [entry, ...current.filter((e) => e.input.content !== entry.input.content)].slice(0, config.historyLimit)
  persist(next)
  return next
}

export function clearHistory(): HistoryEntry[] {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // bỏ qua
  }
  return []
}
