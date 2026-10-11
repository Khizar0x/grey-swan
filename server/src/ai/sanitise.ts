// Layer 1a: everything a user typed is cleaned in plain code before any model
// sees it. The output of this file is the ONLY form of user text that reaches
// a prompt.

export const LIMITS = { statement: 1500, answerValue: 200, answerKey: 40, answerCount: 20 } as const

export interface Sanitised {
  text: string
  // Things a normal honest statement doesn't contain. Any of these is treated
  // as an injection signal by the router (fail closed).
  suspicious: string[]
}

// zero-width, soft hyphen, word joiner, BOM, mongolian vowel separator
const INVISIBLE = /[­᠎​-‏⁠-⁤﻿]/gu
// bidi embeddings/overrides/isolates + arabic letter mark
const BIDI = /[؜‪-‮⁦-⁩]/gu
// unicode "tag" characters (invisible ASCII smuggling) and variation selectors
const TAGS = /[\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}︀-️]/gu
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu

const EMAIL = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/gu
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/giu
const BASE58_WALLET = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/gu
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/giu
const PHONE = /(?<!\w)\+?\d[\d\s().-]{8,}\d(?!\w)/gu
const BLOB = /[A-Za-z0-9+/_=-]{40,}/gu

export function sanitiseText(input: string, maxLen: number): Sanitised {
  const suspicious: string[] = []
  let t = String(input ?? '').normalize('NFKC')

  const strip = (re: RegExp, label: string, replacement = '') => {
    const next = t.replace(re, replacement)
    if (next !== t) suspicious.push(label)
    t = next
  }
  strip(INVISIBLE, 'invisible_chars')
  strip(BIDI, 'bidi_chars')
  strip(TAGS, 'tag_chars')
  t = t.replace(CONTROL, ' ') // tabs/newlines/etc become spaces; not suspicious on their own

  // Markup: html-ish tags, entities, code fences, markdown links, and any
  // stray angle brackets/braces so nothing can imitate our delimiter tags.
  strip(/<[^>]*>/gu, 'markup', ' ')
  strip(/&(?:#\d+|#x[\da-f]+|\w+);/giu, 'markup', ' ')
  strip(/```[\s\S]*?```|```/gu, 'markup', ' ')
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/gu, (_m, label: string) => {
    suspicious.push('markup')
    return label
  })
  strip(/[<>{}]/gu, 'markup', ' ')

  // Identity data never reaches a model.
  t = t.replace(EMAIL, '[removed]').replace(URL_RE, '[removed]').replace(UK_POSTCODE, '[removed]')
  t = t.replace(BASE58_WALLET, '[removed]').replace(PHONE, '[removed]')
  strip(BLOB, 'encoded_blob', '[removed]')

  t = t.replace(/\s+/gu, ' ').trim()
  if (t.length > maxLen) {
    t = t.slice(0, maxLen)
    suspicious.push('truncated')
  }
  return { text: t, suspicious: [...new Set(suspicious)] }
}

export function sanitiseAnswers(answers: Record<string, string>): { answers: Record<string, string>; suspicious: string[] } {
  const out: Record<string, string> = {}
  const suspicious: string[] = []
  for (const [k, v] of Object.entries(answers).slice(0, LIMITS.answerCount)) {
    const key = sanitiseText(k, LIMITS.answerKey)
    const val = sanitiseText(v, LIMITS.answerValue)
    suspicious.push(...key.suspicious, ...val.suspicious)
    out[key.text || 'answer'] = val.text
  }
  if (Object.keys(answers).length > LIMITS.answerCount) suspicious.push('truncated')
  return { answers: out, suspicious: [...new Set(suspicious)] }
}

// ---- Code-side injection heuristic ------------------------------------
// Belt and braces: cheap pattern checks that don't depend on a model being
// vigilant. Covers common English phrasing, a few other languages, and short
// base64/hex/rot13 payloads. It will never catch everything — the model flags,
// the two-model agreement rule and the tier cap are the other layers.

const PHRASES: RegExp[] = [
  /ignore (?:all |any |the )?(?:previous|prior|above|earlier)/iu,
  /disregard/iu,
  /forget (?:all |your |the )?(?:previous|prior|instructions|rules)/iu,
  /(?:new|updated|override) instructions?/iu,
  /\bsystem\s*(?:message|prompt|:|override|note)/iu,
  /\b(?:you are|act as|pretend)\b.{0,30}\b(?:now|an? (?:ai|assistant|judge|admin))/iu,
  /\b(?:assistant|developer|admin(?:istrator)?)\s*:/iu,
  /\b(?:post[_ ]?verdict|verdict|tier)\b.{0,20}\b(?:0|zero|none|normal)/iu,
  /\b(?:approve|release|refund)\b.{0,25}\b(?:deposit|full|all|immediately)/iu,
  /\bdo not (?:flag|escalate|mention|route)/iu,
  /\boutput (?:only|exactly|the following)/iu,
  /\bcanary\b|\bdelimiter\b|\bsystem prompt\b|\bjson\b.{0,10}\bschema\b/iu,
  // other languages: ignore previous instructions
  /ignora(?:r)? (?:las |todas las )?instrucciones/iu,
  /ignore[zr]? (?:les |toutes les )?instructions/iu,
  /ignorier(?:e|en)? (?:alle |die )?(?:vorherigen )?anweisungen/iu,
  /ignora(?:re)? (?:le )?istruzioni/iu,
  /игнорируй|игнорировать|предыдущие инструкции/iu,
  /忽略|无视|無視|忽視|之前的指示/u,
  /تجاهل|تعليمات سابقة/u,
  /अनदेखा|निर्देशों को नज़रअंदाज़/u,
  /이전 지시|무시하/u,
]

function rot13(s: string): string {
  return s.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })
}

function decodedVariants(text: string): string[] {
  const out: string[] = [rot13(text)]
  for (const m of text.matchAll(/[A-Za-z0-9+/]{16,}={0,2}/gu)) {
    try {
      const d = Buffer.from(m[0], 'base64').toString('utf8')
      if (/^[\x20-\x7E]{6,}$/u.test(d)) out.push(d)
    } catch { /* not base64 */ }
  }
  for (const m of text.matchAll(/(?:[0-9a-f]{2}[\s:]?){8,}/giu)) {
    const hex = m[0].replace(/[^0-9a-f]/giu, '')
    if (hex.length % 2 === 0) {
      const d = Buffer.from(hex, 'hex').toString('utf8')
      if (/^[\x20-\x7E]{6,}$/u.test(d)) out.push(d)
    }
  }
  return out
}

export function looksLikeInjection(text: string): boolean {
  const spaced = text.replace(/[\s._*\-|]+/gu, ' ') // "i g n o r e" / "ignore__previous"
  const squashed = text.replace(/\s+/gu, '')
  const candidates = [text, spaced, ...decodedVariants(text)]
  if (squashed.length < 400) candidates.push(squashed.replace(/([a-z])(?=[A-Z])/gu, '$1 '))
  return candidates.some((c) => PHRASES.some((re) => re.test(c)))
}
