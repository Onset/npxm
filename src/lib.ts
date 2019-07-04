import fs from 'fs-extra'
import npm from 'libnpm'
import path from 'path'

import { installedDir } from './config'

export interface Manifest {
	name: string
	version: string
	bin?: {
		[key: string]: string
	}
}

const exec = (cmd: string, params: string[], cwd: string): Promise<void> =>
	new Promise((resolve, reject) => {
		const process = require('child_process').spawn(cmd, params, {
			cwd,
			stdio: 'inherit',
		})
		process.on('exit', (code: number) => {
			if (code === 0) {
				resolve()
			} else {
				reject()
			}
		})
	})

function makeSymlink(packageName: string, version: string, tag: string) {
	const source = path.join(installedDir, packageName, version)
	const alias = path.join(installedDir, packageName, tag)

	if (alias === source) {
		return
	}
	if (fs.existsSync(alias)) {
		fs.unlinkSync(alias)
	}
	return fs.symlinkSync(source, alias)
}

export function getPackageRef(packageName: string) {
	return packageName
}

export async function add(
	packageName: string,
	forceUpdate = false
): Promise<{ manifest: Manifest; packagePath: string }> {
	console.log(`[npxm] Adding ${packageName} ${forceUpdate ? 'forcing update' : ''}`)

	const requestedVersion = packageName.split('@')[1] || null

	return npm.manifest(getPackageRef(packageName)).then(async (manifest: Manifest) => {
		const packagePath = path.join(installedDir, manifest.name, manifest.version)

		const result = { manifest, packagePath }

		if (fs.existsSync(packagePath)) {
			if (!forceUpdate) {
				console.log(`[npxm] ${manifest.name}@${manifest.version} already installed.`)
				if (requestedVersion) {
					makeSymlink(manifest.name, manifest.version, requestedVersion)
				}
				return result
			}
		}

		console.log(`[npxm] Downloading ${manifest.name}@${manifest.version}`)
		fs.mkdirpSync(packagePath)

		await npm
			.extract(`${manifest.name}@${manifest.version}`, packagePath)
			.then(() => exec('yarn', ['install'], packagePath))
			.then(() => {
				if (requestedVersion) {
					makeSymlink(manifest.name, manifest.version, requestedVersion)
				}
			})

		return result
	})
}

export async function link(packageName: string, forceUpdate = false) {
	const info = await add(packageName, forceUpdate)
	console.log(`[npxm] Linking ${packageName}`)
	return exec('npm', ['link'], info.packagePath)
}

export async function run(packageName: string, command: string, params: string[] = []) {
	const info = await add(packageName)

	const availableBins = Object.keys(info.manifest.bin || {})

	if (availableBins.indexOf(command)) {
		if (availableBins.length === 1) {
			params.unshift(command)
			command = availableBins[0]
		} else {
			throw new Error(
				`[npxm] Cannot run bin \`${command}\` on ${packageName}. Available run commands: ${availableBins.join(
					', '
				)}.`
			)
		}
	}

	const runCommand = `${command} ${params ? params.join(' ') : ''}`

	console.log(
		`[npxm] Running \`${runCommand}\` (${info.manifest.name}@${info.manifest.version} at ${info.packagePath})`
	)

	if (info.manifest.bin) {
		const binPath = path.join(info.packagePath, info.manifest.bin[command])

		if (fs.existsSync(binPath)) {
			await exec('chmod', ['+x', binPath], info.packagePath)
			await exec(binPath, params || [], process.cwd())
		} else {
			throw new Error(`[npxm] Executable ${binPath} does not exist`)
		}
	}
}

export async function cleanup() {
	console.log(`[npxm] Cleanup…`)
	return fs.remove(installedDir)
}

export default {
	add,
	link,
	run,
	cleanup,
}