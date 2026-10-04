import { cn } from '../../lib/cn.ts'

interface IconProps {
  /** Material Symbols 아이콘 이름 (예: 'videocam', 'check_circle'). 목록: https://fonts.google.com/icons */
  name: string
  /** 픽셀 크기 */
  size?: number
  className?: string
}

// 글자 색을 따라가므로 색은 className 으로 토큰 클래스를 줍니다: <Icon name="check" className="text-primary" />
export default function Icon({ name, size = 20, className }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('material-symbols-outlined shrink-0 select-none leading-none', className)}
      style={{ fontSize: size }}
    >
      {name}
    </span>
  )
}
