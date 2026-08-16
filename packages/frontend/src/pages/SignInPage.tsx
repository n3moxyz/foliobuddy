import { Link } from 'react-router-dom';
import { SignIn } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import { ArrowLeft } from 'lucide-react';
import { BrandMark } from '@/components/layout/BrandMark';
import { useThemeStore, resolveTheme } from '@/stores/themeStore';

/** Signed-out sign-in screen (moved out of App.tsx when the public landing took /). */
export default function SignInPage() {
  const theme = useThemeStore((state) => state.theme);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="space-y-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <BrandMark className="mb-1 h-14 w-14" />
          <h1 className="text-3xl font-bold">FolioBuddy</h1>
          <p className="text-muted-foreground">Sign in to track your portfolio</p>
        </div>
        <SignIn
          fallbackRedirectUrl="/"
          appearance={{
            baseTheme: resolveTheme(theme) === 'dark' ? dark : undefined,
            elements: {
              rootBox: 'mx-auto',
              card: 'shadow-sm border',
            },
          }}
        />
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to overview
        </Link>
      </div>
    </div>
  );
}
