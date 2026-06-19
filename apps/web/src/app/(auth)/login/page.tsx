'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { fetchOnboardingStatus, resolvePostAuthRedirect } from '@/lib/onboarding';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    const { error } = await authClient.signIn.email({
        email,
        password
    });

    if (!error) {
      try {
        const status = await fetchOnboardingStatus();
        router.push(resolvePostAuthRedirect(status));
      } catch {
        router.push('/');
      }
    } else {
      setErrorMessage(error.message ?? 'Unable to sign in.');
    }

    setIsSubmitting(false);
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50">
      <form onSubmit={handleLogin} className="flex flex-col gap-4 p-8 bg-white shadow rounded-lg w-96">
        <h1 className="text-2xl font-bold mb-4">RanchOS Login</h1>
        <input 
          type="email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          placeholder="Email" 
          className="border p-2 rounded"
          required
        />
        <input 
          type="password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          placeholder="Password" 
          className="border p-2 rounded"
          required
        />
        {errorMessage ? (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}
        <button type="submit" disabled={isSubmitting} className="bg-green-600 text-white p-2 rounded hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
          {isSubmitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
