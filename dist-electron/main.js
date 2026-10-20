import { spawn as e } from "node:child_process";
import { randomBytes as t } from "node:crypto";
import { existsSync as n } from "node:fs";
import { mkdir as r, readFile as i, writeFile as a } from "node:fs/promises";
import { createServer as o } from "node:net";
import { join as s } from "node:path";
import { BrowserWindow as c, app as l, dialog as u, ipcMain as d, protocol as f, safeStorage as p, session as m, shell as h } from "electron";
var g = {
	name: "studio",
	version: "0.1.0",
	private: !0,
	productName: "BaSyx Studio",
	type: "module",
	main: "dist-electron/main.js",
	scripts: {
		build: "pnpm apps:bundle && nuxt build",
		"build:electron": "pnpm build:electron:app && electron-builder --publish never",
		"build:electron:app": "pnpm apps:bundle && nuxt build --envName electron",
		"build:electron:linux": "pnpm build:electron:app && electron-builder --linux --publish never",
		"build:electron:mac": "pnpm build:electron:app && electron-builder --mac --publish never",
		"build:electron:win": "node scripts/require-build-platform.mjs win32 && pnpm build:electron:app && electron-builder --win --x64 --arm64 --publish never",
		dev: "nuxt dev",
		"dev:electron": "nuxt dev --envName electron",
		generate: "nuxt generate",
		preview: "nuxt preview",
		postinstall: "nuxt prepare",
		lint: "eslint",
		"lint:fix": "eslint --fix",
		"i18n:check": "node scripts/check-i18n.mjs",
		"testenv:up": "docker compose -f test-setup/docker-compose.yaml up -d --wait --wait-timeout 300",
		"testenv:down": "docker compose -f test-setup/docker-compose.yaml --profile large --profile demo down -v",
		"testenv:smoke": "node test-setup/smoke-test.mjs",
		"testenv:fixtures": "node test-setup/fixtures/generate-fixtures.mjs && node test-setup/fixtures/generate-models3d.mjs",
		"testenv:large": "node test-setup/fixtures/generate-fixtures.mjs --large && docker compose -f test-setup/docker-compose.yaml --profile large up -d --wait --wait-timeout 600 basyx-large",
		"testenv:demo": "node examples/apps/fleet-atlas/demo/generate-fleet.mjs && docker compose -f test-setup/docker-compose.yaml --profile demo up -d --wait --wait-timeout 600 basyx-demo",
		"testenv:demo:live": "node examples/apps/fleet-atlas/demo/simulate.mjs",
		"apps:build": "node scripts/build-example-apps.mjs",
		"apps:bundle": "node scripts/build-example-apps.mjs apps server/bundled-apps",
		typecheck: "nuxt typecheck && pnpm --filter \"./apps/*\" --filter \"./packages/*\" --if-present run typecheck",
		test: "vitest run",
		"test:watch": "vitest",
		"db:generate": "drizzle-kit generate",
		"test:integration": "STUDIO_TESTENV=1 vitest run",
		"test:e2e:web": "playwright test -c test/e2e/web.config.ts",
		"test:e2e:desktop": "playwright test -c test/e2e/desktop.config.ts",
		"build:electron:dir": "pnpm build:electron:app && electron-builder --dir --publish never"
	},
	dependencies: {
		"@aas-core-works/aas-core3.1-typescript": "^1.0.1",
		"@electric-sql/pglite": "^0.5.10",
		"@mdi/font": "7.4.47",
		"@nuxtjs/i18n": "^10.6.0",
		"@pinia/colada": "1.4.8",
		"@pinia/colada-nuxt": "1.2.0",
		"@plantuml/core": "^1.2026.8",
		"aas-package3-typescript": "^1.1.0",
		ajv: "^8.20.0",
		"ajv-formats": "^3.0.1",
		"basyx-typescript-sdk": "^2.4.1",
		"drizzle-orm": "^0.45.4",
		fflate: "^0.8.3",
		"grid-layout-plus": "1.1.1",
		jsqr: "1.4.0",
		"monaco-editor": "^0.56.0",
		"node-forge": "^1.4.0",
		nuxt: "^4.6.2",
		"openid-client": "^6.8.8",
		pg: "^8.23.1",
		pinia: "^4.1.0",
		semver: "^7.8.5",
		undici: "^8.12.2",
		uqr: "0.1.3",
		vue: "^3.5.44",
		vuetify: "^4.2.6",
		"vuetify-nuxt-module": "1.0.0-rc.6",
		yaml: "^2.9.1",
		zod: "^4.6.7"
	},
	devDependencies: {
		"@basyx/model-viewer": "workspace:*",
		"@basyx/studio-sdk": "workspace:*",
		"@electric-sql/pglite-tools": "^0.4.10",
		"@intlify/message-compiler": "^11.4.13",
		"@nuxt/eslint": "^1.17.0",
		"@nuxt/fonts": "^1.0.1",
		"@pinia/nuxt": "^1.0.3",
		"@playwright/test": "1.64.0",
		"@types/node-forge": "^1.3.14",
		"@types/pg": "^8.23.1",
		"@types/semver": "^7.7.1",
		"@vuetify/mcp": "^0.12.2",
		"drizzle-kit": "^0.31.11",
		electron: "^44.9.0",
		"electron-builder": "^26.15.3",
		esbuild: "0.28.2",
		eslint: "^10.12.0",
		"eslint-config-vuetify": "^4.7.2",
		"nuxt-electron": "^0.7.0",
		pnpm: "12.10.1",
		sass: "^1.105.2",
		typescript: "^6.0.3",
		"vite-plugin-electron": "^1.1.2",
		"vite-plugin-electron-renderer": "^1.0.0",
		vitest: "^5.0.5",
		"vue-tsc": "^3.3.12"
	},
	build: {
		copyright: "Copyright (C) 2026 the Eclipse BaSyx Authors",
		artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
		directories: { output: "dist" },
		files: [
			".output/**/*",
			"dist-electron/**/*",
			"package.json"
		],
		extraResources: [{
			from: "node_modules/deno",
			to: "deno",
			filter: ["deno", "deno.exe"]
		}],
		mac: {
			icon: "build/icon.icns",
			category: "public.app-category.developer-tools",
			target: [{
				target: "dmg",
				arch: ["arm64"]
			}, {
				target: "zip",
				arch: ["arm64"]
			}]
		},
		win: { target: "nsis" },
		nsis: { buildUniversalInstaller: !1 },
		linux: {
			category: "Development",
			target: [{
				target: "AppImage",
				arch: ["x64", "arm64"]
			}]
		}
	},
	packageManager: "pnpm@12.10.1+sha512.ba40a37eb1a370d60fea8c4cf1d364c13bcccef518e98ad2bcee954f539d38da37458e58261a3fa55e06523450ea0ffff9f497b135be41f2c15c1642bacace6c",
	devEngines: { runtime: {
		name: "deno",
		version: "2.9.6",
		onFail: "download"
	} }
}, _ = [
	"stack-aasx",
	"stack-import",
	"stack-export",
	"stack-logs"
], v = {
	"stack-aasx": ["aasx"],
	"stack-import": ["zip", "json"],
	"stack-export": ["zip"],
	"stack-logs": ["txt"]
};
function y(e) {
	return e === "stack-export" || e === "stack-logs";
}
function b(e) {
	return typeof e == "string" && _.includes(e);
}
//#endregion
//#region electron/main.ts
var x = "X-Studio-Launch-Secret", S = "X-Studio-Broker-Secret", C = "127.0.0.1", w = 15e3, T = [{
	name: "AASX package",
	extensions: ["aasx"]
}], E = "studio-app", D = /^app-[0-9a-f]{16}$/;
f.registerSchemesAsPrivileged([{
	scheme: E,
	privileges: {
		standard: !0,
		secure: !0,
		supportFetchAPI: !0,
		corsEnabled: !0
	}
}]);
var O = process.env.STUDIO_BROKER_SECRET ?? t(32).toString("base64url"), k, A, j, M = !1;
function N(e) {
	let t = new URL(e), n = /* @__PURE__ */ new Set([
		"127.0.0.1",
		"::1",
		"localhost"
	]);
	if (t.protocol !== "http:" || !n.has(t.hostname)) throw Error("The Electron development server URL must use HTTP on loopback.");
	return t.href;
}
async function P() {
	let e = o();
	await new Promise((t, n) => {
		e.once("error", n), e.listen(0, C, t);
	});
	let t = e.address();
	if (!t || typeof t == "string") throw e.close(), Error("Could not allocate a loopback port for the Studio Service.");
	let n = t.port;
	return await new Promise((t, n) => {
		e.close((e) => e ? n(e) : t());
	}), n;
}
async function F(e, t, n) {
	let r = Date.now() + w, i, a = (e) => {
		i = e;
	};
	n.once("error", a);
	try {
		for (; Date.now() < r;) {
			if (i) throw i;
			if (n.exitCode !== null) throw Error(`The Studio Service exited during startup with code ${n.exitCode}.`);
			try {
				if ((await fetch(e, {
					headers: { [x]: t },
					signal: AbortSignal.timeout(1e3)
				})).ok) return;
			} catch {}
			await new Promise((e) => setTimeout(e, 100));
		}
	} finally {
		n.off("error", a);
	}
	throw Error("Timed out while starting the local Studio Service.");
}
async function I() {
	if (!p.isEncryptionAvailable()) throw Error("The operating system credential store is not available.");
	if (process.platform === "linux" && p.getSelectedStorageBackend() === "basic_text") throw Error("No supported credential store (libsecret or kwallet) was found. BaSyx Studio does not store keys in plain text.");
	let e = s(l.getPath("userData"), "data-key.bin");
	if (n(e)) return p.decryptString(await i(e));
	let o = t(32).toString("base64url");
	return await r(l.getPath("userData"), { recursive: !0 }), await a(e, p.encryptString(o), { mode: 384 }), o;
}
async function L() {
	let r = s(l.getAppPath(), ".output", "server", "index.mjs");
	if (!n(r)) throw Error("The packaged Studio Service entry point is missing.");
	let i = await P(), a = t(32).toString("base64url"), o = `http://${C}:${i}/`, c = await I();
	return j = e(process.execPath, [r], {
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
			NITRO_HOST: C,
			NITRO_PORT: String(i),
			NUXT_STUDIO_DEPLOYMENT_MODE: "desktop",
			STUDIO_DATA_DIR: s(l.getPath("userData"), "studio-data"),
			STUDIO_DATA_KEY: c,
			STUDIO_LAUNCH_SECRET: a,
			STUDIO_BROKER_SECRET: O,
			STUDIO_DENO_PATH: s(process.resourcesPath, "deno", process.platform === "win32" ? "deno.exe" : "deno")
		},
		stdio: [
			"ignore",
			"inherit",
			"inherit"
		]
	}), await F(o, a, j), j.once("exit", (e, t) => {
		M || (u.showErrorBox("BaSyx Studio Service stopped", `The local Studio Service exited unexpectedly (${t ?? e ?? "unknown reason"}).`), l.quit());
	}), {
		launchSecret: a,
		url: o
	};
}
var R = /* @__PURE__ */ new WeakSet();
function z(e, t, n) {
	if (R.has(e)) return;
	R.add(e);
	let r = new URL(t).origin;
	e.protocol.handle(E, async (e) => {
		let r = new URL(e.url);
		if (e.method !== "GET" || !D.test(r.hostname)) return new Response(null, { status: 404 });
		let i = await fetch(new URL(`app/${r.hostname}${r.pathname}`, t), { headers: {
			[S]: O,
			...n ? { [x]: n } : {}
		} }), a = new Headers(i.headers);
		return a.delete("content-encoding"), a.delete("content-length"), new Response(i.body, {
			status: i.status,
			headers: a
		});
	}), e.setPermissionRequestHandler((e, t, n, i) => {
		n(new URL(i.requestingUrl).origin === r);
	}), e.setPermissionCheckHandler((e, t, n) => n === r);
}
function B(e, t) {
	let n = new URL(t).origin;
	e.webContents.on("will-frame-navigate", (e) => {
		if (e.isMainFrame) return;
		let t = new URL(e.url), r = e.frame?.url ? new URL(e.frame.url) : null;
		t.origin !== n && (t.protocol !== `${E}:` || r?.protocol === `${E}:` && r.hostname !== t.hostname) && e.preventDefault();
	});
}
async function V(e, t) {
	let n = m.fromPartition("studio");
	z(n, e, t), t && n.webRequest.onBeforeSendHeaders({ urls: [`${e}*`] }, (e, n) => {
		n({ requestHeaders: {
			...e.requestHeaders,
			[x]: t
		} });
	});
	let r = new c({
		show: !1,
		title: "BaSyx Studio",
		...l.isPackaged ? {} : { icon: q() },
		width: 1440,
		height: 900,
		minWidth: 1024,
		minHeight: 640,
		webPreferences: {
			contextIsolation: !0,
			nodeIntegration: !1,
			sandbox: !0,
			session: n,
			preload: s(import.meta.dirname, "preload.cjs")
		}
	});
	K(r), B(r, e);
	let i = new URL(e).origin;
	r.webContents.on("will-navigate", (e, t) => {
		new URL(t).origin !== i && e.preventDefault();
	}), r.webContents.setWindowOpenHandler(({ url: e }) => {
		let t = new URL(e).protocol;
		return (t === "https:" || t === "http:") && h.openExternal(e), { action: "deny" };
	}), r.once("ready-to-show", () => r.show()), await r.loadURL(e), l.isPackaged || r.webContents.openDevTools();
}
async function H(e, t = {}) {
	if (!k) throw Error("The Studio Service is not running.");
	let n = await fetch(new URL(`api/studio/v1/${e}`, k), {
		method: t.method ?? "GET",
		headers: {
			[S]: O,
			...A ? { [x]: A } : {},
			...t.body === void 0 ? {} : { "Content-Type": "application/json" }
		},
		body: t.body === void 0 ? void 0 : JSON.stringify(t.body),
		signal: AbortSignal.timeout(1e4)
	});
	if (!n.ok) throw Error(`The Studio Service answered with HTTP ${n.status}.`);
	return await n.json();
}
function U(e) {
	let t = e.senderFrame;
	return !!(k && t && t === e.sender.mainFrame && new URL(t.url).origin === new URL(k).origin);
}
function W() {
	d.handle("studio:choose-aasx-file", async (e) => {
		if (!U(e)) throw Error("Untrusted sender.");
		let t = c.fromWebContents(e.sender), n = {
			properties: ["openFile"],
			filters: T
		}, r = t ? await u.showOpenDialog(t, n) : await u.showOpenDialog(n);
		return r.canceled || !r.filePaths[0] ? null : H("desktop/file-grants", {
			method: "POST",
			body: {
				path: r.filePaths[0],
				purpose: "open"
			}
		});
	}), d.handle("studio:choose-stack-files", (e, t, n) => G(e, t, n)), d.handle("studio:choose-save-location", async (e, t) => {
		if (!U(e)) throw Error("Untrusted sender.");
		let n = c.fromWebContents(e.sender), r = {
			defaultPath: typeof t == "string" ? t.replaceAll(/[/\\]/g, "_") : void 0,
			filters: T
		}, i = n ? await u.showSaveDialog(n, r) : await u.showSaveDialog(r);
		return i.canceled || !i.filePath ? null : H("desktop/file-grants", {
			method: "POST",
			body: {
				path: i.filePath.toLowerCase().endsWith(".aasx") ? i.filePath : `${i.filePath}.aasx`,
				purpose: "save"
			}
		});
	});
}
async function G(e, t, n) {
	if (!U(e)) throw Error("Untrusted sender.");
	if (!b(t)) throw Error("Unknown file kind.");
	let r = c.fromWebContents(e.sender), i = (e, n) => H("desktop/file-grants", {
		method: "POST",
		body: {
			path: e,
			purpose: n,
			kind: t
		}
	}), a = [...v[t]];
	if (y(t)) {
		let e = typeof n == "string" && n ? n.replaceAll(/[/\\:*?"<>|]/g, "_").slice(0, 200) : "basyx", t = a[0], o = {
			defaultPath: `${e}.${t}`,
			filters: [{
				name: t.toUpperCase(),
				extensions: a
			}]
		}, s = r ? await u.showSaveDialog(r, o) : await u.showSaveDialog(o);
		return s.canceled || !s.filePath ? [] : [await i(s.filePath.toLowerCase().endsWith(`.${t}`) ? s.filePath : `${s.filePath}.${t}`, "save")];
	}
	let o = t === "stack-aasx" ? {
		properties: ["openFile", "multiSelections"],
		filters: T
	} : {
		properties: ["openFile"],
		filters: [{
			name: "BaSyx setup",
			extensions: a
		}]
	}, s = r ? await u.showOpenDialog(r, o) : await u.showOpenDialog(o);
	return s.canceled ? [] : Promise.all(s.filePaths.slice(0, 20).map((e) => i(e, "open")));
}
function K(e) {
	let t = !1;
	e.on("close", (n) => {
		if (t) return;
		n.preventDefault();
		let r = M;
		H("desktop/state").then((e) => e.unsavedWorkspaces).catch(() => []).then(async (n) => {
			if (n.length > 0) {
				let { response: t } = await u.showMessageBox(e, {
					type: "warning",
					buttons: ["Cancel", "Close without saving"],
					defaultId: 0,
					cancelId: 0,
					message: "Some packages have unsaved changes.",
					detail: n.join("\n")
				});
				if (t !== 1) {
					M = !1;
					return;
				}
			}
			t = !0, r ? l.quit() : e.close();
		});
	});
}
function q() {
	return s(l.getAppPath(), "build", "icon.png");
}
async function J() {
	W(), l.setAboutPanelOptions({
		applicationName: g.productName,
		applicationVersion: l.getVersion(),
		version: "",
		copyright: g.build.copyright,
		...l.isPackaged ? {} : { iconPath: q() }
	}), !l.isPackaged && process.platform === "darwin" && l.dock?.setIcon(q());
	let e = process.env.VITE_DEV_SERVER_URL;
	if (!l.isPackaged) {
		if (!e) throw Error("The Electron development server URL is missing.");
		k = N(e), await V(k);
		return;
	}
	let t = await L();
	k = t.url, A = t.launchSecret, await V(k, A);
}
function Y(e) {
	let t = e instanceof Error ? e.message : "Unknown startup error.";
	u.showErrorBox("BaSyx Studio could not start", t), l.quit();
}
process.env.STUDIO_USER_DATA_DIR && l.setPath("userData", process.env.STUDIO_USER_DATA_DIR), l.requestSingleInstanceLock() ? (l.on("second-instance", () => {
	let [e] = c.getAllWindows();
	e && (e.isMinimized() && e.restore(), e.focus());
}), l.whenReady().then(J).catch(Y)) : l.quit(), l.on("activate", () => {
	c.getAllWindows().length === 0 && k && V(k, A).catch(Y);
}), l.on("before-quit", () => {
	M = !0;
}), l.on("will-quit", () => {
	j?.kill(), j = void 0;
}), l.on("window-all-closed", () => {
	process.platform !== "darwin" && l.quit();
});
//#endregion
export {};
