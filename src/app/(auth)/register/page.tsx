import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthForm } from "../AuthForm";
import { registerUser } from "../actions";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return <AuthForm mode="register" action={registerUser} />;
}
