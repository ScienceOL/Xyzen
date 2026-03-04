type GridPatternTyped = React.ComponentPropsWithoutRef<'svg'> & {
  width: number
  height: number
  x: string | number
  y: string | number
  squares: Array<[x: number, y: number]>
}
