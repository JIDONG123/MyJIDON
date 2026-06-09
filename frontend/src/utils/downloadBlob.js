export async function triggerBlobDownload(blob, filename, fallbackError = '下载失败') {
  if (!(blob instanceof Blob)) {
    throw new Error(fallbackError)
  }
  if (blob.type?.includes('json') || blob.type?.includes('text')) {
    const text = await blob.text()
    try {
      const json = JSON.parse(text)
      throw new Error(json.message || fallbackError)
    } catch (e) {
      if (e.message && e.message !== fallbackError) throw e
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
