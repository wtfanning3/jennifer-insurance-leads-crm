import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLeadText, parseLeadJson, parseAddress } from '../lib/parse-lead'
import { SAMPLE_LEADS } from '../lib/samples'
import { toE164 } from '../lib/phone'

test('auto sample', () => {
  const p = parseLeadText(SAMPLE_LEADS.auto)
  assert.equal(p.lead_type, 'auto')
  assert.equal(p.columns.first_name, 'Susan')
  assert.equal(p.columns.current_carrier, 'Farmers')
  assert.equal((p.details.drivers as Record<string, string>[])[0].sr22, 'No')
  assert.equal((p.details.vehicles as Record<string, string>[])[0].vin, 'SE8DE87SRCC7')
  assert.equal((p.details.coverage as Record<string, string>).deductibles, 'Comprehensive $500 / Collision $500')
  assert.equal(p.details.other, undefined)
})

test('home / renters / commercial samples', () => {
  const h = parseLeadText(SAMPLE_LEADS.home)
  assert.equal(h.lead_type, 'home')
  assert.equal((h.details.property as Record<string, string>).type, 'Single Family Home')
  assert.equal((h.details.property as Record<string, string>).roof_age, '10 years')
  const r = parseLeadText(SAMPLE_LEADS.renters)
  assert.equal(r.lead_type, 'renters')
  assert.equal((r.details.property as Record<string, string>).ownership, 'Rent')
  const c = parseLeadText(SAMPLE_LEADS.commercial)
  assert.equal(c.lead_type, 'commercial')
  assert.equal(c.columns.business_name, 'Cornerstone Construction and Remodeling')
  assert.equal((c.details.coverage as Record<string, string>).coverage_type, 'General Liability')
  assert.equal((c.details.business as Record<string, string>).description, 'We do construction and bathroom remodeling')
  for (const p of [h, r, c]) assert.equal(p.details.other, undefined)
})

test('life leads are recognized and not handled', () => {
  const p = parseLeadText('Name June Reid\tPhone 555-123-4567\nEmail june@gmail.com\tType Life Insurance')
  assert.equal(p.lead_type, null)
  assert.equal(p.unsupportedType, 'Life Insurance')
})

test('JSON leads', () => {
  const p = parseLeadJson({ lead_id: 'A1', insurance_type: 'Auto', FirstName: 'Al', LastName: 'B', PhoneNumber: '(614) 555-1212', Drivers: [{ FirstName: 'Al', LastName: 'B', DOB: '1/1/80' }], Vehicles: [{ Year: 2020, Make: 'Honda' }], extra_field: 'kept' })
  assert.equal(p.lead_type, 'auto')
  assert.equal(p.source_lead_id, 'A1')
  assert.equal(p.columns.phone, '(614) 555-1212')
  assert.equal((p.details.drivers as Record<string, string>[])[0].name, 'Al B')
  assert.equal((p.details.vehicles as Record<string, string>[])[0].make, 'Honda')
  assert.equal(p.details.other?.['Extra field'], 'kept')
})

test('address and phone', () => {
  assert.deepEqual(parseAddress('123 Main Street, Unit 304, Columbus, OH 43215'), { state: 'OH', zip: '43215', city: 'Columbus', street: '123 Main Street', unit: 'Unit 304' })
  assert.equal(toE164('555-123-4567'), '+15551234567')
  assert.equal(toE164('1 (970) 555-1234'), '+19705551234')
  assert.equal(toE164('12345'), null)
})

test('forwarded lead email (email-to-webhook JSON with headers, or HTML only)', () => {
  const p = parseLeadJson({ headers: { subject: 'New lead', from: 'leads@smartfinancial.com' }, envelope: { to: 'x@y.com' }, plain: SAMPLE_LEADS.home })
  assert.equal(p.lead_type, 'home')
  assert.equal(p.columns.first_name, 'Steve')
  assert.equal(p.details.other, undefined)
  const html = '<table><tr><td>Name</td><td>Sam Miller</td><td>Phone</td><td>555-123-4567</td></tr><tr><td>Email</td><td>sam@gmail.com</td><td>Type</td><td>Business Insurance</td></tr></table><h3>Business Information</h3><table><tr><td>Annual Revenue</td><td>$500K-$1M</td></tr></table>'
  const h = parseLeadJson({ html })
  assert.equal(h.lead_type, 'commercial')
  assert.equal(h.columns.email, 'sam@gmail.com')
  assert.equal((h.details.business as Record<string, string>).annual_revenue, '$500K-$1M')
})
