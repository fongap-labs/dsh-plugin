const parseColor = value => {
  const color = String(value).trim().toLowerCase()
  const hex = /^#([0-9a-f]{6})$/.exec(color)
  if (hex) {
    return [0, 2, 4].map(offset => Number.parseInt(hex[1].slice(offset, offset + 2), 16))
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(1(?:\.0*)?))?\s*\)$/.exec(color)
  if (!rgb) throw new Error('Expected an opaque sRGB color')
  const channels = rgb.slice(1, 4).map(Number)
  if (channels.some(channel => channel < 0 || channel > 255)) {
    throw new Error('RGB channel is outside the sRGB range')
  }
  return channels
}

const linearize = channel => {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export const relativeLuminance = color => {
  const [red, green, blue] = parseColor(color).map(linearize)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export const contrastRatio = (foreground, background) => {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}
