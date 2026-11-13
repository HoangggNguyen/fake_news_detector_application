import { lookup } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import { get as httpGet, type IncomingHttpHeaders, type RequestOptions } from 'node:http'
import { get as httpsGet } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { UserFacingError } from './errors.js'

const maxArticleBytes = 1_000_000
const maxRedirects = 3

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7))

  if (isIP(normalized) === 4) {
    const [first, second] = normalized.split('.').map(Number)
    return (
      first === 0 || first === 10 || first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    )
  }

  return !/^[23]/.test(normalized) || normalized.startsWith('2001:db8')
}

async function assertPublicUrl(value: string): Promise<{ url: URL; addresses: LookupAddress[] }> {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new UserFacingError('Chỉ hỗ trợ đường dẫn http:// hoặc https:// công khai.')
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new UserFacingError('Đường dẫn trỏ tới địa chỉ mạng nội bộ nên không được phép.')
  }
  return { url, addresses }
}

function downloadPage(url: URL, addresses: LookupAddress[]): Promise<{
  statusCode: number
  headers: IncomingHttpHeaders
  body: string
}> {
  return new Promise((resolve, reject) => {
    const pinnedLookup = ((
      _hostname: string,
      options: number | { family?: number },
      callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void,
    ) => {
      const family = typeof options === 'number' ? options : options.family ?? 0
      const address = addresses.find((candidate) => !family || candidate.family === family)
      if (!address) {
        const error = Object.assign(new Error('Không có địa chỉ IP công khai phù hợp.'), { code: 'ENOTFOUND' })
        callback(error, '', 0)
        return
      }
      callback(null, address.address, address.family)
    }) as LookupFunction

    const transport = url.protocol === 'https:' ? httpsGet : httpGet
    const requestOptions = {
      headers: { 'User-Agent': 'NewsroomFactCheck/0.1' },
      lookup: pinnedLookup,
      autoSelectFamily: false,
    } as RequestOptions & { autoSelectFamily: boolean }
    const request = transport(url, requestOptions, (response) => {
      const declaredLength = Number(response.headers['content-length'] ?? 0)
      if (declaredLength > maxArticleBytes) {
        request.destroy(new UserFacingError('Bài viết vượt quá giới hạn 1 MB.'))
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.byteLength
        if (size > maxArticleBytes) {
          request.destroy(new UserFacingError('Bài viết vượt quá giới hạn 1 MB.'))
          return
        }
        chunks.push(buffer)
      })
      response.on('end', () => resolve({
        statusCode: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
      response.on('error', reject)
    })
    request.setTimeout(10_000, () => request.destroy(new UserFacingError('Hết thời gian tải bài viết.')))
    request.on('error', reject)
  })
}

export async function extractArticle(sourceUrl: string): Promise<{ text: string; url: string; title: string | null }> {
  let currentUrl = sourceUrl
  let response: Awaited<ReturnType<typeof downloadPage>> | undefined
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const { url: safeUrl, addresses } = await assertPublicUrl(currentUrl)
    response = await downloadPage(safeUrl, addresses)
    if (![301, 302, 303, 307, 308].includes(response.statusCode)) break
    const location = response.headers.location
    if (!location || redirectCount === maxRedirects) throw new UserFacingError('Đường dẫn chuyển hướng quá nhiều lần.')
    currentUrl = new URL(location, safeUrl).toString()
  }

  if (!response || response.statusCode < 200 || response.statusCode >= 300) {
    console.warn(`Article download returned HTTP ${response?.statusCode ?? 'unknown'}`)
    throw new UserFacingError('Trang web không cho tải bài viết này. Bạn có thể dán trực tiếp nội dung bài.')
  }
  const contentType = String(response.headers['content-type'] ?? '').toLowerCase()
  if (!contentType.includes('text/html') && !contentType.startsWith('text/plain')) {
    throw new UserFacingError('Đường dẫn này không phải trang bài viết (không có nội dung HTML hoặc văn bản).')
  }
  const body = response.body
  if (contentType.startsWith('text/plain')) return { text: body.slice(0, 100_000), url: currentUrl, title: null }

  const document = new JSDOM(body, { url: currentUrl }).window.document
  const article = new Readability(document).parse()
  const text = article?.textContent?.replace(/\s+/g, ' ').trim()
  if (!text) throw new UserFacingError('Không trích xuất được nội dung bài viết.')
  return { text: text.slice(0, 100_000), url: currentUrl, title: article?.title?.trim() || null }
}
