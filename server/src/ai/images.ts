import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

export interface PreparedImage {
  base64: string
  mediaType: 'image/jpeg'
  sha256: string
}

// Every image is downscaled and recompressed before it leaves the machine:
// cheaper tokens, and re-encoding drops EXIF (GPS, device info) and any
// non-pixel payload hiding in the file.
export async function prepareImage(filePath: string, maxSide = 1024): Promise<PreparedImage> {
  const input = await readFile(filePath)
  const buf = await sharp(input)
    .rotate() // honour EXIF orientation before the metadata is dropped
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer()
  return { base64: buf.toString('base64'), mediaType: 'image/jpeg', sha256: createHash('sha256').update(buf).digest('hex') }
}
