import { spawn as e } from "node:child_process";
import { randomBytes as t } from "node:crypto";
import { existsSync as n } from "node:fs";
import { mkdir as r, readFile as i, writeFile as a } from "node:fs/promises";
import { createServer as o } from "node:net";
import { join as s } from "node:path";
import { BrowserWindow as c, app as l, dialog as u, ipcMain as d, protocol as f, safeStorage as p, session as m, shell as h } from "electron";
//#region packages/studio-sdk/src/protocol.ts
var g = [
	"stack-aasx",
	"stack-import",
	"stack-export",
	"stack-logs"
], _ = {
	"stack-aasx": ["aasx"],
	"stack-import": ["zip", "json"],
	"stack-export": ["zip"],
	"stack-logs": ["txt"]
};
function v(e) {
	return e === "stack-export" || e === "stack-logs";
}
function y(e) {
	return typeof e == "string" && g.includes(e);
}
//#endregion
//#region electron/main.ts
var b = "X-Studio-Launch-Secret", x = "X-Studio-Broker-Secret", S = "127.0.0.1", C = 15e3, w = [{
	name: "AASX package",
	extensions: ["aasx"]
}], T = "studio-app", E = /^app-[0-9a-f]{16}$/;
f.registerSchemesAsPrivileged([{
	scheme: T,
	privileges: {
		standard: !0,
		secure: !0,
		supportFetchAPI: !0,
		corsEnabled: !0
	}
}]);
var D = process.env.STUDIO_BROKER_SECRET ?? t(32).toString("base64url"), O, k, A, j = !1;
function M(e) {
	let t = new URL(e), n = /* @__PURE__ */ new Set([
		"127.0.0.1",
		"::1",
		"localhost"
	]);
	if (t.protocol !== "http:" || !n.has(t.hostname)) throw Error("The Electron development server URL must use HTTP on loopback.");
	return t.href;
}
async function N() {
	let e = o();
	await new Promise((t, n) => {
		e.once("error", n), e.listen(0, S, t);
	});
	let t = e.address();
	if (!t || typeof t == "string") throw e.close(), Error("Could not allocate a loopback port for the Studio Service.");
	let n = t.port;
	return await new Promise((t, n) => {
		e.close((e) => e ? n(e) : t());
	}), n;
}
async function P(e, t, n) {
	let r = Date.now() + C, i, a = (e) => {
		i = e;
	};
	n.once("error", a);
	try {
		for (; Date.now() < r;) {
			if (i) throw i;
			if (n.exitCode !== null) throw Error(`The Studio Service exited during startup with code ${n.exitCode}.`);
			try {
				if ((await fetch(e, {
					headers: { [b]: t },
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
async function F() {
	if (!p.isEncryptionAvailable()) throw Error("The operating system credential store is not available.");
	if (process.platform === "linux" && p.getSelectedStorageBackend() === "basic_text") throw Error("No supported credential store (libsecret or kwallet) was found. BaSyx Studio does not store keys in plain text.");
	let e = s(l.getPath("userData"), "data-key.bin");
	if (n(e)) return p.decryptString(await i(e));
	let o = t(32).toString("base64url");
	return await r(l.getPath("userData"), { recursive: !0 }), await a(e, p.encryptString(o), { mode: 384 }), o;
}
async function I() {
	let r = s(l.getAppPath(), ".output", "server", "index.mjs");
	if (!n(r)) throw Error("The packaged Studio Service entry point is missing.");
	let i = await N(), a = t(32).toString("base64url"), o = `http://${S}:${i}/`, c = await F();
	return A = e(process.execPath, [r], {
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
			NITRO_HOST: S,
			NITRO_PORT: String(i),
			NUXT_STUDIO_DEPLOYMENT_MODE: "desktop",
			STUDIO_DATA_DIR: s(l.getPath("userData"), "studio-data"),
			STUDIO_DATA_KEY: c,
			STUDIO_LAUNCH_SECRET: a,
			STUDIO_BROKER_SECRET: D,
			STUDIO_DENO_PATH: s(process.resourcesPath, "deno", process.platform === "win32" ? "deno.exe" : "deno")
		},
		stdio: [
			"ignore",
			"inherit",
			"inherit"
		]
	}), await P(o, a, A), A.once("exit", (e, t) => {
		j || (u.showErrorBox("BaSyx Studio Service stopped", `The local Studio Service exited unexpectedly (${t ?? e ?? "unknown reason"}).`), l.quit());
	}), {
		launchSecret: a,
		url: o
	};
}
var L = /* @__PURE__ */ new WeakSet();
function R(e, t, n) {
	if (L.has(e)) return;
	L.add(e);
	let r = new URL(t).origin;
	e.protocol.handle(T, async (e) => {
		let r = new URL(e.url);
		if (e.method !== "GET" || !E.test(r.hostname)) return new Response(null, { status: 404 });
		let i = await fetch(new URL(`app/${r.hostname}${r.pathname}`, t), { headers: {
			[x]: D,
			...n ? { [b]: n } : {}
		} }), a = new Headers(i.headers);
		return a.delete("content-encoding"), a.delete("content-length"), new Response(i.body, {
			status: i.status,
			headers: a
		});
	}), e.setPermissionRequestHandler((e, t, n, i) => {
		n(new URL(i.requestingUrl).origin === r);
	}), e.setPermissionCheckHandler((e, t, n) => n === r);
}
function z(e, t) {
	let n = new URL(t).origin;
	e.webContents.on("will-frame-navigate", (e) => {
		if (e.isMainFrame) return;
		let t = new URL(e.url), r = e.frame?.url ? new URL(e.frame.url) : null;
		t.origin !== n && (t.protocol !== `${T}:` || r?.protocol === `${T}:` && r.hostname !== t.hostname) && e.preventDefault();
	});
}
async function B(e, t) {
	let n = m.fromPartition("studio");
	R(n, e, t), t && n.webRequest.onBeforeSendHeaders({ urls: [`${e}*`] }, (e, n) => {
		n({ requestHeaders: {
			...e.requestHeaders,
			[b]: t
		} });
	});
	let r = new c({
		show: !1,
		title: "BaSyx Studio",
		...l.isPackaged ? {} : { icon: K() },
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
	G(r), z(r, e);
	let i = new URL(e).origin;
	r.webContents.on("will-navigate", (e, t) => {
		new URL(t).origin !== i && e.preventDefault();
	}), r.webContents.setWindowOpenHandler(({ url: e }) => {
		let t = new URL(e).protocol;
		return (t === "https:" || t === "http:") && h.openExternal(e), { action: "deny" };
	}), r.once("ready-to-show", () => r.show()), await r.loadURL(e), l.isPackaged || r.webContents.openDevTools();
}
async function V(e, t = {}) {
	if (!O) throw Error("The Studio Service is not running.");
	let n = await fetch(new URL(`api/studio/v1/${e}`, O), {
		method: t.method ?? "GET",
		headers: {
			[x]: D,
			...k ? { [b]: k } : {},
			...t.body === void 0 ? {} : { "Content-Type": "application/json" }
		},
		body: t.body === void 0 ? void 0 : JSON.stringify(t.body),
		signal: AbortSignal.timeout(1e4)
	});
	if (!n.ok) throw Error(`The Studio Service answered with HTTP ${n.status}.`);
	return await n.json();
}
function H(e) {
	let t = e.senderFrame;
	return !!(O && t && t === e.sender.mainFrame && new URL(t.url).origin === new URL(O).origin);
}
function U() {
	d.handle("studio:choose-aasx-file", async (e) => {
		if (!H(e)) throw Error("Untrusted sender.");
		let t = c.fromWebContents(e.sender), n = {
			properties: ["openFile"],
			filters: w
		}, r = t ? await u.showOpenDialog(t, n) : await u.showOpenDialog(n);
		return r.canceled || !r.filePaths[0] ? null : V("desktop/file-grants", {
			method: "POST",
			body: {
				path: r.filePaths[0],
				purpose: "open"
			}
		});
	}), d.handle("studio:choose-stack-files", (e, t, n) => W(e, t, n)), d.handle("studio:choose-save-location", async (e, t) => {
		if (!H(e)) throw Error("Untrusted sender.");
		let n = c.fromWebContents(e.sender), r = {
			defaultPath: typeof t == "string" ? t.replaceAll(/[/\\]/g, "_") : void 0,
			filters: w
		}, i = n ? await u.showSaveDialog(n, r) : await u.showSaveDialog(r);
		return i.canceled || !i.filePath ? null : V("desktop/file-grants", {
			method: "POST",
			body: {
				path: i.filePath.toLowerCase().endsWith(".aasx") ? i.filePath : `${i.filePath}.aasx`,
				purpose: "save"
			}
		});
	});
}
async function W(e, t, n) {
	if (!H(e)) throw Error("Untrusted sender.");
	if (!y(t)) throw Error("Unknown file kind.");
	let r = c.fromWebContents(e.sender), i = (e, n) => V("desktop/file-grants", {
		method: "POST",
		body: {
			path: e,
			purpose: n,
			kind: t
		}
	}), a = [..._[t]];
	if (v(t)) {
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
		filters: w
	} : {
		properties: ["openFile"],
		filters: [{
			name: "BaSyx setup",
			extensions: a
		}]
	}, s = r ? await u.showOpenDialog(r, o) : await u.showOpenDialog(o);
	return s.canceled ? [] : Promise.all(s.filePaths.slice(0, 20).map((e) => i(e, "open")));
}
function G(e) {
	let t = !1;
	e.on("close", (n) => {
		if (t) return;
		n.preventDefault();
		let r = j;
		V("desktop/state").then((e) => e.unsavedWorkspaces).catch(() => []).then(async (n) => {
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
					j = !1;
					return;
				}
			}
			t = !0, r ? l.quit() : e.close();
		});
	});
}
function K() {
	return s(l.getAppPath(), "build", "icon.png");
}
async function q() {
	U(), !l.isPackaged && process.platform === "darwin" && l.dock?.setIcon(K());
	let e = process.env.VITE_DEV_SERVER_URL;
	if (!l.isPackaged) {
		if (!e) throw Error("The Electron development server URL is missing.");
		O = M(e), await B(O);
		return;
	}
	let t = await I();
	O = t.url, k = t.launchSecret, await B(O, k);
}
function J(e) {
	let t = e instanceof Error ? e.message : "Unknown startup error.";
	u.showErrorBox("BaSyx Studio could not start", t), l.quit();
}
process.env.STUDIO_USER_DATA_DIR && l.setPath("userData", process.env.STUDIO_USER_DATA_DIR), l.requestSingleInstanceLock() ? (l.on("second-instance", () => {
	let [e] = c.getAllWindows();
	e && (e.isMinimized() && e.restore(), e.focus());
}), l.whenReady().then(q).catch(J)) : l.quit(), l.on("activate", () => {
	c.getAllWindows().length === 0 && O && B(O, k).catch(J);
}), l.on("before-quit", () => {
	j = !0;
}), l.on("will-quit", () => {
	A?.kill(), A = void 0;
}), l.on("window-all-closed", () => {
	process.platform !== "darwin" && l.quit();
});
//#endregion
export {};
