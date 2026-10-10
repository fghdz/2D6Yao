/** 浏览器直接下载。桌面与 Android 都行；iOS 主屏 PWA 里经常没反应，那边走分享。 */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // 立即回收会让部分浏览器下载失败，留一点时间。
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
}

/** 系统分享面板：可存到「文件」、网盘，或直接发给自己。返回 false 表示用户取消。 */
export async function shareFile(file: File): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title: file.name })
    return true
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return false
    throw cause
  }
}
