/**
 * Shared helper for the Phase 2/3 direct-to-R2 upload flow.
 *
 * Each surface (chat / task / report / document / feedback) has its own
 * `<endpoint>/sign` route on the server that, when R2 is enabled, returns
 * a presigned PUT URL plus any DB row metadata (e.g. `{ attachment }` for
 * tasks). When R2 is disabled, the sign route returns 501, the caller
 * falls back to its existing multipart endpoint.
 *
 * This helper handles only the sign-then-PUT half. Callers handle their
 * own multipart fallback because each surface's response shape differs.
 *
 * Returns `{ ok: false, reason: 'r2-disabled' }` for 501 (the expected
 * "no R2 configured yet" path), `'sign-failed'` for other server errors,
 * and `'put-failed'` for R2 PUT errors.
 */

import { getApiClientConfig } from "./client";

export type R2UploadResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: "r2-disabled" | "sign-failed" | "put-failed" };

export async function tryDirectR2Upload(opts: {
  signEndpoint: string;
  signBody: Record<string, unknown>;
  file: File;
  onProgress?: (pct: number) => void;
}): Promise<R2UploadResult> {
  const cfg = getApiClientConfig();
  if (!cfg) return { ok: false, reason: "sign-failed" };

  let signRes: Response;
  try {
    signRes = await fetch(`${cfg.apiBase}${opts.signEndpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({
        filename: opts.file.name,
        contentType: opts.file.type || "application/octet-stream",
        size: opts.file.size,
        ...opts.signBody,
      }),
    });
  } catch {
    return { ok: false, reason: "sign-failed" };
  }

  if (signRes.status === 501) return { ok: false, reason: "r2-disabled" };
  if (!signRes.ok) return { ok: false, reason: "sign-failed" };

  const data = (await signRes.json()) as Record<string, unknown>;
  const uploadUrl = data.uploadUrl as string | undefined;
  if (!uploadUrl) return { ok: false, reason: "sign-failed" };

  // PUT directly to R2 with XHR so we can drive a progress callback.
  // (fetch() never exposes upload progress — the same reason MessageInput
  // uses XHR for its main upload path.)
  return new Promise<R2UploadResult>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader(
      "Content-Type",
      opts.file.type || "application/octet-stream",
    );
    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          opts.onProgress!(Math.round((e.loaded / e.total) * 100));
        }
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true, data });
      } else {
        resolve({ ok: false, reason: "put-failed" });
      }
    };
    xhr.onerror = () => resolve({ ok: false, reason: "put-failed" });
    xhr.onabort = () => resolve({ ok: false, reason: "put-failed" });
    xhr.send(opts.file);
  });
}
