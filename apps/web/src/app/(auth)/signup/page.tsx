'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    const { error } = await authClient.signUp.email({
        email,
        password,
        name
    });

    if (!error) {
      router.push('/onboarding');
    } else {
      setErrorMessage(error.message ?? 'Unable to create your account.');
    }

    setIsSubmitting(false);
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50 p-4">
      <form onSubmit={handleSignup} className="flex flex-col gap-4 p-8 bg-white shadow rounded-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4">Create Your RanchOS Account</h1>
        <input 
          type="text" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="Full Name" 
          className="border p-2 rounded"
          required
        />
        <input 
          type="email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          placeholder="Work Email" 
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
        <button type="submit" disabled={isSubmitting} className="bg-green-600 text-white p-2 text-lg font-medium rounded hover:bg-green-700 mt-2 disabled:cursor-not-allowed disabled:opacity-60">
          {isSubmitting ? 'Creating account...' : 'Start Free Trial'}
        </button>
        <p className="text-sm text-center mt-4 text-gray-600">
          Already have an account? <Link href="/login" className="text-green-600 underline">Log in here</Link>.
        </p>
      </form>
    </div>
  );
}
