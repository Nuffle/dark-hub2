const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg", "wma", "opus"])
const DEFAULT_STORAGE_LIMIT = 9_000_000_000
const DEFAULT_MAX_FILE_SIZE = 50_000_000
const DEFAULT_MAX_FILES = 5_000
const DEFAULT_MAX_ASSET_FILES = 10_000
const DEFAULT_MAX_CLASS_A_OPERATIONS = 100_000
const DEFAULT_MAX_CLASS_B_OPERATIONS = 1_000_000
const DEFAULT_MAX_STATE_SNAPSHOT_BYTES = 5_000_000
const SIGNED_URL_TTL_SECONDS = 60 * 60

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const cors = corsHeaders(request, env)

    if (request.method === "OPTIONS") {
      if (!cors["Access-Control-Allow-Origin"]) return json({ detail: "Origem nao permitida" }, 403, cors)
      return new Response(null, { status: 204, headers: cors })
    }

    try {
      if (url.pathname === "/api/health") {
        return json({ status: "ok", service: "dark-hub-cloud", protected: Boolean(env.SOUNDS_API_TOKEN) }, 200, cors)
      }
      if (url.pathname.startsWith("/api/state")) {
        requireAuthorization(request, env)
        return await handleStateRequest(request, url, env, cors)
      }
      if (url.pathname.startsWith("/api/assets")) {
        return await handleAssetRequest(request, url, env, cors)
      }

      if (!url.pathname.startsWith("/api/sounds")) {
        return json({ detail: "Rota nao encontrada" }, 404, cors)
      }

      const suffix = url.pathname.slice("/api/sounds".length)
      const parts = suffix.split("/").filter(Boolean)
      const isMediaRequest = parts.length === 2
        && ["audio", "download"].includes(parts[1])
        && request.method === "GET"

      if (!isMediaRequest) requireAuthorization(request, env)

      if (!parts.length && request.method === "GET") {
        return await listSounds(url, env, cors)
      }
      if (parts.length === 1 && parts[0] === "upload" && request.method === "POST") {
        return await uploadSound(request, env, cors)
      }
      if (parts.length === 1 && request.method === "PATCH") {
        return await updateSound(parts[0], request, env, cors)
      }
      if (parts.length === 1 && request.method === "DELETE") {
        return await deleteSound(parts[0], env, cors)
      }
      if (isMediaRequest) {
        return await serveSound(parts[0], parts[1] === "download", request, env, cors)
      }
      return json({ detail: "Rota nao encontrada" }, 404, cors)
    } catch (error) {
      console.error(error)
      return json({ detail: error.message || "Erro interno" }, error.status || 500, cors)
    }
  },
}

async function handleStateRequest(request, url, env, cors) {
  const suffix = url.pathname.slice("/api/state".length)
  const parts = suffix.split("/").filter(Boolean)
  if (parts.length === 1 && parts[0] === "status" && request.method === "GET") {
    return await stateStatus(env, cors)
  }
  if (parts.length === 1 && parts[0] === "snapshot" && request.method === "GET") {
    return await getStateSnapshot(env, cors)
  }
  if (parts.length === 1 && parts[0] === "snapshot" && request.method === "PUT") {
    return await saveStateSnapshot(request, env, cors)
  }
  return json({ detail: "Rota de estado nao encontrada" }, 404, cors)
}

async function stateStatus(env, cors) {
  const row = await env.DB.prepare(
    "SELECT key, revision, size_bytes, created_at, updated_at FROM app_state WHERE key = 'main'"
  ).first()
  return json({
    exists: Boolean(row),
    key: row?.key || "main",
    revision: Number(row?.revision) || 0,
    size_bytes: Number(row?.size_bytes) || 0,
    created_at: row?.created_at || "",
    updated_at: row?.updated_at || "",
  }, 200, cors)
}

async function getStateSnapshot(env, cors) {
  const row = await env.DB.prepare(
    "SELECT key, payload, revision, size_bytes, created_at, updated_at FROM app_state WHERE key = 'main'"
  ).first()
  if (!row) {
    return json({ exists: false, key: "main", revision: 0, snapshot: null }, 200, cors)
  }
  return json({
    exists: true,
    key: row.key,
    revision: Number(row.revision) || 1,
    size_bytes: Number(row.size_bytes) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    snapshot: validJson(row.payload, null),
  }, 200, cors)
}

async function saveStateSnapshot(request, env, cors) {
  const body = await request.json()
  const snapshot = body.snapshot || body
  if (!snapshot || typeof snapshot !== "object") throw httpError(400, "Snapshot invalido")
  const payload = JSON.stringify(snapshot)
  const sizeBytes = new TextEncoder().encode(payload).length
  const limit = positiveInteger(env.MAX_STATE_SNAPSHOT_BYTES, DEFAULT_MAX_STATE_SNAPSHOT_BYTES)
  if (sizeBytes > limit) {
    throw httpError(413, `Snapshot maior que o limite protegido de ${formatMegabytes(limit)} MB`)
  }

  await consumeOperation("class_a", env)
  const now = new Date().toISOString()
  const current = await env.DB.prepare(
    "SELECT revision FROM app_state WHERE key = 'main'"
  ).first()
  const revision = (Number(current?.revision) || 0) + 1
  await env.DB.prepare(
    `INSERT INTO app_state (key, payload, revision, size_bytes, created_at, updated_at)
     VALUES ('main', ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       payload = excluded.payload,
       revision = excluded.revision,
       size_bytes = excluded.size_bytes,
       updated_at = excluded.updated_at`
  ).bind(payload, revision, sizeBytes, now, now).run()

  return json({
    exists: true,
    key: "main",
    revision,
    size_bytes: sizeBytes,
    created_at: current ? "" : now,
    updated_at: now,
  }, 200, cors)
}

async function handleAssetRequest(request, url, env, cors) {
  const suffix = url.pathname.slice("/api/assets".length)
  const parts = suffix.split("/").filter(Boolean)
  const isMediaRequest = parts.length === 2
    && ["file", "download"].includes(parts[1])
    && request.method === "GET"

  if (!isMediaRequest) requireAuthorization(request, env)

  if (!parts.length && request.method === "GET") {
    return await listAssets(url, env, cors)
  }
  if (parts.length === 1 && parts[0] === "upload" && request.method === "POST") {
    return await uploadAsset(request, env, cors)
  }
  if (parts.length === 1 && request.method === "PATCH") {
    return await updateAsset(parts[0], request, env, cors)
  }
  if (parts.length === 1 && request.method === "DELETE") {
    return await deleteAsset(parts[0], env, cors)
  }
  if (isMediaRequest) {
    return await serveAsset(parts[0], parts[1] === "download", request, env, cors)
  }
  return json({ detail: "Rota de arquivos nao encontrada" }, 404, cors)
}

async function listAssets(url, env, cors) {
  const clauses = []
  const values = []
  const query = url.searchParams.get("q")?.trim()
  const collection = url.searchParams.get("collection")?.trim()
  const kind = url.searchParams.get("kind")?.trim()
  const favorites = url.searchParams.get("favorites") === "true"
  if (query) {
    clauses.push("(name LIKE ? OR original_name LIKE ? OR tags LIKE ? OR collection LIKE ?)")
    const pattern = `%${query}%`
    values.push(pattern, pattern, pattern, pattern)
  }
  if (collection) {
    clauses.push("collection = ?")
    values.push(collection)
  }
  if (kind) {
    clauses.push("kind = ?")
    values.push(kind)
  }
  if (favorites) clauses.push("favorite = 1")
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
  const assetsStatement = env.DB.prepare(
    `SELECT * FROM cloud_assets ${where} ORDER BY favorite DESC, updated_at DESC`
  ).bind(...values)
  const collectionsStatement = env.DB.prepare(
    "SELECT collection, COUNT(*) AS total FROM cloud_assets GROUP BY collection ORDER BY collection"
  )
  const kindsStatement = env.DB.prepare(
    "SELECT kind, COUNT(*) AS total FROM cloud_assets GROUP BY kind ORDER BY kind"
  )
  const usageStatement = storageUsageStatement(env)
  const operationStatement = env.DB.prepare(
    "SELECT class_a, class_b FROM usage_counters WHERE month = ?"
  ).bind(currentMonth())
  const [assetsResult, collectionsResult, kindsResult, usageResult, operationResult] = await env.DB.batch([
    assetsStatement,
    collectionsStatement,
    kindsStatement,
    usageStatement,
    operationStatement,
  ])
  return json({
    assets: await Promise.all(assetsResult.results.map(row => assetPayload(row, env))),
    collections: collectionsResult.results.map(row => ({ name: row.collection, total: row.total })),
    kinds: kindsResult.results.map(row => ({ name: row.kind, total: row.total })),
    usage: usagePayload(usageResult.results[0], env, operationResult.results[0]),
  }, 200, cors)
}

async function uploadAsset(request, env, cors) {
  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File) || !file.size) throw httpError(400, "O arquivo enviado esta vazio")
  const extension = assetExtension(file.name)

  const usage = usagePayload(await storageUsageRow(env), env)
  const maxFiles = positiveInteger(env.MAX_ASSET_FILES, DEFAULT_MAX_ASSET_FILES)
  const currentAssetCount = await env.DB.prepare("SELECT COUNT(*) AS total_files FROM cloud_assets").first()
  const tags = validJson(form.get("tags"), [])
  const metadata = validJson(form.get("metadata"), {})
  const name = String(form.get("name") || file.name.replace(/\.[^.]+$/, "")).trim()
  const collection = String(form.get("collection") || "Geral").trim() || "Geral"
  const kind = String(form.get("kind") || inferAssetKind(file.name, file.type)).trim() || "arquivo"
  const mimeType = file.type || mimeTypeFromExtension(extension)
  const duplicate = await duplicateAsset(file, collection, metadata, env)
  if (duplicate) {
    return json({ ...(await assetPayload(duplicate, env)), duplicate: true }, 200, cors)
  }

  if (file.size > usage.max_file_size_bytes) {
    throw httpError(413, `Este arquivo ultrapassa o limite de ${formatMegabytes(usage.max_file_size_bytes)} MB`)
  }
  if ((Number(currentAssetCount?.total_files) || 0) >= maxFiles) {
    throw httpError(409, `Limite de ${maxFiles.toLocaleString("pt-BR")} arquivos atingido`)
  }
  if (file.size > usage.remaining_bytes) {
    throw httpError(409, "Limite protegido de 9 GB atingido. Apague arquivos antes de enviar outros")
  }
  await consumeOperation("class_a", env)

  const id = crypto.randomUUID()
  const objectKey = `assets/${id}.${extension}`
  const now = new Date().toISOString()

  const bytes = await file.arrayBuffer()
  await putObjectWithRetry(env.SOUNDS, objectKey, bytes, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { originalName: file.name },
  })
  try {
    await env.DB.prepare(
      `INSERT INTO cloud_assets (
        id, name, original_name, object_key, collection, kind, tags, favorite,
        size, mime_type, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
    ).bind(
      id, name, file.name, objectKey, collection, kind, JSON.stringify(tags),
      file.size, mimeType, JSON.stringify(metadata), now, now
    ).run()
  } catch (error) {
    await env.SOUNDS.delete(objectKey)
    throw error
  }
  return json(await assetPayload(await assetRow(id, env), env), 201, cors)
}

async function duplicateAsset(file, collection, metadata, env) {
  const slashName = `%/${file.name}`
  const backslashName = `%\\${file.name}`
  const candidates = await env.DB.prepare(
    "SELECT * FROM cloud_assets WHERE collection = ? AND (original_name = ? OR original_name LIKE ? OR original_name LIKE ?) AND size = ? ORDER BY created_at DESC LIMIT 8"
  ).bind(collection, file.name, slashName, backslashName, file.size).all()
  if (!metadata?.preserve_subfolders) {
    return candidates.results?.[0] || null
  }
  const relativePath = String(metadata?.relative_path || "")
  const exact = (candidates.results || []).find(row => {
    const current = validJson(row.metadata, {})
    return String(current?.relative_path || "") === relativePath
  })
  return exact || null
}

async function updateAsset(id, request, env, cors) {
  const current = await assetRow(id, env)
  const body = await request.json()
  const name = body.name === undefined ? current.name : String(body.name).trim()
  const collection = body.collection === undefined
    ? current.collection
    : String(body.collection).trim() || "Geral"
  const kind = body.kind === undefined ? current.kind : String(body.kind).trim() || "arquivo"
  const tags = body.tags === undefined ? current.tags : JSON.stringify(body.tags)
  const favorite = body.favorite === undefined ? current.favorite : Number(Boolean(body.favorite))
  const metadata = body.metadata === undefined ? current.metadata : JSON.stringify(body.metadata || {})
  if (!name) throw httpError(400, "Informe um nome para o arquivo")
  await env.DB.prepare(
    "UPDATE cloud_assets SET name = ?, collection = ?, kind = ?, tags = ?, favorite = ?, metadata = ?, updated_at = ? WHERE id = ?"
  ).bind(name, collection, kind, tags, favorite, metadata, new Date().toISOString(), id).run()
  return json(await assetPayload(await assetRow(id, env), env), 200, cors)
}

async function deleteAsset(id, env, cors) {
  const asset = await assetRow(id, env)
  await consumeOperation("class_a", env)
  await Promise.all([
    env.SOUNDS.delete(asset.object_key),
    env.DB.prepare("DELETE FROM cloud_assets WHERE id = ?").bind(id).run(),
  ])
  return new Response(null, { status: 204, headers: cors })
}

async function serveAsset(id, download, request, env, cors) {
  const url = new URL(request.url)
  const mode = download ? "asset-download" : "asset-file"
  const expires = Number(url.searchParams.get("expires"))
  const signature = url.searchParams.get("signature") || ""
  if (!await verifyMediaSignature(id, mode, expires, signature, env)) {
    throw httpError(401, "Link de arquivo invalido ou expirado")
  }

  const asset = await assetRow(id, env)
  await consumeOperation("class_b", env)
  const rangeHeader = request.headers.get("Range")
  let object
  let status = 200
  if (rangeHeader) {
    const range = parseRange(rangeHeader, asset.size)
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: { ...cors, "Content-Range": `bytes */${asset.size}` },
      })
    }
    object = await env.SOUNDS.get(asset.object_key, {
      range: { offset: range.start, length: range.end - range.start + 1 },
    })
    status = 206
  } else {
    object = await env.SOUNDS.get(asset.object_key)
  }
  if (!object) throw httpError(404, "Arquivo nao encontrado")
  const headers = new Headers(cors)
  headers.set("Content-Type", asset.mime_type)
  headers.set("Accept-Ranges", "bytes")
  headers.set("Cache-Control", "private, max-age=900")
  if (download) {
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(asset.original_name)}`)
  }
  if (rangeHeader && object.range) {
    const offset = object.range.offset
    const length = object.range.length
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${asset.size}`)
    headers.set("Content-Length", String(length))
  } else {
    headers.set("Content-Length", String(asset.size))
  }
  return new Response(object.body, { status, headers })
}

async function assetRow(id, env) {
  const row = await env.DB.prepare("SELECT * FROM cloud_assets WHERE id = ?").bind(id).first()
  if (!row) throw httpError(404, "Arquivo nao encontrado")
  return row
}

async function assetPayload(row, env) {
  const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS
  const [fileSignature, downloadSignature] = await Promise.all([
    signMedia(row.id, "asset-file", expires, env.SOUNDS_API_TOKEN),
    signMedia(row.id, "asset-download", expires, env.SOUNDS_API_TOKEN),
  ])
  return {
    ...row,
    tags: validJson(row.tags, []),
    metadata: validJson(row.metadata, {}),
    favorite: Boolean(row.favorite),
    file_url: `/assets/${row.id}/file?expires=${expires}&signature=${fileSignature}`,
    download_url: `/assets/${row.id}/download?expires=${expires}&signature=${downloadSignature}`,
  }
}

async function listSounds(url, env, cors) {
  const clauses = []
  const values = []
  const query = url.searchParams.get("q")?.trim()
  const category = url.searchParams.get("category")?.trim()
  const favorites = url.searchParams.get("favorites") === "true"
  if (query) {
    clauses.push("(name LIKE ? OR original_name LIKE ? OR tags LIKE ? OR category LIKE ?)")
    const pattern = `%${query}%`
    values.push(pattern, pattern, pattern, pattern)
  }
  if (category) {
    clauses.push("category = ?")
    values.push(category)
  }
  if (favorites) clauses.push("favorite = 1")
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
  const soundsStatement = env.DB.prepare(
    `SELECT * FROM sounds ${where} ORDER BY favorite DESC, updated_at DESC`
  ).bind(...values)
  const categoriesStatement = env.DB.prepare(
    "SELECT category, COUNT(*) AS total FROM sounds GROUP BY category ORDER BY category"
  )
  const usageStatement = storageUsageStatement(env)
  const operationStatement = env.DB.prepare(
    "SELECT class_a, class_b FROM usage_counters WHERE month = ?"
  ).bind(currentMonth())
  const [soundsResult, categoriesResult, usageResult, operationResult] = await env.DB.batch([
    soundsStatement,
    categoriesStatement,
    usageStatement,
    operationStatement,
  ])
  return json({
    sounds: await Promise.all(soundsResult.results.map(row => soundPayload(row, env))),
    categories: categoriesResult.results.map(row => ({ name: row.category, total: row.total })),
    usage: usagePayload(usageResult.results[0], env, operationResult.results[0]),
  }, 200, cors)
}

async function uploadSound(request, env, cors) {
  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File) || !file.size) throw httpError(400, "O arquivo enviado esta vazio")
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (!AUDIO_EXTENSIONS.has(extension)) throw httpError(400, "Formato de audio nao permitido")

  const usageRow = await storageUsageRow(env)
  const usage = usagePayload(usageRow, env)
  if (file.size > usage.max_file_size_bytes) {
    throw httpError(413, `Este audio ultrapassa o limite de ${formatMegabytes(usage.max_file_size_bytes)} MB`)
  }
  if (usage.total_files >= usage.max_files) {
    throw httpError(409, `Limite de ${usage.max_files.toLocaleString("pt-BR")} sons atingido`)
  }
  if (file.size > usage.remaining_bytes) {
    throw httpError(409, "Limite protegido de 9 GB atingido. Apague sons antes de enviar outros")
  }
  await consumeOperation("class_a", env)

  const id = crypto.randomUUID()
  const objectKey = `sounds/${id}.${extension}`
  const now = new Date().toISOString()
  const tags = validJson(form.get("tags"), [])
  const waveform = validJson(form.get("waveform"), [])
  const name = String(form.get("name") || file.name.replace(/\.[^.]+$/, "")).trim()
  const category = String(form.get("category") || "Sem categoria").trim() || "Sem categoria"
  const duration = Math.max(0, Number(form.get("duration")) || 0)
  const mimeType = file.type || "audio/mpeg"

  await env.SOUNDS.put(objectKey, file.stream(), {
    httpMetadata: { contentType: mimeType },
    customMetadata: { originalName: file.name },
  })
  try {
    await env.DB.prepare(
      `INSERT INTO sounds (
        id, name, original_name, object_key, category, tags, favorite,
        duration, size, mime_type, waveform, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, name, file.name, objectKey, category, JSON.stringify(tags),
      duration, file.size, mimeType, JSON.stringify(waveform), now, now
    ).run()
  } catch (error) {
    await env.SOUNDS.delete(objectKey)
    throw error
  }
  return json(await soundPayload(await soundRow(id, env), env), 201, cors)
}

async function updateSound(id, request, env, cors) {
  const current = await soundRow(id, env)
  const body = await request.json()
  const name = body.name === undefined ? current.name : String(body.name).trim()
  const category = body.category === undefined
    ? current.category
    : String(body.category).trim() || "Sem categoria"
  const tags = body.tags === undefined ? current.tags : JSON.stringify(body.tags)
  const favorite = body.favorite === undefined ? current.favorite : Number(Boolean(body.favorite))
  if (!name) throw httpError(400, "Informe um nome para o som")
  await env.DB.prepare(
    "UPDATE sounds SET name = ?, category = ?, tags = ?, favorite = ?, updated_at = ? WHERE id = ?"
  ).bind(name, category, tags, favorite, new Date().toISOString(), id).run()
  return json(await soundPayload(await soundRow(id, env), env), 200, cors)
}

async function deleteSound(id, env, cors) {
  const sound = await soundRow(id, env)
  await consumeOperation("class_a", env)
  await Promise.all([
    env.SOUNDS.delete(sound.object_key),
    env.DB.prepare("DELETE FROM sounds WHERE id = ?").bind(id).run(),
  ])
  return new Response(null, { status: 204, headers: cors })
}

async function serveSound(id, download, request, env, cors) {
  const url = new URL(request.url)
  const mode = download ? "download" : "audio"
  const expires = Number(url.searchParams.get("expires"))
  const signature = url.searchParams.get("signature") || ""
  if (!await verifyMediaSignature(id, mode, expires, signature, env)) {
    throw httpError(401, "Link de audio invalido ou expirado")
  }

  const sound = await soundRow(id, env)
  await consumeOperation("class_b", env)
  const rangeHeader = request.headers.get("Range")
  let object
  let status = 200
  if (rangeHeader) {
    const range = parseRange(rangeHeader, sound.size)
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: { ...cors, "Content-Range": `bytes */${sound.size}` },
      })
    }
    object = await env.SOUNDS.get(sound.object_key, {
      range: { offset: range.start, length: range.end - range.start + 1 },
    })
    status = 206
  } else {
    object = await env.SOUNDS.get(sound.object_key)
  }
  if (!object) throw httpError(404, "Arquivo de audio nao encontrado")
  const headers = new Headers(cors)
  headers.set("Content-Type", sound.mime_type)
  headers.set("Accept-Ranges", "bytes")
  headers.set("Cache-Control", "private, max-age=900")
  if (download) {
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(sound.original_name)}`)
  }
  if (rangeHeader && object.range) {
    const offset = object.range.offset
    const length = object.range.length
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${sound.size}`)
    headers.set("Content-Length", String(length))
  } else {
    headers.set("Content-Length", String(sound.size))
  }
  return new Response(object.body, { status, headers })
}

async function soundRow(id, env) {
  const row = await env.DB.prepare("SELECT * FROM sounds WHERE id = ?").bind(id).first()
  if (!row) throw httpError(404, "Som nao encontrado")
  return row
}

async function soundPayload(row, env) {
  const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS
  const [audioSignature, downloadSignature] = await Promise.all([
    signMedia(row.id, "audio", expires, env.SOUNDS_API_TOKEN),
    signMedia(row.id, "download", expires, env.SOUNDS_API_TOKEN),
  ])
  return {
    ...row,
    tags: validJson(row.tags, []),
    waveform: validJson(row.waveform, []),
    favorite: Boolean(row.favorite),
    audio_url: `/sounds/${row.id}/audio?expires=${expires}&signature=${audioSignature}`,
    download_url: `/sounds/${row.id}/download?expires=${expires}&signature=${downloadSignature}`,
  }
}

function usagePayload(row, env, operationRow = {}) {
  const used = Number(row?.used_bytes) || 0
  const totalFiles = Number(row?.total_files) || 0
  const limit = positiveInteger(env.STORAGE_LIMIT_BYTES, DEFAULT_STORAGE_LIMIT)
  const maxFiles = positiveInteger(env.MAX_SOUND_FILES, DEFAULT_MAX_FILES)
  const maxFileSize = positiveInteger(env.MAX_FILE_SIZE_BYTES, DEFAULT_MAX_FILE_SIZE)
  const classALimit = positiveInteger(env.MAX_CLASS_A_OPERATIONS, DEFAULT_MAX_CLASS_A_OPERATIONS)
  const classBLimit = positiveInteger(env.MAX_CLASS_B_OPERATIONS, DEFAULT_MAX_CLASS_B_OPERATIONS)
  return {
    used_bytes: used,
    limit_bytes: limit,
    remaining_bytes: Math.max(0, limit - used),
    percentage: Math.round((used / limit) * 100_000) / 1_000,
    total_files: totalFiles,
    max_files: maxFiles,
    max_file_size_bytes: maxFileSize,
    uploads_blocked: used >= limit || totalFiles >= maxFiles,
    protection: "cloud",
    operations: {
      month: currentMonth(),
      class_a: Number(operationRow?.class_a) || 0,
      class_a_limit: classALimit,
      class_b: Number(operationRow?.class_b) || 0,
      class_b_limit: classBLimit,
    },
  }
}

function storageUsageStatement(env) {
  return env.DB.prepare(
    `SELECT
      (SELECT COALESCE(SUM(size), 0) FROM sounds)
      + (SELECT COALESCE(SUM(size), 0) FROM cloud_assets) AS used_bytes,
      (SELECT COUNT(*) FROM sounds)
      + (SELECT COUNT(*) FROM cloud_assets) AS total_files`
  )
}

async function storageUsageRow(env) {
  return await storageUsageStatement(env).first()
}

async function consumeOperation(operationClass, env) {
  const column = operationClass === "class_a" ? "class_a" : "class_b"
  const limit = operationClass === "class_a"
    ? positiveInteger(env.MAX_CLASS_A_OPERATIONS, DEFAULT_MAX_CLASS_A_OPERATIONS)
    : positiveInteger(env.MAX_CLASS_B_OPERATIONS, DEFAULT_MAX_CLASS_B_OPERATIONS)
  const month = currentMonth()
  await env.DB.prepare(
    "INSERT OR IGNORE INTO usage_counters (month, class_a, class_b) VALUES (?, 0, 0)"
  ).bind(month).run()
  const row = await env.DB.prepare(
    `SELECT ${column} AS total FROM usage_counters WHERE month = ?`
  ).bind(month).first()
  if ((Number(row?.total) || 0) >= limit) {
    throw httpError(429, `Limite mensal protegido de operacoes ${operationClass === "class_a" ? "A" : "B"} atingido`)
  }
  await env.DB.prepare(
    `UPDATE usage_counters SET ${column} = ${column} + 1 WHERE month = ?`
  ).bind(month).run()
}

function requireAuthorization(request, env) {
  if (!env.SOUNDS_API_TOKEN) throw httpError(503, "Protecao da biblioteca ainda nao configurada")
  const authorization = request.headers.get("Authorization") || ""
  if (authorization !== `Bearer ${env.SOUNDS_API_TOKEN}`) {
    throw httpError(401, "Acesso nao autorizado")
  }
}

async function verifyMediaSignature(id, mode, expires, signature, env) {
  if (!env.SOUNDS_API_TOKEN || !Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000)) {
    return false
  }
  const expected = await signMedia(id, mode, expires, env.SOUNDS_API_TOKEN)
  return signature.length === expected.length && signature === expected
}

async function signMedia(id, mode, expires, secret) {
  if (!secret) throw httpError(503, "Protecao da biblioteca ainda nao configurada")
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}:${mode}:${expires}`))
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, "0")).join("")
}

function validJson(value, fallback) {
  try {
    return JSON.parse(String(value || ""))
  } catch {
    return fallback
  }
}

async function putObjectWithRetry(bucket, key, body, options, attempts = 4) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await bucket.put(key, body, options)
    } catch (error) {
      lastError = error
      const message = String(error?.message || "")
      if (attempt >= attempts || !isTransientCloudflareError(message)) {
        throw error
      }
      await sleep(250 * attempt * attempt)
    }
  }
  throw lastError
}

function isTransientCloudflareError(message) {
  return /internal connectivity issue|10001|timed out|network|fetch failed|temporar/i.test(message)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match) return null
  let start = match[1] ? Number(match[1]) : 0
  let end = match[2] ? Number(match[2]) : size - 1
  if (!match[1] && match[2]) {
    const suffix = Number(match[2])
    start = Math.max(0, size - suffix)
    end = size - 1
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null
  return { start, end: Math.min(end, size - 1) }
}

function inferAssetKind(name, mimeType = "") {
  const extension = name.split(".").pop()?.toLowerCase() || ""
  if (mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(extension)) return "imagem"
  if (mimeType.startsWith("video/") || ["mp4", "mov", "mkv", "webm", "avi", "m4v"].includes(extension)) return "video"
  if (mimeType.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension)) return "audio"
  if (["zip"].includes(extension)) return "pack"
  if (["json", "txt", "srt", "csv", "pdf", "xml", "ini", "cfg"].includes(extension)) return "documento"
  return "arquivo"
}

function assetExtension(name) {
  const parts = String(name || "").split(".")
  const raw = parts.length > 1 ? parts.pop().toLowerCase() : ""
  return /^[a-z0-9]{1,16}$/.test(raw) ? raw : "bin"
}

function mimeTypeFromExtension(extension) {
  const known = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    ogg: "audio/ogg",
    opus: "audio/opus",
    zip: "application/zip",
    json: "application/json",
    txt: "text/plain",
    srt: "text/plain",
    csv: "text/csv",
    pdf: "application/pdf",
    dat: "application/octet-stream",
    bin: "application/octet-stream",
    xml: "application/xml",
    ini: "text/plain",
    cfg: "text/plain",
    meta: "application/octet-stream",
    effect: "application/octet-stream",
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
  }
  return known[extension] || "application/octet-stream"
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin")
  const allowed = String(env.ALLOWED_ORIGIN || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
  const allowOrigin = !origin
    ? ""
    : allowed.includes("*") || allowed.includes(origin)
      ? origin
      : ""
  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges,Content-Disposition",
  }
}

function json(value, status, headers) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  })
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function formatMegabytes(bytes) {
  return Math.round(bytes / 1_000_000)
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}
