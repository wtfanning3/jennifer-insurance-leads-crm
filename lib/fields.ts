// Insurance Leads: the lead types and every field each one has, in the same
// sections SmartFinancial uses. Shared by the lead receiver (to read leads),
// the lead pages (to show and edit them) and the lead email.

export type LeadType = 'auto' | 'home' | 'renters' | 'commercial'
export const LEAD_TYPES: LeadType[] = ['auto', 'home', 'renters', 'commercial']
export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  auto: 'Auto',
  home: 'Home',
  renters: 'Renters',
  commercial: 'Commercial',
}

export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'sold' | 'lost'
export const LEAD_STATUSES: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'sold', label: 'Sold' },
  { value: 'lost', label: 'Lost' },
]

export interface FieldDef {
  key: string
  label: string
  /** Other names the same field may arrive under (labels or JSON keys) */
  aliases?: string[]
  /** Wide box (descriptions) */
  long?: boolean
  /** Takes two columns (long values like coverage limits) */
  wide?: boolean
}

export interface SectionDef {
  /** Key inside leads.details */
  key: string
  title: string
  fields: FieldDef[]
  /** Several of these (Driver #1, Driver #2 ...) - stored as an array */
  repeat?: boolean
  /** Heading words that start this section in a SmartFinancial lead */
  headings: string[]
}

/** Columns on insurance_leads (contact + existing coverage) */
export const CONTACT_FIELDS: FieldDef[] = [
  { key: 'first_name', label: 'First Name', aliases: ['firstname', 'fname', 'first'] },
  { key: 'last_name', label: 'Last Name', aliases: ['lastname', 'lname', 'last'] },
  { key: 'phone', label: 'Phone', aliases: ['phone number', 'phonenumber', 'primary phone', 'cell', 'cell phone', 'mobile', 'home phone', 'day phone'] },
  { key: 'email', label: 'Email', aliases: ['email address', 'emailaddress', 'e-mail'] },
  { key: 'business_name', label: 'Business Name', aliases: ['company', 'company name', 'businessname'] },
  { key: 'street', label: 'Street', aliases: ['address1', 'address 1', 'street address', 'streetaddress', 'address line 1'] },
  { key: 'unit', label: 'Unit', aliases: ['address2', 'address 2', 'apt', 'suite', 'address line 2'] },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State', aliases: ['st', 'state code', 'statecode'] },
  { key: 'zip', label: 'Zip', aliases: ['zip code', 'zipcode', 'postal code', 'postalcode', 'postal'] },
  { key: 'birthday', label: 'Birthday', aliases: ['birth date', 'birthdate', 'date of birth', 'dob'] },
  { key: 'gender', label: 'Gender' },
  { key: 'marital_status', label: 'Marital Status', aliases: ['marital', 'maritalstatus'] },
  { key: 'education', label: 'Education' },
  { key: 'occupation', label: 'Occupation' },
  { key: 'credit_rating', label: 'Credit Rating', aliases: ['credit', 'creditrating'] },
]

export const EXISTING_COVERAGE_FIELDS: FieldDef[] = [
  { key: 'currently_insured', label: 'Currently Insured', aliases: ['currentlyinsured', 'insured'] },
  { key: 'current_carrier', label: 'Current Carrier', aliases: ['currentcarrier', 'carrier', 'current insurer', 'current company'] },
  { key: 'insured_how_long', label: 'How Long', aliases: ['how long insured', 'years insured', 'continuous coverage', 'insured since'] },
  { key: 'policy_expires', label: 'Policy Expires', aliases: ['policy expiration', 'expiration date', 'policyexpires', 'expiration', 'renewal date'] },
]

const DRIVER: SectionDef = {
  key: 'drivers',
  title: 'Driver',
  repeat: true,
  headings: ['driver'],
  fields: [
    { key: 'name', label: 'Driver name', aliases: ['name', 'driver', 'driver full name'] },
    { key: 'relationship', label: 'Relationship', aliases: ['relation'] },
    { key: 'license_status', label: 'License Status', aliases: ['license'] },
    { key: 'gender', label: 'Gender' },
    { key: 'birthday', label: 'Birthday', aliases: ['birth date', 'birthdate', 'dob', 'date of birth'] },
    { key: 'marital_status', label: 'Marital Status', aliases: ['marital'] },
    { key: 'occupation', label: 'Occupation' },
    { key: 'education', label: 'Education' },
    { key: 'credit_rating', label: 'Credit Rating', aliases: ['credit'] },
    { key: 'military', label: 'Military' },
    { key: 'home_owner', label: 'Home Owner', aliases: ['homeowner'] },
    { key: 'bankruptcy', label: 'Bankruptcy' },
    { key: 'dui', label: 'DUI' },
    { key: 'sr22', label: 'SR-22', aliases: ['sr22', 'sr 22'] },
  ],
}

const VEHICLE: SectionDef = {
  key: 'vehicles',
  title: 'Vehicle',
  repeat: true,
  headings: ['vehicle'],
  fields: [
    { key: 'year', label: 'Year' },
    { key: 'make', label: 'Make' },
    { key: 'model', label: 'Model' },
    { key: 'trim', label: 'Trim' },
    { key: 'vin', label: 'VIN' },
    { key: 'use', label: 'Use', aliases: ['primary use', 'usage'] },
    { key: 'annual_miles', label: 'Annual Miles', aliases: ['miles', 'annual mileage'] },
    { key: 'ownership', label: 'Ownership', aliases: ['owned', 'own or lease'] },
    { key: 'vehicle_zip', label: 'Vehicle Zip', aliases: ['garaging zip'] },
    { key: 'garage', label: 'Garage', aliases: ['garage type', 'parking'] },
  ],
}

const AUTO_COVERAGE: SectionDef = {
  key: 'coverage',
  title: 'Desired Coverage',
  headings: ['desired coverage'],
  fields: [
    { key: 'bodily_injury', label: 'Bodily Injury', wide: true },
    { key: 'property_damage', label: 'Property Damage' },
    { key: 'uninsured_motorist', label: 'Uninsured Motorist', wide: true },
    { key: 'underinsured_motorist', label: 'Under Insured Motorist', aliases: ['underinsured motorist'], wide: true },
    { key: 'deductibles', label: 'Deductibles', aliases: ['deductible'], wide: true },
  ],
}

const PROPERTY_COVERAGE: SectionDef = {
  key: 'coverage',
  title: 'Desired Coverage',
  headings: ['desired coverage'],
  fields: [
    { key: 'replacement_cost', label: 'Replacement Cost', aliases: ['dwelling coverage', 'personal property'] },
    { key: 'personal_liability', label: 'Personal Liability Coverage', aliases: ['personal liability', 'liability'] },
    { key: 'deductible', label: 'Desired Deductible', aliases: ['deductible'] },
  ],
}

const PROPERTY_DETAILS: SectionDef = {
  key: 'property',
  title: 'Home Details',
  headings: ['home details', 'property details', 'residence details'],
  fields: [
    { key: 'type', label: 'Type', aliases: ['property type', 'home type', 'dwelling type'] },
    { key: 'ownership', label: 'Ownership' },
    { key: 'design', label: 'Design', aliases: ['style'] },
    { key: 'business_use', label: 'Business Use' },
    { key: 'construction', label: 'Construction' },
    { key: 'foundation', label: 'Foundation' },
    { key: 'roof', label: 'Roof', aliases: ['roof type'] },
    { key: 'roof_age', label: 'Roof Age' },
    { key: 'year_built', label: 'Year Built' },
    { key: 'garage', label: 'Garage' },
    { key: 'total_rooms', label: 'Total Rooms', aliases: ['rooms'] },
    { key: 'sq_footage', label: 'Sq. Footage', aliases: ['square footage', 'sq footage', 'sqft', 'square feet'] },
    { key: 'bedrooms', label: 'Bedrooms' },
    { key: 'bathrooms', label: 'Bathrooms' },
  ],
}

const BUSINESS: SectionDef = {
  key: 'business',
  title: 'Business Information',
  headings: ['business information', 'business details'],
  fields: [
    { key: 'legal_entity', label: 'Legal Entity' },
    { key: 'annual_revenue', label: 'Annual Revenue', aliases: ['revenue'] },
    { key: 'years_experience', label: 'Years Experience' },
    { key: 'annual_payroll', label: 'Annual Payroll', aliases: ['payroll'] },
    { key: 'years_in_business', label: 'Years in Business' },
    { key: 'subcontractors', label: 'Subcontractors' },
    { key: 'partners', label: 'Number of Partners', aliases: ['partners'] },
    { key: 'seasonal', label: 'One Time or Seasonal', aliases: ['seasonal'] },
    { key: 'full_time_employees', label: 'Full Time Employees', aliases: ['full-time employees'] },
    { key: 'subsidiary', label: 'Subsidiary Business', aliases: ['subsidiary'] },
    { key: 'part_time_employees', label: 'Part Time Employees', aliases: ['part-time employees'] },
    { key: 'description', label: 'Description', aliases: ['business description'], long: true },
  ],
}

const COMMERCIAL_COVERAGE: SectionDef = {
  key: 'coverage',
  title: 'Desired Coverage',
  headings: ['desired coverage'],
  fields: [
    { key: 'coverage_type', label: 'Coverage Type', aliases: ['type of coverage', 'coverage'] },
    { key: 'coverage_amount', label: 'Coverage Amount', aliases: ['amount'] },
  ],
}

export interface LeadTypeDef {
  /** Contact columns shown for this type (name/phone/email/address always) */
  contactFields: string[]
  existingCoverage: boolean
  sections: SectionDef[]
}

const ADDRESS = ['first_name', 'last_name', 'phone', 'email', 'street', 'unit', 'city', 'state', 'zip']
const PERSON = ['birthday', 'gender', 'marital_status', 'education', 'occupation', 'credit_rating']

export const LEAD_TYPE_DEFS: Record<LeadType, LeadTypeDef> = {
  auto: { contactFields: ADDRESS, existingCoverage: true, sections: [AUTO_COVERAGE, DRIVER, VEHICLE] },
  home: { contactFields: [...ADDRESS, ...PERSON], existingCoverage: true, sections: [PROPERTY_COVERAGE, PROPERTY_DETAILS] },
  renters: { contactFields: [...ADDRESS, ...PERSON], existingCoverage: true, sections: [PROPERTY_COVERAGE, PROPERTY_DETAILS] },
  commercial: { contactFields: ['first_name', 'last_name', 'phone', 'email', 'business_name', 'street', 'unit', 'city', 'state', 'zip'], existingCoverage: false, sections: [BUSINESS, COMMERCIAL_COVERAGE] },
}

export type SectionValues = Record<string, string>
export interface LeadDetails {
  [section: string]: SectionValues | SectionValues[] | undefined
  /** Anything in the lead that didn't match a known field - kept, not lost */
  other?: SectionValues
}

export interface InsuranceLead {
  id: string
  lead_type: LeadType
  status: LeadStatus
  first_name: string | null
  last_name: string | null
  phone: string | null
  phone_e164: string | null
  email: string | null
  street: string | null
  unit: string | null
  city: string | null
  state: string | null
  zip: string | null
  birthday: string | null
  gender: string | null
  marital_status: string | null
  education: string | null
  occupation: string | null
  credit_rating: string | null
  business_name: string | null
  currently_insured: string | null
  current_carrier: string | null
  insured_how_long: string | null
  policy_expires: string | null
  details: LeadDetails
  follow_up_date: string | null
  notes: string | null
  call_phone: string | null
  source: string
  source_lead_id: string | null
  short_code: string
  sms_opted_out: boolean
  sms_opted_out_at: string | null
  bot_paused: boolean
  followups_paused: boolean
  last_inbound_at: string | null
  welcome_sms_status: 'pending' | 'queued' | 'sent' | 'failed' | 'skipped'
  welcome_sms_error: string | null
  welcome_sms_at: string | null
  call_link_clicked_at: string | null
  last_message_at: string | null
  unread_messages: number
  created_at: string
  updated_at: string
}

export function fieldLabel(key: string): string {
  return [...CONTACT_FIELDS, ...EXISTING_COVERAGE_FIELDS].find((f) => f.key === key)?.label ?? key
}

export function leadName(l: Pick<InsuranceLead, 'first_name' | 'last_name'>): string {
  return [l.first_name, l.last_name].filter(Boolean).join(' ').trim() || '(no name)'
}

export function formatAddress(l: Pick<InsuranceLead, 'street' | 'unit' | 'city' | 'state' | 'zip'>): string {
  const cityLine = [l.city, [l.state, l.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [l.street, l.unit, cityLine].filter(Boolean).join(', ')
}

/** Lowercase, no punctuation or spaces - for matching labels and JSON keys */
export function normLabel(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Every line of a lead, grouped by section, for the lead email and the chatbot */
export function leadSummaryLines(l: InsuranceLead): string[] {
  const def = LEAD_TYPE_DEFS[l.lead_type]
  const out: string[] = []
  const rec = l as unknown as Record<string, string | null>
  out.push(`Type: ${LEAD_TYPE_LABELS[l.lead_type]} Insurance`)
  for (const k of def.contactFields) {
    if (k === 'street' || k === 'unit' || k === 'city' || k === 'state' || k === 'zip') continue
    if (rec[k]) out.push(`${fieldLabel(k)}: ${rec[k]}`)
  }
  const addr = formatAddress(l)
  if (addr) out.push(`Address: ${addr}`)
  if (def.existingCoverage) {
    const ex = EXISTING_COVERAGE_FIELDS.filter((f) => rec[f.key]).map((f) => `${f.label}: ${rec[f.key]}`)
    if (ex.length) out.push('', 'EXISTING COVERAGE', ...ex)
  }
  for (const s of def.sections) {
    const v = l.details?.[s.key]
    const groups = s.repeat ? (Array.isArray(v) ? v : []) : v && !Array.isArray(v) ? [v] : []
    groups.forEach((g, i) => {
      const lines = s.fields.filter((f) => g[f.key]).map((f) => `${f.label}: ${g[f.key]}`)
      if (lines.length) out.push('', `${s.title.toUpperCase()}${s.repeat ? ` #${i + 1}` : ''}`, ...lines)
    })
  }
  const other = l.details?.other
  if (other && Object.keys(other).length) {
    out.push('', 'OTHER', ...Object.entries(other).map(([k, v]) => `${k}: ${v}`))
  }
  return out
}
