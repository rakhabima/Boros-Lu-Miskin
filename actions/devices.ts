"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { revokeDevice } from "@/lib/devices";

export async function revokeDeviceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await revokeDevice(user.id, id);
  revalidatePath("/devices");
}
