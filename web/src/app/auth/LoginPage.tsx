import {
  ArrowLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Github,
  Info,
  Loader2,
  Mail,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";

import { HttpError } from "@/service/http/client";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const COUNTDOWN_KEY = "vc_countdown";
const COUNTDOWN_DURATION = 60_000;
const MOBILE_BP = 768;

const SEND_COUNT_KEY = "vc_send_count";
const CAPTCHA_THRESHOLD = 2;

// Allowed email domains (exact match) and suffix patterns (e.g. .edu, .edu.cn)
const ALLOWED_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "163.com",
  "126.com",
  "qq.com",
  "foxmail.com",
  "yahoo.com",
  "protonmail.com",
  "proton.me",
  "dp.tech",
  "xyzen.ai",
]);
const ALLOWED_SUFFIXES = [".edu.cn", ".edu", ".ac.cn"];

function isEmailAllowed(email: string): boolean {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return false;
  // Block + subaddressing (used for bulk alias registration)
  if (localPart.includes("+")) return false;
  const d = domain.toLowerCase();
  if (ALLOWED_DOMAINS.has(d)) return true;
  return ALLOWED_SUFFIXES.some((suffix) => d.endsWith(suffix));
}

/** 0 = empty, 1 = weak, 2 = fair, 3 = strong */
function getPasswordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  // map 0-5 → 1-3
  if (score <= 1) return 1;
  if (score <= 3) return 2;
  return 3;
}

function isPasswordValid(pw: string): boolean {
  return (
    pw.length >= 8 &&
    /[a-z]/.test(pw) &&
    /[A-Z]/.test(pw) &&
    /[^a-zA-Z0-9]/.test(pw)
  );
}

interface CountdownState {
  email: string;
  expiresAt: number;
}

function loadCountdown(email: string): number {
  try {
    const raw = localStorage.getItem(COUNTDOWN_KEY);
    if (!raw) return 0;
    const state: CountdownState = JSON.parse(raw);
    if (state.email !== email) return 0;
    const remaining = Math.ceil((state.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  } catch {
    return 0;
  }
}

function saveCountdown(email: string): void {
  localStorage.setItem(
    COUNTDOWN_KEY,
    JSON.stringify({ email, expiresAt: Date.now() + COUNTDOWN_DURATION }),
  );
}

function clearCountdown(): void {
  localStorage.removeItem(COUNTDOWN_KEY);
}

// --- Send count helpers (sessionStorage, per email) ---

function loadSendCount(email: string): number {
  try {
    const raw = sessionStorage.getItem(SEND_COUNT_KEY);
    if (!raw) return 0;
    const data: { email: string; count: number } = JSON.parse(raw);
    return data.email === email ? data.count : 0;
  } catch {
    return 0;
  }
}

function incrementSendCount(email: string): number {
  const count = loadSendCount(email) + 1;
  sessionStorage.setItem(SEND_COUNT_KEY, JSON.stringify({ email, count }));
  return count;
}

function clearSendCount(): void {
  sessionStorage.removeItem(SEND_COUNT_KEY);
}

// ---------- Props ----------

interface LoginPageProps {
  onSelectProvider: (casdoorProvider: string) => void;
  onBack: () => void;
  onSendCode?: (
    email: string,
    captchaToken?: string,
  ) => Promise<{ action: "login" | "signup" }>;
  onCodeLogin?: (email: string, code: string) => Promise<void>;
  onSignup?: (email: string, password: string, code: string) => Promise<void>;
  onPasswordLogin?: (email: string, password: string) => Promise<void>;
  onSendResetCode?: (email: string) => Promise<void>;
  onResetPassword?: (
    email: string,
    code: string,
    newPassword: string,
  ) => Promise<void>;
  turnstileSiteKey?: string;
}

// ---------- Component ----------

export function LoginPage({
  onSelectProvider,
  onBack,
  onSendCode,
  onCodeLogin,
  onSignup,
  onPasswordLogin,
  onSendResetCode,
  onResetPassword,
  turnstileSiteKey,
}: LoginPageProps) {
  const { t } = useTranslation();

  // --- shared state ---
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevEmailRef = useRef(email);

  // --- login-specific ---
  const [loggingIn, setLoggingIn] = useState(false);

  // --- signup-specific ---
  const [needsSignup, setNeedsSignup] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signingUp, setSigningUp] = useState(false);

  // --- login password ---
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // --- reset password flow ---
  const [showResetFlow, setShowResetFlow] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [sendingResetCode, setSendingResetCode] = useState(false);

  // --- Turnstile CAPTCHA ---
  const [sendCount, setSendCount] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileScriptLoaded = useRef(false);

  const needsCaptcha = turnstileSiteKey && sendCount >= CAPTCHA_THRESHOLD;

  // --- responsive ---
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BP : false,
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BP);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Restore countdown on mount
  useEffect(() => {
    if (!email) return;
    const remaining = loadCountdown(email);
    if (remaining > 0) {
      setCountdown(remaining);
      setCodeSent(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset when email changes
  useEffect(() => {
    if (email !== prevEmailRef.current) {
      prevEmailRef.current = email;
      setCountdown(0);
      setCodeSent(false);
      setNeedsSignup(false);
      setCode("");
      setPassword("");
      setConfirmPassword("");
      setLoginPassword("");
      setShowResetFlow(false);
      setResetCode("");
      setNewPassword("");
      setConfirmNewPassword("");
      setResetCodeSent(false);
      clearCountdown();
      clearSendCount();
      setSendCount(0);
      setCaptchaToken(null);
      // Clean up Turnstile widget
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetId.current);
        turnstileWidgetId.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [email]);

  // Tick countdown
  useEffect(() => {
    if (countdown <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [countdown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load Turnstile script dynamically when needed
  useEffect(() => {
    if (!needsCaptcha || turnstileScriptLoaded.current) return;

    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      turnstileScriptLoaded.current = true;
      // Render widget if container is ready
      if (
        turnstileRef.current &&
        window.turnstile &&
        !turnstileWidgetId.current
      ) {
        turnstileWidgetId.current = window.turnstile.render(
          turnstileRef.current,
          {
            sitekey: turnstileSiteKey,
            theme: "dark",
            callback: (token: string) => setCaptchaToken(token),
            "expired-callback": () => setCaptchaToken(null),
          },
        );
      }
    };
    document.head.appendChild(script);
  }, [needsCaptcha]);

  // Render Turnstile widget when container ref and script are both ready
  useEffect(() => {
    if (
      needsCaptcha &&
      turnstileScriptLoaded.current &&
      turnstileRef.current &&
      window.turnstile &&
      !turnstileWidgetId.current
    ) {
      turnstileWidgetId.current = window.turnstile.render(
        turnstileRef.current,
        {
          sitekey: turnstileSiteKey,
          theme: "dark",
          callback: (token: string) => setCaptchaToken(token),
          "expired-callback": () => setCaptchaToken(null),
        },
      );
    }
  }, [needsCaptcha]);

  // Cleanup Turnstile widget on unmount
  useEffect(() => {
    return () => {
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetId.current);
        turnstileWidgetId.current = null;
      }
    };
  }, []);

  // --- handlers ---

  const handleSendCode = useCallback(async () => {
    if (!onSendCode || !email.trim() || sendingCode) return;
    const trimmed = email.trim();
    if (trimmed.split("@")[0]?.includes("+")) {
      toast.error(t("auth.login.invalidEmailFormat"));
      return;
    }
    if (!isEmailAllowed(trimmed)) {
      toast.error(t("auth.login.unsupportedDomain"));
      return;
    }
    if (needsCaptcha && !captchaToken) return;
    setSendingCode(true);
    try {
      const { action } = await onSendCode(
        email.trim(),
        needsCaptcha ? (captchaToken ?? undefined) : undefined,
      );
      setCodeSent(true);
      setNeedsSignup(action === "signup");

      if (action === "signup") {
        // Only start countdown and show toast for signup (code was actually sent)
        saveCountdown(email.trim());
        setCountdown(Math.ceil(COUNTDOWN_DURATION / 1000));
        const newCount = incrementSendCount(email.trim());
        setSendCount(newCount);
        toast.success(t("auth.login.codeSent", { email: email.trim() }));
        // Reset Turnstile widget for next use
        if (turnstileWidgetId.current && window.turnstile) {
          window.turnstile.reset(turnstileWidgetId.current);
          setCaptchaToken(null);
        }
      }
      // For login action: no code was sent, just show password field
    } catch (err) {
      console.error("Send code failed:", err);
      toast.error(t("auth.login.sendCodeFailed"), {
        description: err instanceof HttpError ? err.message : undefined,
      });
    } finally {
      setSendingCode(false);
    }
  }, [onSendCode, email, sendingCode, needsCaptcha, captchaToken, t]);

  const handleLoginSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await handleSendCode();
    },
    [handleSendCode],
  );

  const handlePasswordLoginSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!onPasswordLogin || !email.trim() || !loginPassword) return;
      setLoggingIn(true);
      try {
        await onPasswordLogin(email.trim(), loginPassword);
      } catch (err) {
        console.error("Login failed:", err);
        toast.error(t("auth.login.loginFailed"), {
          description: err instanceof HttpError ? err.message : undefined,
        });
      } finally {
        setLoggingIn(false);
      }
    },
    [onPasswordLogin, email, loginPassword, t],
  );

  const handleSignupSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!onSignup || !email.trim() || !code.trim() || !password) return;
      if (password !== confirmPassword) {
        toast.error(t("auth.signup.passwordMismatch"));
        return;
      }
      setSigningUp(true);
      try {
        await onSignup(email.trim(), password, code.trim());
      } catch (err) {
        console.error("Signup failed:", err);
        toast.error(t("auth.signup.signupFailed"), {
          description: err instanceof HttpError ? err.message : undefined,
        });
      } finally {
        setSigningUp(false);
      }
    },
    [onSignup, email, code, password, confirmPassword, t],
  );

  const handleSendResetCode = useCallback(async () => {
    if (!onSendResetCode || !email.trim() || sendingResetCode) return;
    setSendingResetCode(true);
    try {
      await onSendResetCode(email.trim());
      setResetCodeSent(true);
      toast.success(t("auth.login.codeSent", { email: email.trim() }));
    } catch (err) {
      console.error("Send reset code failed:", err);
      toast.error(t("auth.login.sendCodeFailed"), {
        description: err instanceof HttpError ? err.message : undefined,
      });
    } finally {
      setSendingResetCode(false);
    }
  }, [onSendResetCode, email, sendingResetCode, t]);

  const handleResetSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (
        !onResetPassword ||
        !email.trim() ||
        !resetCode.trim() ||
        !newPassword
      )
        return;
      if (newPassword !== confirmNewPassword) {
        toast.error(t("auth.signup.passwordMismatch"));
        return;
      }
      setResetting(true);
      try {
        await onResetPassword(email.trim(), resetCode.trim(), newPassword);
      } catch (err) {
        console.error("Reset password failed:", err);
        toast.error(t("auth.reset.resetFailed"), {
          description: err instanceof HttpError ? err.message : undefined,
        });
      } finally {
        setResetting(false);
      }
    },
    [onResetPassword, email, resetCode, newPassword, confirmNewPassword, t],
  );

  const handleBackToLogin = useCallback(() => {
    setShowResetFlow(false);
    setResetCode("");
    setNewPassword("");
    setConfirmNewPassword("");
    setResetCodeSent(false);
  }, []);

  const canSendCode =
    !!email.trim() &&
    countdown === 0 &&
    !sendingCode &&
    (!needsCaptcha || !!captchaToken);

  // --- sub-components ---

  const passwordToggle = (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => setShowPassword((v) => !v)}
      className="mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/[0.08] hover:text-neutral-300"
    >
      {showPassword ? (
        <EyeOff className="h-4 w-4" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
    </button>
  );

  const loginPasswordToggle = (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => setShowLoginPassword((v) => !v)}
      className="mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/[0.08] hover:text-neutral-300"
    >
      {showLoginPassword ? (
        <EyeOff className="h-4 w-4" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
    </button>
  );

  const inputClass =
    "h-12 w-full rounded-lg bg-white/[0.08] px-4 text-[14px] text-white placeholder-neutral-500 outline-none transition-colors focus:bg-white/[0.12] focus:ring-1 focus:ring-indigo-500/40";

  // Inline resend button (used in code input rows)
  const inlineResendButton = (
    <button
      type="button"
      onClick={handleSendCode}
      disabled={countdown > 0 || sendingCode}
      className="mr-1.5 shrink-0 rounded-md px-2.5 py-1.5 text-[13px] text-neutral-500 transition-colors hover:text-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {countdown > 0
        ? `${t("auth.login.resend")} (${countdown}s)`
        : t("auth.login.resend")}
    </button>
  );

  // Info alert for "code sent" confirmation
  const codeSentAlert = (targetEmail: string) => (
    <div className="flex items-start gap-2.5 rounded-lg bg-indigo-500/[0.08] px-3.5 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
      <p className="text-[13px] leading-relaxed text-indigo-300/90">
        {t("auth.login.codeSent", { email: targetEmail })}
      </p>
    </div>
  );

  // --- Signup form (used in both desktop right-panel & mobile) ---

  const signupForm = (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight text-white">
          {t("auth.signup.title")}
        </h2>
        {codeSentAlert(email.trim())}
      </div>

      <form onSubmit={handleSignupSubmit} className="flex flex-col gap-3">
        {/* Email — readonly, auto-filled from login step */}
        <div className="flex h-12 items-center rounded-lg bg-white/[0.05]">
          <Mail className="ml-4 h-[18px] w-[18px] shrink-0 text-neutral-600" />
          <input
            type="email"
            value={email}
            readOnly
            tabIndex={-1}
            className="min-w-0 flex-1 bg-transparent px-3 text-[14px] text-neutral-400 outline-none"
          />
        </div>

        {/* Password */}
        <div className="flex h-12 items-center rounded-lg bg-white/[0.08] transition-colors focus-within:bg-white/[0.12] focus-within:ring-1 focus-within:ring-indigo-500/40">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.signup.passwordPlaceholder")}
            autoComplete="new-password"
            className="min-w-0 flex-1 bg-transparent px-4 text-[14px] text-white placeholder-neutral-500 outline-none"
          />
          {passwordToggle}
        </div>

        {/* Password strength + requirement hint */}
        {password &&
          (() => {
            const strength = getPasswordStrength(password);
            const valid = isPasswordValid(password);
            const colors = ["", "bg-red-500", "bg-amber-500", "bg-emerald-500"];
            const labels = [
              "",
              t("auth.signup.strengthWeak"),
              t("auth.signup.strengthFair"),
              t("auth.signup.strengthStrong"),
            ];
            const textColors = [
              "",
              "text-red-400",
              "text-amber-400",
              "text-emerald-400",
            ];
            return (
              <div className="-mt-1.5 flex flex-col gap-1.5 px-1">
                <div className="flex items-center gap-2.5">
                  <div className="flex flex-1 gap-1">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= strength ? colors[strength] : "bg-white/[0.08]"
                        }`}
                      />
                    ))}
                  </div>
                  <span className={`text-[11px] ${textColors[strength]}`}>
                    {labels[strength]}
                  </span>
                </div>
                {!valid && (
                  <p className="text-[11px] text-neutral-500">
                    {t("auth.signup.passwordRequirement")}
                  </p>
                )}
              </div>
            );
          })()}

        {/* Confirm password */}
        <input
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={t("auth.signup.confirmPasswordPlaceholder")}
          autoComplete="new-password"
          className={inputClass}
        />

        {/* Verification code — inline resend */}
        <div className="flex h-12 items-center rounded-lg bg-white/[0.08] transition-colors focus-within:bg-white/[0.12] focus-within:ring-1 focus-within:ring-indigo-500/40">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("auth.signup.codePlaceholder")}
            className="min-w-0 flex-1 bg-transparent px-4 text-[14px] text-white placeholder-neutral-500 outline-none"
          />
          {inlineResendButton}
        </div>

        <button
          type="submit"
          disabled={
            signingUp ||
            !code.trim() ||
            !password ||
            !confirmPassword ||
            !isPasswordValid(password)
          }
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 text-[14px] font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {signingUp && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("auth.signup.submit")}
        </button>
      </form>
    </div>
  );

  // --- Login password form (right panel for existing users) ---

  const loginForm = (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight text-white">
          {t("auth.login.submit")}
        </h2>
      </div>

      <form
        onSubmit={handlePasswordLoginSubmit}
        className="flex flex-col gap-3"
      >
        {/* Email — readonly */}
        <div className="flex h-12 items-center rounded-lg bg-white/[0.05]">
          <Mail className="ml-4 h-[18px] w-[18px] shrink-0 text-neutral-600" />
          <input
            type="email"
            value={email}
            readOnly
            tabIndex={-1}
            className="min-w-0 flex-1 bg-transparent px-3 text-[14px] text-neutral-400 outline-none"
          />
        </div>

        {/* Password input with eye toggle */}
        <div className="flex h-12 items-center rounded-lg bg-white/[0.08] transition-colors focus-within:bg-white/[0.12] focus-within:ring-1 focus-within:ring-indigo-500/40">
          <input
            type={showLoginPassword ? "text" : "password"}
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            placeholder={t("auth.login.passwordPlaceholder")}
            autoComplete="current-password"
            className="min-w-0 flex-1 bg-transparent px-4 text-[14px] text-white placeholder-neutral-500 outline-none"
          />
          {loginPasswordToggle}
        </div>

        <button
          type="submit"
          disabled={loggingIn || !loginPassword}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 text-[14px] font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loggingIn && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("auth.login.submit")}
        </button>

        {/* Forgot password link */}
        <button
          type="button"
          onClick={() => setShowResetFlow(true)}
          className="self-start text-[13px] text-neutral-500 transition-colors hover:text-neutral-300"
        >
          {t("auth.login.forgotPassword")}
        </button>
      </form>
    </div>
  );

  // --- Reset password form (right panel) ---

  const resetForm = (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight text-white">
          {t("auth.reset.title")}
        </h2>
      </div>

      <form onSubmit={handleResetSubmit} className="flex flex-col gap-3">
        {/* Email — readonly */}
        <div className="flex h-12 items-center rounded-lg bg-white/[0.05]">
          <Mail className="ml-4 h-[18px] w-[18px] shrink-0 text-neutral-600" />
          <input
            type="email"
            value={email}
            readOnly
            tabIndex={-1}
            className="min-w-0 flex-1 bg-transparent px-3 text-[14px] text-neutral-400 outline-none"
          />
        </div>

        {!resetCodeSent ? (
          <>
            <p className="text-[13px] text-neutral-500">
              {t("auth.reset.description", { email: email.trim() })}
            </p>
            <button
              type="button"
              onClick={handleSendResetCode}
              disabled={sendingResetCode}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-white/[0.08] text-[14px] font-semibold text-white transition-colors hover:bg-white/[0.13] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendingResetCode && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("auth.reset.sendCode")}
            </button>
          </>
        ) : (
          <>
            {codeSentAlert(email.trim())}

            {/* Reset code */}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
              placeholder={t("auth.reset.codePlaceholder")}
              className={inputClass}
            />

            {/* New password */}
            <div className="flex h-12 items-center rounded-lg bg-white/[0.08] transition-colors focus-within:bg-white/[0.12] focus-within:ring-1 focus-within:ring-indigo-500/40">
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("auth.reset.newPasswordPlaceholder")}
                autoComplete="new-password"
                className="min-w-0 flex-1 bg-transparent px-4 text-[14px] text-white placeholder-neutral-500 outline-none"
              />
              {passwordToggle}
            </div>

            {/* Password strength */}
            {newPassword &&
              (() => {
                const strength = getPasswordStrength(newPassword);
                const valid = isPasswordValid(newPassword);
                const colors = [
                  "",
                  "bg-red-500",
                  "bg-amber-500",
                  "bg-emerald-500",
                ];
                const labels = [
                  "",
                  t("auth.signup.strengthWeak"),
                  t("auth.signup.strengthFair"),
                  t("auth.signup.strengthStrong"),
                ];
                const textColors = [
                  "",
                  "text-red-400",
                  "text-amber-400",
                  "text-emerald-400",
                ];
                return (
                  <div className="-mt-1.5 flex flex-col gap-1.5 px-1">
                    <div className="flex items-center gap-2.5">
                      <div className="flex flex-1 gap-1">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i <= strength
                                ? colors[strength]
                                : "bg-white/[0.08]"
                            }`}
                          />
                        ))}
                      </div>
                      <span className={`text-[11px] ${textColors[strength]}`}>
                        {labels[strength]}
                      </span>
                    </div>
                    {!valid && (
                      <p className="text-[11px] text-neutral-500">
                        {t("auth.signup.passwordRequirement")}
                      </p>
                    )}
                  </div>
                );
              })()}

            {/* Confirm new password */}
            <input
              type={showPassword ? "text" : "password"}
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder={t("auth.reset.confirmPasswordPlaceholder")}
              autoComplete="new-password"
              className={inputClass}
            />

            <button
              type="submit"
              disabled={
                resetting ||
                !resetCode.trim() ||
                !newPassword ||
                !confirmNewPassword ||
                !isPasswordValid(newPassword)
              }
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 text-[14px] font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resetting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("auth.reset.submit")}
            </button>
          </>
        )}

        {/* Back to login */}
        <button
          type="button"
          onClick={handleBackToLogin}
          className="self-start text-[13px] text-neutral-500 transition-colors hover:text-neutral-300"
        >
          {t("auth.reset.back")}
        </button>
      </form>
    </div>
  );

  // Determine which form to show on the right panel
  const rightPanelForm = showResetFlow
    ? resetForm
    : needsSignup
      ? signupForm
      : loginForm;

  // --- Mobile step-2: replace entire view ---

  if (isMobile && codeSent) {
    const handleMobileBack = () => {
      if (showResetFlow) {
        handleBackToLogin();
      } else {
        setCodeSent(false);
      }
    };
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-black via-[#05060e] to-[#0a0b16] px-8 md:px-4">
        <button
          type="button"
          onClick={handleMobileBack}
          className="absolute left-5 top-5 flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-white/[0.06] hover:text-neutral-400"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>
        {rightPanelForm}
      </div>
    );
  }

  // --- Desktop / default layout ---

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-black via-[#05060e] to-[#0a0b16]">
      {/* Back — top-left */}
      <button
        type="button"
        onClick={onBack}
        className="absolute left-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-white/[0.06] hover:text-neutral-400"
      >
        <ArrowLeft className="h-[18px] w-[18px]" />
      </button>

      {/* Logo — top-right */}
      <img
        src="/icon.png"
        alt="Xyzen"
        className="absolute right-6 top-6 z-10 h-8 w-8 rounded-lg"
      />

      <div className="relative w-full">
        {/* -------- Login panel — always full-width, slides left via translateX -------- */}
        <motion.div
          animate={{ x: codeSent && !isMobile ? "-25%" : "0%" }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex min-h-screen w-full items-center justify-center px-8 md:px-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[420px]"
          >
            {/* Tagline + Subtitle */}
            <h1 className="whitespace-pre-line text-[28px] font-bold leading-[1.2] tracking-tight text-white md:text-[32px]">
              {t("auth.login.tagline")}
            </h1>
            <p className="mt-4 text-[15px] text-neutral-500">
              {t("auth.login.title")}
            </p>

            {/* OAuth Buttons */}
            <div className="mt-8 flex flex-col gap-3.5">
              <button
                type="button"
                onClick={() => onSelectProvider("provider_github")}
                className="relative flex h-[52px] w-full items-center rounded-lg bg-white/[0.07] text-[14px] font-medium text-white transition-colors hover:bg-white/[0.13] active:bg-white/[0.05]"
              >
                <Github className="absolute left-5 h-5 w-5" />
                <span className="flex-1 text-center">
                  {t("auth.login.github")}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onSelectProvider("provider_google")}
                className="relative flex h-[52px] w-full items-center rounded-lg bg-white/[0.07] text-[14px] font-medium text-white transition-colors hover:bg-white/[0.13] active:bg-white/[0.05]"
              >
                <svg className="absolute left-5 h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span className="flex-1 text-center">
                  {t("auth.login.google")}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onSelectProvider("provider_bohrium")}
                className="relative flex h-[52px] w-full items-center rounded-lg bg-white/[0.07] text-[14px] font-medium text-white transition-colors hover:bg-white/[0.13] active:bg-white/[0.05]"
              >
                <img
                  src="/defaults/icons/bohrium.png"
                  alt="Bohrium"
                  className="absolute left-5 h-5 w-5 rounded"
                />
                <span className="flex-1 text-center">
                  {t("auth.login.bohrium")}
                </span>
              </button>
            </div>

            {/* Divider */}
            {onSendCode && onCodeLogin && (
              <>
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/[0.1]" />
                  <span className="text-xs text-neutral-500">
                    {t("auth.login.divider")}
                  </span>
                  <div className="h-px flex-1 bg-white/[0.1]" />
                </div>

                {/* Email form */}
                <form
                  onSubmit={handleLoginSubmit}
                  className="flex flex-col gap-3"
                >
                  {/* Email input with mail icon + chevron */}
                  <div className="flex h-12 items-center rounded-lg bg-white/[0.08] transition-colors focus-within:bg-white/[0.12] focus-within:ring-1 focus-within:ring-indigo-500/40">
                    <Mail className="ml-4 h-[18px] w-[18px] shrink-0 text-neutral-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("auth.login.emailPlaceholder")}
                      autoComplete="email"
                      className="min-w-0 flex-1 bg-transparent px-3 text-[14px] text-white placeholder-neutral-500 outline-none"
                    />
                    {!codeSent && (
                      <button
                        type="submit"
                        disabled={!canSendCode}
                        className="mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {sendingCode ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ChevronRight className="h-[18px] w-[18px]" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Turnstile CAPTCHA — shown between email and code section */}
                  {needsCaptcha && (
                    <div ref={turnstileRef} className="flex justify-center" />
                  )}
                </form>
              </>
            )}

            {/* Terms */}
            <p className="mt-8 text-xs leading-relaxed text-neutral-600">
              <Trans
                i18nKey="auth.login.terms"
                components={{
                  terms: (
                    <a
                      href="#/terms"
                      className="text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
                    />
                  ),
                  privacy: (
                    <a
                      href="#/privacy"
                      className="text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
                    />
                  ),
                }}
              />
            </p>
          </motion.div>
        </motion.div>

        {/* -------- Divider + Right half: Step-2 panel (desktop, absolute) -------- */}
        <AnimatePresence>
          {codeSent && !isMobile && (
            <>
              {/* Vertical gradient divider */}
              <motion.div
                key="divider"
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 1, scaleY: 1 }}
                exit={{ opacity: 0, scaleY: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="absolute left-1/2 top-1/2 h-80 w-px -translate-x-1/2 -translate-y-1/2 origin-center"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent, rgba(255,255,255,0.12) 50%, transparent)",
                }}
              />

              {/* Right half */}
              <motion.div
                key="step2-half"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 top-0 flex h-full w-1/2 items-center justify-center px-8"
              >
                {rightPanelForm}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
