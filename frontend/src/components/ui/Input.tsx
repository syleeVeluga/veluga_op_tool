import type { InputHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={[
        'w-full rounded-md border px-3 py-2 text-sm',
        className ?? '',
      ]
        .join(' ')
        .trim()}
      {...props}
    />
  )
}
