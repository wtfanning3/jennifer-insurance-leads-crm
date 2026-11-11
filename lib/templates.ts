// Default wording for texts, and the {tags} that can be used in them. Shared
// by the server (sending) and the Settings page (showing / previewing).
export const DEFAULT_WELCOME_TEMPLATE =
  'Hi {first_name}, this is {agent_name} with {agency_name}. We just got your {lead_type} insurance quote request and are working on it now! ' +
  'Questions? Reply here anytime, or tap to call our office: {call_link}\n' +
  'Reply STOP to opt out.'

export const TEMPLATE_TAGS: { tag: string; meaning: string }[] = [
  { tag: '{first_name}', meaning: "Lead's first name" },
  { tag: '{last_name}', meaning: "Lead's last name" },
  { tag: '{business_name}', meaning: 'Business name (commercial leads)' },
  { tag: '{lead_type}', meaning: 'auto / home / renters / commercial' },
  { tag: '{agent_name}', meaning: 'Agent name (Settings)' },
  { tag: '{agency_name}', meaning: 'Agency name (Settings)' },
  { tag: '{office_phone}', meaning: 'Office number, written out' },
  { tag: '{call_link}', meaning: 'Link that calls the office' },
  { tag: '{stop_link}', meaning: 'Link to stop texts (unsubscribe)' },
  { tag: '{website}', meaning: 'Website (Settings)' },
]

export interface TemplateValues {
  first_name: string
  last_name: string
  business_name: string
  lead_type: string
  agent_name: string
  agency_name: string
  office_phone: string
  call_link: string
  stop_link: string
  website: string
}

/** Fills {first_name}, {agent_name}, {call_link}... (unknown tags are left as typed) */
export function fillTemplate(template: string, values: TemplateValues): string {
  const v = values as unknown as Record<string, string>
  return template
    .replace(/\{\s*([a-z_]+)\s*\}/gi, (m, k: string) => v[k.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/** Roughly how many text-message parts (segments) a message uses */
export function smsSegments(text: string): { chars: number; segments: number; unicode: boolean } {
  const unicode = /[^\x00-\x7F£¥èéùìòÇØøÅåÄÖÑÜ§¿äöñüà]/.test(text)
  const chars = text.length
  const single = unicode ? 70 : 160
  const multi = unicode ? 67 : 153
  return { chars, unicode, segments: chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi) }
}
