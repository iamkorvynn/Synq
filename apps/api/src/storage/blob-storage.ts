import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface AttachmentBlobStorage {
  driver: "disk";
  write(
    attachmentId: string,
    payload: Uint8Array,
  ): Promise<{ byteLength: number; sha256: string; objectPath: string }>;
  read(attachmentId: string): Promise<Uint8Array>;
  health(): Promise<{ ok: boolean; driver: string }>;
}

export class DiskAttachmentBlobStorage implements AttachmentBlobStorage {
  driver = "disk" as const;

  constructor(private readonly storageDir: string) {}

  private attachmentPath(attachmentId: string) {
    return join(this.storageDir, "attachments", `${attachmentId}.bin`);
  }

  async write(attachmentId: string, payload: Uint8Array) {
    const target = this.attachmentPath(attachmentId);
    await mkdir(join(this.storageDir, "attachments"), { recursive: true });
    await writeFile(target, payload);

    return {
      byteLength: payload.byteLength,
      sha256: createHash("sha256").update(payload).digest("hex"),
      objectPath: target,
    };
  }

  async read(attachmentId: string) {
    const payload = await readFile(this.attachmentPath(attachmentId));
    return new Uint8Array(payload);
  }

  async health() {
    await mkdir(join(this.storageDir, "attachments"), { recursive: true });
    return {
      ok: true,
      driver: this.driver,
    };
  }
}
