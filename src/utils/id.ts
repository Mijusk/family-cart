// crypto.randomUUID only exists in secure contexts; testing on a phone over the LAN (http://192.168…) is not one.
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && window.isSecureContext) {
    return crypto.randomUUID()
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}
