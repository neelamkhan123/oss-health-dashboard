import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "neelam-ui";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../lib/authContext";
import { ThemeToggle } from "../../layout/AppShell/ThemeToggle";

const API_URL = import.meta.env.VITE_API_URL;

/** The ?error= codes routers/auth.py redirects back with, turned into
 *  something a person can act on. Anything unrecognised shows nothing —
 *  better silent than "Error: undefined". */
const OAUTH_ERRORS: Record<string, string> = {
  oauth_denied:
    "Sign-in was cancelled. Try again, or use your email and password.",
  bad_state: "That sign-in attempt expired. Start again from this page.",
  oauth_failed:
    "We couldn't finish signing you in with that provider. If you already have an account with this email, sign in with your password first.",
};

/** lucide dropped brand/logo marks (Github included) from its icon set —
 *  hence this and GoogleMark below. Unlike Google's fixed four-colour G,
 *  GitHub's mark is monochrome and meant to sit in body text, so it takes
 *  `currentColor` and follows the button's own light/dark styling instead
 *  of pinning a colour of its own. */
function GithubMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

/** lucide has no Google mark — brand logos aren't in scope for an icon set —
 *  so this is Google's own four-colour G. Fixed hex values, not theme
 *  tokens: a brand mark is the one thing that must not restyle per theme. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.8-6.8C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.6c0-1.6-.1-3.2-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.6 7l7.7 6c4.5-4.2 7.1-10.3 7.1-17.5z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.4 0 20.1 0 24s1 7.6 2.6 10.8l7.9-6.2z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup } = useAuth();

  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Shared across the signin/signup tabs rather than reset per-tab — there's
  // no reason revealing your password on one form should re-hide it on the
  // other; it's the same field either way.
  const [showPassword, setShowPassword] = useState(false);
  // Lazy initialiser so the URL is read once at mount, not on every render.
  const [error, setError] = useState<string | null>(
    () =>
      OAUTH_ERRORS[
        new URLSearchParams(window.location.search).get("error") ?? ""
      ] ?? null,
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await (mode === "signin"
        ? login(email, password)
        : signup(email, password));
      // RequireAuth stashed where they were headed before it bounced them
      // here, so a bookmarked repo page survives signing in.
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? "/", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // A real navigation, not fetch. The browser has to leave your origin and
  // land on github.com so the user can approve there — an XHR can't do that,
  // and following the redirect in JS would drop the state cookie the backend
  // just set.
  const goToProvider = (provider: string) => () => {
    window.location.href = `${API_URL}/auth/${provider}/login`;
  };

  const form = (submitLabel: string) => (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
        Email
        <Input
          type="email"
          value={email}
          required
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
        Password
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            value={password}
            required
            // Tells a password manager whether to offer a saved password or
            // generate a new one — it's the difference between the two modes.
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={mode === "signup" ? 8 : undefined}
            onChange={(e) => setPassword(e.target.value)}
            // Room for the toggle button below, so long passwords never run
            // under it.
            className="pr-9"
          />
          <button
            // type="button": inside a <form>, a bare <button> defaults to
            // type="submit" — this one toggles visibility, it doesn't sign
            // anyone in.
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>
      <Button type="submit" loading={isSubmitting} className="mt-1 w-full">
        {submitLabel}
      </Button>
    </form>
  );

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-slate-50 p-6 dark:bg-slate-900">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>OSS Health</CardTitle>
          <CardDescription>Sign in to track repository health.</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="w-full"
              icon={<GithubMark />}
              onClick={goToProvider("github")}
            >
              Continue with GitHub
            </Button>
            <Button
              variant="outline"
              className="w-full"
              icon={<GoogleMark />}
              onClick={goToProvider("google")}
            >
              Continue with Google
            </Button>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            or
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>

          <Tabs
            value={mode}
            onValueChange={(v) => {
              setMode(v);
              setError(null);
            }}
          >
            <TabsList>
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="pt-4">
              {form("Sign in")}
            </TabsContent>
            <TabsContent value="signup" className="pt-4">
              {form("Create account")}
            </TabsContent>
          </Tabs>

          {error ? (
            // role="alert" so it's announced when it appears — it shows up
            // after a submit, with focus still on the form.
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
