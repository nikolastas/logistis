export interface UploadResponse {
  created: number;
  skipped?: number;
  bankSource: string;
  ownerId?: string | null;
  sample: Array<{ id: string; date: string; description: string; amount: number; categoryId: string }>;
}

export async function uploadStatement(
  file: File,
  bank: string,
  options?: { ownerId?: string | null; householdId?: string | null }
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("bank", bank);
  if (options?.ownerId) form.append("ownerId", options.ownerId);
  if (options?.householdId) form.append("householdId", options.householdId);

  const res = await fetch(
    `${import.meta.env.VITE_API_URL || ""}/api/statements/upload`,
    {
      method: "POST",
      body: form,
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}
