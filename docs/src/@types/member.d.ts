interface TeamMember {
  name: string
  realName: string
  age: number
  education: string
  university: string
  specialty: string
  role: string
  description: string
  avatar: string
  pattern: Omit<GridPatternTyped, 'width' | 'height' | 'x'>
}

interface Advisor {
  name: string
  title: string
  institution: string
  department: string
  specialization: string
  achievements: string[]
  description: string
  avatar: string
  pattern: Omit<GridPatternTyped, 'width' | 'height' | 'x'>
}
