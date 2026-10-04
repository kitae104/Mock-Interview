// 조건부 className 을 합칩니다. cn('a', ok && 'b', undefined) → 'a b'
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}
