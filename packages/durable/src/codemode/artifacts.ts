import type { Context, JsonValue } from "@earendil-works/chord";
import type { ExecutionEnv } from "../env/index.ts";
import type { TaskId } from "../types.ts";

/** JSON state persisted with a code mode task and passed to every artifact write, including after a restart. */
export type ArtifactScope = JsonValue;

/** A stable, host-readable reference, such as a filesystem path or a custom URI. */
export type ArtifactRef = string;

/** Storage for complete text output and images. Read-back, permissions, and retention belong to the host. */
export interface CodemodeArtifactStore {
	/** Stable store identity. Distinguish implementations and incompatible storage destinations. */
	readonly type: string;
	/** Scope and replay contract version; change it when scope, naming, or reference semantics become incompatible. */
	readonly version: number;
	/**
	 * Called lazily when the task first needs an artifact. The scope is committed before any write.
	 * A crash before that commit can repeat initialization; use taskId for idempotency when needed.
	 * Return null when no per-task state is needed. Do not put credentials in the persisted scope.
	 */
	initialize(taskId: TaskId, context: Context): Promise<ArtifactScope>;
	/**
	 * Overwrite the named artifact and return the same reference for the same scope and name on replay.
	 * Names are output.txt and image-N.<extension>. Different images may be written concurrently.
	 * Treat scope as read-only. Throw on failure; the result reports the error without discarding script output.
	 * Both methods must honor context cancellation.
	 */
	write(scope: ArtifactScope, name: string, data: string | Uint8Array, context: Context): Promise<ArtifactRef>;
}

/** The default store keeps the existing execution environment's temporary-file behavior. */
export function filesystemArtifactStore(env: ExecutionEnv): CodemodeArtifactStore {
	return {
		type: "pi.filesystem",
		version: 1,
		async initialize(_taskId, context) {
			const created = await env.createTempDir("pi-codemode-", context);
			if (!created.ok) throw new Error(created.error.message);
			return created.value;
		},
		async write(scope, name, data, context) {
			if (typeof scope !== "string") throw new Error("Invalid filesystem artifact scope");
			const path = `${scope}/${name}`;
			const written = await env.writeFile(path, data, context);
			if (!written.ok) throw new Error(written.error.message);
			return path;
		},
	};
}
