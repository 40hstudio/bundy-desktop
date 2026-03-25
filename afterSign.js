#!/usr/bin/env node
/**
 * afterSign.js — Re-sign all Mach-O binaries after electron-builder packages the app.
 *
 * Electron-builder signs the main binary but leaves native .node files with
 * the linker's default "adhoc,linker-signed" flag. macOS Gatekeeper rejects
 * these even after removing quarantine. We must explicitly re-sign every
 * Mach-O binary (including all .node files) with a consistent signature.
 *
 * Signing identity priority:
 *   1. BUNDY_SIGN_IDENTITY env var
 *   2. "Bundy Signing" self-signed cert (run scripts/setup-codesign.sh once)
 *   3. Ad-hoc fallback ("-") — Gatekeeper-compatible but macOS will re-prompt
 *      for accessibility permission on every reinstall.
 */

const { execSync, spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

/**
 * Find a stable code-signing identity to use.
 *
 * Priority:
 *   1. BUNDY_SIGN_IDENTITY env var (CI override)
 *   2. "Bundy Signing" self-signed cert (created by scripts/setup-codesign.sh)
 *   3. Fall back to ad-hoc ("-") — works but macOS revokes TCC permissions on
 *      every reinstall because the content-hash changes each build.
 */
function resolveSignIdentity() {
  if (process.env.BUNDY_SIGN_IDENTITY) return process.env.BUNDY_SIGN_IDENTITY
  try {
    const out = execSync('security find-identity -v -p codesigning 2>/dev/null', { encoding: 'utf8' })
    if (out.includes('"Bundy Signing"')) {
      console.log('[afterSign] Using "Bundy Signing" cert — TCC permissions will persist across reinstalls.')
      return 'Bundy Signing'
    }
  } catch { /* ignore */ }
  console.warn('[afterSign] No stable signing cert found — falling back to ad-hoc.')
  console.warn('[afterSign] Run scripts/setup-codesign.sh once to fix accessibility permission prompts on reinstall.')
  return '-'
}

function findMachO(dir) {
  const results = []
  if (!fs.existsSync(dir)) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      results.push(...findMachO(full))
    } else if (entry.isFile()) {
      // Check magic bytes: Mach-O = 0xFEEDFACF (64-bit) or 0xCAFEBABE (fat)
      try {
        const fd = fs.openSync(full, 'r')
        const buf = Buffer.alloc(4)
        fs.readSync(fd, buf, 0, 4, 0)
        fs.closeSync(fd)
        const magic = buf.readUInt32BE(0)
        if (magic === 0xFEEDFACF || magic === 0xFEEDFACE || magic === 0xCAFEBABE || magic === 0xBEBAFECA) {
          results.push(full)
        }
      } catch { /* skip unreadable */ }
    }
  }
  return results
}

exports.default = async function afterSign(context) {
  const { appOutDir, packager } = context
  const platform = packager.platform.name

  if (platform !== 'mac') return

  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`)
  console.log(`[afterSign] Re-signing all Mach-O binaries in: ${appPath}`)

  const signIdentity = resolveSignIdentity()

  // 1. Find and individually resign every .node native module
  const unpacked = path.join(appPath, 'Contents', 'Resources', 'app.asar.unpacked')
  const machineBinaries = findMachO(unpacked)
  let count = 0
  for (const bin of machineBinaries) {
    const result = spawnSync('codesign', ['--force', '--sign', signIdentity, bin], { stdio: 'pipe' })
    if (result.status !== 0) {
      console.warn(`[afterSign] warn: could not sign ${path.basename(bin)}`)
    } else {
      count++
    }
  }
  console.log(`[afterSign] Signed ${count} native binaries.`)

  // 2. Deep-resign the whole bundle to make the signature tree consistent
  try {
    execSync(`codesign --deep --force --sign "${signIdentity}" "${appPath}"`, { stdio: 'inherit' })
    console.log('[afterSign] Bundle re-signed successfully.')
  } catch (e) {
    console.error('[afterSign] codesign failed:', e.message)
  }
}
