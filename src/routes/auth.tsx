import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import logo from "@/assets/printball-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Admin sign in — PrintBall Attendance" },
      {
        name: "description",
        content: "Sign in to manage PrintBall staff records and attendance history.",
      },
      { property: "og:title", content: "Admin sign in — PrintBall Attendance" },
      {
        property: "og:description",
        content: "Sign in to manage PrintBall staff records and attendance history.",
      },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          ...parsed.data,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        if (data.session) {
          navigate({ to: "/admin", replace: true });
        } else {
          setSent(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
        navigate({ to: "/admin", replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-ink px-5 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src={logo} alt="PrintBall" width={56} height={56} className="mx-auto size-14" />
          <CardTitle className="mt-2">PrintBall Admin</CardTitle>
          <CardDescription>
            {mode === "signin" ? "Sign in to manage staff and attendance" : "Create the admin login"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center text-sm">
              <p>
                Check <span className="font-semibold">{email}</span> and click the confirmation link
                to finish creating the admin login.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
                Back
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create admin account"}
              </Button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin"
                  ? "First time? Create the admin account"
                  : "Already have an account? Sign in"}
              </button>
            </form>
          )}
          <div className="mt-6 text-center">
            <Link
              to="/"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to attendance screen
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
