/** 현재 페이지 주변의 페이지 번호만 돌려줍니다 (처음·끝은 항상). 사이가 비면 null 이 "…" 자리입니다. */
export function pageNumbers(current: number, last: number): (number | null)[] {
  const wanted = new Set([1, last, current - 1, current, current + 1].filter((n) => n >= 1 && n <= last))
  const sorted = [...wanted].sort((a, b) => a - b)
  const result: (number | null)[] = []
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) result.push(null)
    result.push(n)
  })
  return result
}
