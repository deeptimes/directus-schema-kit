import assert from 'node:assert/strict'
import process from 'node:process'
import test from 'node:test'
import { executeApply } from '../../src/apply.js'
import { createClearPlan, executeClear } from '../../src/clear.js'
import { DirectusReader, DirectusWriter } from '../../src/directus.js'
import { collection, field, ref, relation, systemRef } from '../../src/index.js'
import { expandRelationBlueprint } from '../../src/dsl/expand.js'
import { createPlan } from '../../src/plan.js'
import { syncResources } from '../../src/resources.js'
import { runSeeds } from '../../src/seed.js'
import type { Manifest, ResourceDefinition, ResourceType, SeedBatch } from '../../src/types.js'

const url = process.env.DSK_INTEGRATION_URL
const email = process.env.DSK_INTEGRATION_EMAIL
const password = process.env.DSK_INTEGRATION_PASSWORD
const configuredToken = process.env.DSK_INTEGRATION_TOKEN

test('Directus 完整 provisioning 生命周期', { skip: !url || (!configuredToken && (!email || !password)), timeout: 120_000 }, async (t) => {
  const token = configuredToken ?? await login(url!, email!, password!)
  const infoResponse = await fetch(`${url}/server/info`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(infoResponse.ok, true)
  const info = await infoResponse.json() as { data: { version: string } }
  assert.match(info.data.version, /^(11|12)\./)
  if (process.env.DSK_INTEGRATION_VERSION) assert.equal(info.data.version, process.env.DSK_INTEGRATION_VERSION)
  t.diagnostic(`Directus ${info.data.version}`)
  const reader = new DirectusReader(url!, token, 20_000)
  const writer = new DirectusWriter(url!, token, 20_000)
  const manifest = integrationManifest()
  const resourceDefinitions = integrationResources(false)

  try {
    const initial = createPlan(manifest, await reader.readState(), url!)
    assert.equal(initial.summary.dangerous + initial.summary.conflict, 0)
    const applied = await executeApply({ manifest, plan: initial, writer })
    assert.equal(applied.status, 'success', JSON.stringify(applied, null, 2))

    const converged = createPlan(manifest, await reader.readState(), url!)
    const remaining = converged.operations.filter((item) => item.action !== 'unchanged')
    assert.equal(remaining.length, 0, JSON.stringify(remaining, null, 2))

    const seedBatches = integrationSeeds()
    const seedPreview = await runSeeds({ batches: seedBatches, mode: 'plan', reader })
    assert.equal(seedPreview.status, 'success', seedPreview.failure?.message)
    assert.equal(seedPreview.summary.create, 2)
    const seeded = await runSeeds({ batches: seedBatches, mode: 'apply', reader, writer })
    assert.equal(seeded.status, 'success')
    assert.equal(seeded.summary.create, 2)
    const [article] = await reader.listItems('dsk_ci_articles', { filter: { slug: 'hello' } })
    assert.equal(article?.is_featured, true)
    assert.equal(article?.date_published, '2026-01-10T08:00:00')
    const seedConverged = await runSeeds({ batches: seedBatches, mode: 'plan', reader })
    assert.equal(seedConverged.summary.unchanged, 2)

    const resources = await syncResources({ definitions: resourceDefinitions, reader, writer })
    assert.equal(resources.status, 'success', JSON.stringify(resources.failure, null, 2))
    assert.equal(resources.completed.length, 7)
    const resourcesConverged = await syncResources({ definitions: resourceDefinitions, reader, writer, dryRun: true })
    assert.equal(resourcesConverged.operations.every((item) => item.action === 'unchanged'), true)

    const custom = integrationResources(false)
    const publicPermission = custom.permissions.find((item) => item.key === 'ci-public-read')!
    publicPermission.data.permissions = { slug: { _eq: 'hello' } }
    custom.folders.push({ type: 'folders', key: 'guard', data: { name: 'DSK CI Permission Guard', parent: null } })
    if (await reader.getCustomPermissionRulesEnabled()) {
      const filtered = await syncResources({ definitions: custom, reader, writer })
      assert.equal(filtered.status, 'success', JSON.stringify(filtered.failure))
      await writer.createItem('dsk_ci_articles', { slug: 'private' })
      const response = await fetch(`${url}/items/dsk_ci_articles?fields=slug`)
      assert.equal(response.ok, true)
      const visible = await response.json() as { data: Array<{ slug: string }> }
      assert.deepEqual(visible.data, [{ slug: 'hello' }])
    } else {
      for (const dryRun of [true, false]) {
        await assert.rejects(() => syncResources({ definitions: custom, reader, writer, dryRun }), /custom_permission_rules_enabled/)
      }
      const folders = await reader.listSystemResource('folders')
      assert.equal(folders.some((item) => item.name === 'DSK CI Permission Guard'), false)
    }
  } finally {
    const cleanup = integrationResources(true)
    cleanup.folders.push({ type: 'folders', key: 'guard', delete: true, data: { name: 'DSK CI Permission Guard', parent: null } })
    const removed = await syncResources({ definitions: cleanup, reader, writer, confirmDestructive: true })
    assert.equal(removed.status, 'success', JSON.stringify(removed.failure))
    const state = await reader.readState()
    if (createClearPlan(manifest, state).length > 0) {
      const cleared = await executeClear({ manifest, state, writer, confirm: true })
      assert.equal(cleared.status, 'success')
    }
  }
})

async function login(baseUrl: string, userEmail: string, userPassword: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password: userPassword }),
  })
  assert.equal(response.ok, true, `Directus login failed: ${response.status}`)
  const payload = await response.json() as { data: { access_token: string } }
  return payload.data.access_token
}

function integrationManifest(): Manifest {
  const categories = collection({ name: 'dsk_ci_categories', label: 'DSK CI Categories', group: 'dsk_ci_articles', fields: [field.string('slug', { unique: true, required: true })] })
  const articles = collection({ name: 'dsk_ci_articles', label: 'DSK CI Articles', fields: [
    field.string('slug', { unique: true, required: true }), field.status(), field.toggle('is_featured'),
    field.dateTime('date_published'), field.markdown('content'), field.tags('keywords'), field.code('seo', { type: 'json' }),
  ] })
  const tags = collection({ name: 'dsk_ci_tags', label: 'DSK CI Tags' })
  const comments = collection({ name: 'dsk_ci_comments', label: 'DSK CI Comments', group: 'dsk_ci_categories' })
  const textBlocks = collection({ name: 'dsk_ci_text_blocks', label: 'DSK CI Text Blocks' })
  const imageBlocks = collection({ name: 'dsk_ci_image_blocks', label: 'DSK CI Image Blocks' })
  const languages = collection({ name: 'dsk_ci_languages', label: 'DSK CI Languages' })
  const blueprints = [
    relation.m2o({ collection: 'dsk_ci_articles', field: 'category_id', relatedCollection: 'dsk_ci_categories' }),
    relation.o2m({ collection: 'dsk_ci_articles', field: 'comments', relatedCollection: 'dsk_ci_comments', relatedField: 'article_id' }),
    relation.file({ collection: 'dsk_ci_articles', field: 'document' }),
    relation.image({ collection: 'dsk_ci_articles', field: 'cover' }),
    relation.m2m({ collection: 'dsk_ci_articles', field: 'tags', relatedCollection: 'dsk_ci_tags' }),
    relation.files({ collection: 'dsk_ci_articles', field: 'attachments' }),
    relation.translations({ collection: 'dsk_ci_articles', languagesCollection: 'dsk_ci_languages' }),
    relation.m2a({ collection: 'dsk_ci_articles', field: 'blocks', allowedCollections: ['dsk_ci_text_blocks', 'dsk_ci_image_blocks'] }),
  ]
  const expanded = blueprints.map(expandRelationBlueprint)
  const baseCollections = [comments, categories, articles, tags, textBlocks, imageBlocks, languages]
  const collections = [...baseCollections, ...expanded.flatMap((item) => item.collections)]
  return {
    manifestVersion: 1, generator: { name: 'integration', version: '1' },
    source: { algorithm: 'sha256', digest: 'a'.repeat(64), files: [] },
    collections: collections.map((item) => ({ ...item, fields: [], source: 'dsk/schemas/integration.ts' })),
    fields: [
      ...baseCollections.flatMap((item) => item.fields.map(({ relation: _relation, ...definition }) => ({ ...definition, collection: item.collection, source: 'dsk/schemas/integration.ts' }))),
      ...expanded.flatMap((item) => item.fields.map((definition) => ({ ...definition, source: 'dsk/schemas/integration.ts' }))),
    ],
    relations: expanded.flatMap((item) => item.relations.map((definition) => ({ ...definition, source: 'dsk/schemas/integration.ts' }))),
    resources: emptyResources(),
  }
}

function integrationSeeds(): SeedBatch[] {
  return [
    { schemaVersion: 1, file: 'categories.json', collection: 'dsk_ci_categories', upsertBy: ['slug'], items: [{ slug: 'news' }] },
    {
      schemaVersion: 1, file: 'articles.json', collection: 'dsk_ci_articles', upsertBy: ['slug'],
      refs: { category_id: { collection: 'dsk_ci_categories', field: 'slug', from: 'category' } },
      items: [{ slug: 'hello', category: 'news', is_featured: true, date_published: '2026-01-10T08:00:00' }],
    },
  ]
}

function integrationResources(remove: boolean): Record<ResourceType, ResourceDefinition[]> {
  const mark = <T extends ResourceDefinition>(value: T): T => ({ ...value, ...(remove ? { delete: true } : {}) })
  return {
    folders: [mark({ type: 'folders', key: 'ci', data: { name: 'DSK CI Folder', parent: null } })],
    roles: [mark({ type: 'roles', key: 'ci', data: { name: 'DSK CI Role', icon: 'science' } })],
    policies: [mark({ type: 'policies', key: 'ci', data: { name: 'DSK CI Policy', icon: 'science', app_access: false, admin_access: false } })],
    access: [mark({ type: 'access', key: 'ci', data: { role: ref('roles.ci'), policy: ref('policies.ci'), user: null } })],
    permissions: [
      mark({ type: 'permissions', key: 'ci-read', data: { policy: ref('policies.ci'), collection: 'dsk_ci_articles', action: 'read', permissions: {}, fields: ['*'] } }),
      mark({ type: 'permissions', key: 'ci-public-read', data: { policy: systemRef('policies.public'), collection: 'dsk_ci_articles', action: 'read', permissions: {}, fields: ['*'] } }),
    ],
    presets: [mark({ type: 'presets', key: 'ci', data: { bookmark: 'DSK CI Preset', collection: 'dsk_ci_articles', role: ref('roles.ci'), user: null, layout: 'tabular' } })],
  }
}

function emptyResources(): Record<ResourceType, ResourceDefinition[]> {
  return { folders: [], roles: [], policies: [], access: [], permissions: [], presets: [] }
}
