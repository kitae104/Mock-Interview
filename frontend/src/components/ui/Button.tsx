import type { ButtonHTMLAttributes } from 'react'
import { buttonClass, type ButtonStyle } from './styles.ts'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyle

export default function Button({ variant, size, block, className, type = 'button', ...rest }: Props) {
  return <button type={type} className={buttonClass({ variant, size, block }, className)} {...rest} />
}
