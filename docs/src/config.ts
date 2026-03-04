export const IS_CLIENT = typeof window !== 'undefined'

export const PrimarySite =
  process.env.NEXT_PUBLIC_PRIMARY_SITE || 'https://docs.sciol.ac.cn/'
