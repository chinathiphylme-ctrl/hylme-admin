// the upload code is kept for this browser tab only
const KEY = 'hylme-upload-code'

export function loadCode(): string {
  try { return sessionStorage.getItem(KEY) ?? '' } catch { return '' }
}

export function storeCode(code: string) {
  try { sessionStorage.setItem(KEY, code) } catch { /* storage blocked: ask again next time */ }
}
