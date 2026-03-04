enum Environment {
  Bohrium = 'Bohrium',
  Protium = 'Protium',
}

export const ENV: Environment =
  (process.env.PLATFORM as Environment) || Environment.Protium

export const IS_CLIENT = typeof window !== 'undefined'

export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL

export const MEDIA_URL = ''

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL

export const PrimarySite =
  process.env.NEXT_PUBLIC_PRIMARY_SITE || 'https://docs.sciol.ac.cn/'

export const DocumentSite =
  process.env.NEXT_PUBLIC_DOCUMENT_SITE || 'https://docs.sciol.ac.cn/'

export const WorkflowSite = process.env.NEXT_PUBLIC_WORKFLOW_SITE || ''
