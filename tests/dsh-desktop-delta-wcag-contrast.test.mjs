import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contrastRatio, relativeLuminance } from '../scripts/lib/wcag-contrast.mjs'

const near = (actual, expected, tolerance = 0.02) =>
  assert.ok(Math.abs(actual - expected) <= tolerance,
    'Expected ' + actual + ' to be within ' + tolerance + ' of ' + expected)

test('WCAG contrast calculation covers the preserved Delta light and dark brand pairs', () => {
  near(contrastRatio('#FFFFFF', '#286F78'), 5.7768)
  near(contrastRatio('rgb(255, 255, 255)', '#286F78'), 5.7768)
  near(contrastRatio('rgba(255, 255, 255, 1)', '#286F78'), 5.7768)
  near(contrastRatio('#0E1A1C', '#60B4BF'), 7.4190)
  near(contrastRatio('#17191C', '#F5F6F7'), 16.2783)
  near(contrastRatio('#E8EAED', '#131417'), 15.2818)
})

test('WCAG contrast calculation covers focus, muted, accent and destructive semantic pairs', () => {
  assert.ok(contrastRatio('#4E929C', '#F5F6F7') >= 3)
  assert.ok(contrastRatio('#60B4BF', '#131417') >= 3)
  assert.ok(contrastRatio('#6B7079', '#F5F6F7') >= 4.5)
  assert.ok(contrastRatio('#9AA1AA', '#131417') >= 4.5)
  assert.ok(contrastRatio('#286F78', '#E7F0F2') >= 4.5)
  assert.ok(contrastRatio('#60B4BF', '#1C3B40') >= 4.5)
  assert.ok(contrastRatio('#FFFFFF', '#B91C1C') >= 4.5)
  assert.ok(contrastRatio('#0E1A1C', '#F07067') >= 4.5)
})

test('color parser rejects transparent, alpha-blended and out-of-range values', () => {
  assert.throws(() => relativeLuminance('transparent'), /opaque sRGB/)
  assert.throws(() => relativeLuminance('rgba(40, 111, 120, 0.5)'), /opaque sRGB/)
  assert.throws(() => relativeLuminance('rgb(256, 0, 0)'), /sRGB range/)
  assert.throws(() => relativeLuminance('#fff'), /opaque sRGB/)
})
