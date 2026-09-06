const KEY = 'qc.userName'

export function getUserName(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setUserName(name: string): void {
  try {
    localStorage.setItem(KEY, name.trim())
  } catch {
    /* private mode 等では保持しない */
  }
}
