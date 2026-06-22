import type { ResourceDefinition, TabularPresetOptions } from '../types.js'
import { resource } from './schema.js'

function conventionalWidth(field: string, fallback: number): number {
  if (['title', 'name', 'display_name'].includes(field)) return 220
  if (['description', 'summary', 'content'].includes(field)) return 280
  if (['status', 'sort', 'is_featured', 'is_pinned'].includes(field)) return 100
  if (['image', 'cover'].includes(field)) return 120
  return fallback
}

export const preset = {
  tabular(options: TabularPresetOptions): ResourceDefinition {
    const fallbackWidth = options.defaultWidth ?? 160
    const widths = Object.fromEntries(options.fields.map((field) => [
      field,
      options.widths?.[field] ?? conventionalWidth(field, fallbackWidth),
    ]))

    return resource('presets', {
      key: options.key ?? `default-${options.collection}-tabular`,
      data: {
        collection: options.collection,
        layout: 'tabular',
        ...(options.icon ? { icon: options.icon } : {}),
        ...(options.color ? { color: options.color } : {}),
        user: options.user ?? null,
        role: options.role ?? null,
        bookmark: options.bookmark ?? null,
        layout_query: {
          tabular: {
            page: options.page ?? 1,
            fields: [...options.fields],
          },
        },
        layout_options: { tabular: { widths } },
      },
    })
  },
}
