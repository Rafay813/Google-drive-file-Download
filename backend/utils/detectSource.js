const detectSource = (url) => {
  if (!url || typeof url !== 'string') return null

  const trimmed = url.trim()

  // ─── Google Drive ─────────────────────────────────────────────
  if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com')) {
    const fileId = extractDriveId(trimmed)
    if (!fileId) return null
    // Always use clean URL regardless of usp parameter
    const cleanUrl = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`
    return { source: 'googledrive', fileId, url: cleanUrl }
  }

  // ─── Dropbox ──────────────────────────────────────────────────
  if (trimmed.includes('dropbox.com')) {
    let directUrl = trimmed
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace('?dl=0', '?dl=1')
      .replace('&dl=0', '&dl=1')
    if (!directUrl.includes('dl=1')) {
      const separator = directUrl.includes('?') ? '&' : '?'
      directUrl = `${directUrl}${separator}dl=1`
    }
    return { source: 'direct', url: directUrl }
  }

  // ─── OneDrive ─────────────────────────────────────────────────
  if (trimmed.includes('onedrive.live.com') || trimmed.includes('1drv.ms')) {
    const directUrl = trimmed
      .replace('redir?', 'download?')
      .replace('embed?', 'download?')
    return { source: 'direct', url: directUrl }
  }

  // ─── MediaFire ────────────────────────────────────────────────
  if (trimmed.includes('mediafire.com')) {
    return { source: 'mediafire', url: trimmed }
  }

  // ─── Direct URL ───────────────────────────────────────────────
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { source: 'direct', url: trimmed }
  }

  return null
}

const extractDriveId = (url) => {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/d\/([a-zA-Z0-9_-]{10,})\//,
    /\/folders\/([a-zA-Z0-9_-]{10,})/,
    /\/open\?id=([a-zA-Z0-9_-]{10,})/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) return match[1]
  }

  return null
}

module.exports = { detectSource, extractDriveId }