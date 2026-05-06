interface SparklineProps {
  data: { p95: number }[]
  width?: number
  height?: number
}

export function Sparkline({ data, width = 80, height = 24 }: SparklineProps) {
  if (data.length < 2) return <span className="text-gray-500 dark:text-gray-400 text-xs">—</span>

  const values = data.map(d => d.p95)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width
      const y = height - ((v - min) / range) * (height - 2) - 1
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.5"
        className="stroke-brand-500 dark:stroke-brand-400"
      />
    </svg>
  )
}
