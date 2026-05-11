// 내 사용자 정보 조회/수정/탈퇴 서버 액션입니다.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteMeServer, logoutServer, updateNicknameServer } from "../../src/auth/api.server";

export async function handleNicknameUpdate(formData: FormData) {
  "use server";
  const nickname = String(formData.get("nickname") ?? "").trim();
  if (!nickname) return;
  await updateNicknameServer(nickname);
  revalidatePath("/me");
}

export async function handleLogout() {
  "use server";
  await logoutServer();
  redirect("/login");
}

export async function handleDelete() {
  "use server";
  await deleteMeServer();
  redirect("/login");
}
