import { z } from 'zod'

export const analysisSchema = z.object({
  type: z.enum(['text', 'url']),
  content: z.string().trim().min(10).max(100_000),
  conversation_id: z.string().uuid(),
}).superRefine((input, context) => {
  if (input.type !== 'url') return

  try {
    const url = new URL(input.content)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      context.addIssue({
        code: 'custom',
        message: 'Chỉ chấp nhận URL HTTP(S) công khai, không kèm thông tin đăng nhập.',
        path: ['content'],
      })
    }
  } catch {
    context.addIssue({ code: 'custom', message: 'Đường dẫn URL không hợp lệ.', path: ['content'] })
  }
})