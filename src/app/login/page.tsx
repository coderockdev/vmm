import React, { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { getAppPassword, getAppUser } from "../../core/auth/session";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const user = getAppUser();
  const needsPassword = Boolean(getAppPassword());

  return (
    <div className="login-page">
      <Suspense fallback={<div className="login-card">Carregando…</div>}>
        <LoginForm needsPassword={needsPassword} userName={user.name} />
      </Suspense>
    </div>
  );
}
