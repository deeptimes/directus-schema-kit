import assert from 'node:assert/strict'
import test from 'node:test'
import { executeApply } from '../../src/apply.js'
import { createClearPlan, executeClear } from '../../src/clear.js'
import { DirectusReader, DirectusWriter } from '../../src/directus.js'
import { collection, field, ref } from '../../src/index.js'
import { createPlan } from '../../src/plan.js'
import { syncResources } from '../../src/resources.js'
import { runSeeds } from '../../src/seed.js'
import type { Manifest, ResourceDefinition, ResourceType, SeedBatch } from '../../src/types.js'

const url = process.env.DSK_INTEGRATION_URL
const email = process.env.DSK_INTEGRATION_EMAIL
const password = process.env.DSK_INTEGRATION_PASSWORD
const configuredToken = process.env.DSK_INTEGRATION_TOKEN

test('Directus 11.17.4 完整 provisioning 生命周期', { skip: !url || (!configuredToken && (!email || !password)), timeout: 120_000 }, async () => {
  const token = configuredToken ?? await login(url!, email!, password!)
  const reader = new DirectusReader(url!, token, 20_000)
  const writer = new DirectusWriter(url!, token, 20_000)
  const manifest = integrationManifest()
  const resourceDefinitions = integrationResources(false)

  try {
    const initial = createPlan(manifest, await reader.readState(), url!)
    assert.equal(initial.summary.dangerous + initial.summary.conflict, 0)
    const applied = await executeApply({ manifest, plan: initial, writer })
    assert.equal(applied.status, 'success')

    const converged = createPlan(manifest, await reader.readState(), url!)
    const remaining = converged.operations.filter((item) => item.action !== 'unchanged')
    assert.equal(remaining.length, 0, JSON.stringify(remaining, null, 2))

    const seedBatches = integrationSeeds()
    const seeded = await runSeeds({ batches: seedBatches, mode: 'apply', reader, writer })
    assert.equal(seeded.status, 'success')
    assert.equal(seeded.summary.create, 2)
    const seedConverged = await runSeeds({ batches: seedBatches, mode: 'plan', reader })
    assert.equal(seedConverged.summary.unchanged, 2)

    const resources = await syncResources({ definitions: resourceDefinitions, reader, writer })
    assert.equal(resources.status, 'success', JSON.stringify(resources.failure, null, 2))
    assert.equal(resources.completed.length, 8)
    const resourcesConverged = await syncResources({ definitions: resourceDefinitions, reader, writer, dryRun: true })
    assert.equal(resourcesConverged.operations.every((item) => item.action === 'unchanged'), true)
  } finally {
    await syncResources({ definitions: integrationResources(true), reader, writer, confirmDestructive: true })
    const state = await reader.readState()
    if (createClearPlan(manifest, state, 'integration').length > 0) {
      const cleared = await executeClear({ manifest, state, module: 'integration', writer, confirm: true, scope: 'integration' })
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
  const categories = collection({ name: 'dsk_ci_categories', label: 'DSK CI Categories', fields: [field.string('slug', { unique: true, required: true })] })
  const articles = collection({
    name: 'dsk_ci_articles', label: 'DSK CI Articles',
    fields: [field.string('slug', { unique: true, required: true }), field.m2o('category_id', { collection: 'dsk_ci_categories' })],
  })
  const collections = [categories, articles]
  return {
    manifestVersion: 1, generator: { name: 'integration', version: '1' },
    source: { algorithm: 'sha256', digest: 'a'.repeat(64), files: [] },
    modules: [{ id: 'integration', dependsOn: [], cleanupCollections: [], sources: [] }],
    collections: collections.map((item) => ({ ...item, fields: [], module: 'integration' })),
    fields: collections.flatMap((item) => item.fields.map(({ relation: _relation, ...definition }) => ({ ...definition, collection: item.collection, module: 'integration' }))),
    relations: articles.fields.flatMap((item) => item.relation ? [{ collection: articles.collection, field: item.field, ...item.relation, module: 'integration' }] : []),
    resources: emptyResources(),
  }
}

function integrationSeeds(): SeedBatch[] {
  return [
    { schemaVersion: 1, file: 'categories.json', collection: 'dsk_ci_categories', upsertBy: ['slug'], items: [{ slug: 'news' }] },
    {
      schemaVersion: 1, file: 'articles.json', collection: 'dsk_ci_articles', upsertBy: ['slug'],
      refs: { category_id: { collection: 'dsk_ci_categories', field: 'slug', from: 'category' } },
      items: [{ slug: 'hello', category: 'news' }],
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
    permissions: [mark({ type: 'permissions', key: 'ci-read', data: { policy: ref('policies.ci'), collection: 'dsk_ci_articles', action: 'read', permissions: {} } })],
    flows: [mark({ type: 'flows', key: 'ci', data: { name: 'DSK CI Flow', status: 'inactive', trigger: 'manual', accountability: 'all' } })],
    dashboards: [mark({ type: 'dashboards', key: 'ci', data: { name: 'DSK CI Dashboard', icon: 'science' } })],
    presets: [mark({ type: 'presets', key: 'ci', data: { bookmark: 'DSK CI Preset', collection: 'dsk_ci_articles', role: ref('roles.ci'), user: null, layout: 'tabular' } })],
  }
}

function emptyResources(): Record<ResourceType, ResourceDefinition[]> {
  return { folders: [], roles: [], policies: [], access: [], permissions: [], flows: [], dashboards: [], presets: [] }
}
