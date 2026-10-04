import { describe, expect, it } from 'vitest'
import { pageNumbers } from './pagination.ts'

describe('pageNumbers', () => {
  it('페이지가 적으면 모두 보여 준다', () => {
    expect(pageNumbers(1, 1)).toEqual([1])
    expect(pageNumbers(2, 3)).toEqual([1, 2, 3])
  })

  it('처음과 끝은 항상 보이고 현재 페이지 앞뒤 한 칸을 보여 준다', () => {
    expect(pageNumbers(1, 10)).toEqual([1, 2, null, 10])
    expect(pageNumbers(5, 10)).toEqual([1, null, 4, 5, 6, null, 10])
    expect(pageNumbers(10, 10)).toEqual([1, null, 9, 10])
  })

  it('한 칸만 비는 곳은 점 대신 숫자를 보여 준다', () => {
    expect(pageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5])
    expect(pageNumbers(4, 6)).toEqual([1, null, 3, 4, 5, 6])
  })
})
